// @ts-nocheck
const prisma = require("../config/database").default;
const supabase = require("../config/supabase");
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");

const BUCKET = "papers";

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const resolveEducator = async (userId) => {
  const educator = await prisma.educators.findUnique({
    where: { user_id: userId },
    include: { schools: true },
  });
  if (!educator) throw new ForbiddenError("Educator profile not found");
  return educator;
};

// Map DB round_state → frontend-friendly status
// Learners can be registered until a round closes
const REGISTRABLE_STATES = new Set(["scheduled", "open"]);

const mapRoundState = (state) => {
  switch (state) {
    case "scheduled":
      return "upcoming";
    case "open":
      return "open";
    default: // closed, marking, results_released
      return "closed";
  }
};

// ─────────────────────────────────────────
// LIST EDUCATOR'S ROUNDS
//
// Returns every round belonging to an olympiad
// that the educator's school is registered for.
// ─────────────────────────────────────────
const listEducatorRounds = async (userId) => {
  const educator = await resolveEducator(userId);

  // Olympiads this school is registered for
  const registrations = await prisma.school_registrations.findMany({
    where: { school_id: educator.school_id },
    include: {
      olympiads: {
        include: {
          rounds: {
            orderBy: { opens_at: "asc" },
            include: {
              papers: { select: { id: true, file_url: true } },
              _count: {
                select: { submissions: true, entrant_registrations: true },
              },
            },
          },
        },
      },
    },
  });

  // Flatten & deduplicate rounds across olympiads
  const seen = new Set();
  const rounds = [];

  for (const reg of registrations) {
    for (const round of reg.olympiads.rounds) {
      if (seen.has(round.id)) continue;
      seen.add(round.id);
      rounds.push({
        id: round.id,
        name: round.name,
        olympiad_id: round.olympiad_id,
        olympiad_name: reg.olympiads.name,
        // Round times are shown in the olympiad's timezone
        timezone: reg.olympiads.timezone,
        opens_at: round.opens_at,
        closes_at: round.closes_at,
        state: round.state,
        status: mapRoundState(round.state),
        has_paper: round.papers.length > 0 && !!round.papers[0].file_url,
        submission_count: round._count.submissions,
        entrant_count: round._count.entrant_registrations,
      });
    }
  }

  rounds.sort((a, b) => new Date(a.opens_at) - new Date(b.opens_at));

  return {
    rounds,
    school: {
      id: educator.schools.id,
      name: educator.schools.name,
    },
  };
};

// ─────────────────────────────────────────
// GET ROUND DETAIL (educator-scoped)
//
// Returns full round info including paper,
// submission status, and results availability.
// ─────────────────────────────────────────
const getEducatorRoundDetail = async (roundId, userId) => {
  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: {
      olympiads: true,
      papers: true,
      _count: { select: { submissions: true, entrant_registrations: true } },
    },
  });

  if (!round) throw new NotFoundError("Round not found");

  // Verify school is registered for this olympiad
  const registration = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: round.olympiads.id,
    },
  });
  if (!registration) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  // Every submission for this school's learners in the round (captured by
  // any educator, or sat online), so the page can show who is done and
  // offer the rest
  const submissions = await prisma.submissions.findMany({
    where: { round_id: roundId, entrants: { school_id: educator.school_id } },
    include: { entrants: { select: { id: true, full_name: true } } },
    orderBy: { received_at: "desc" },
  });

  const paper = round.papers[0] || null;

  return {
    id: round.id,
    name: round.name,
    olympiad_id: round.olympiad_id,
    olympiad_name: round.olympiads.name,
    timezone: round.olympiads.timezone,
    opens_at: round.opens_at,
    closes_at: round.closes_at,
    results_release_at: round.results_release_at,
    state: round.state,
    status: mapRoundState(round.state),
    paper: paper
      ? {
          id: paper.id,
          title: paper.title,
          has_paper: !!paper.file_url,
          has_memo: !!paper.memo_file_url,
        }
      : null,
    submissions: submissions.map((s) => ({
      id: s.id,
      entrant: s.entrants,
      received_at: s.received_at,
      status: s.status,
      route: s.route,
    })),
    // Matches getResults, which only serves released results
    results_available: round.state === "results_released",
    school: {
      id: educator.schools.id,
      name: educator.schools.name,
    },
  };
};

// ─────────────────────────────────────────
// REGISTER ENTRANTS FOR A ROUND (B4)
//
// Upserts entrant records and creates
// entrant_registrations.  Returns the full
// list of registered entrants for the round.
//
// Round-progression rule: if a previous round
// in the same olympiad has released results,
// only entrants who qualified in that round
// may be registered for this one.  The first
// round (or any round whose predecessor has
// not released results yet) has no restriction.
// ─────────────────────────────────────────
const registerEntrants = async (roundId, userId, entrantsData) => {
  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  // School must be registered for the olympiad
  const registration = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: round.olympiads.id,
    },
  });
  if (!registration) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  if (!REGISTRABLE_STATES.has(round.state)) {
    throw new BadRequestError(
      "Entrants can't be registered once a round has closed",
    );
  }

  // ── Round-progression check ───────────────────────
  // Find the immediately preceding round in the same
  // olympiad (by opens_at).  If it has released results
  // we require entrants to have qualified in it.
  const previousRound = await prisma.rounds.findFirst({
    where: {
      olympiad_id: round.olympiads.id,
      opens_at: { lt: round.opens_at },
    },
    orderBy: { opens_at: "desc" },
  });

  // Build a set of entrant IDs that qualified in the
  // previous round (only relevant when results are out).
  let qualifiedEntrantIds = null; // null = no restriction
  if (previousRound && previousRound.state === "results_released") {
    const qualifiedResults = await prisma.results.findMany({
      where: {
        round_id: previousRound.id,
        qualified: true,
        entrants: { school_id: educator.school_id },
      },
      select: { entrant_id: true },
    });
    qualifiedEntrantIds = new Set(qualifiedResults.map((r) => r.entrant_id));
  }

  // Register each entrant in a transaction
  const registered = await prisma.$transaction(async (tx) => {
    const results = [];

    for (const e of entrantsData) {
      // Find the existing entrant (keyed by school + external_ref,
      // falling back to school + full_name when no ref is given)
      let entrant = await tx.entrants.findFirst({
        where: e.external_ref
          ? { school_id: educator.school_id, external_ref: e.external_ref }
          : { school_id: educator.school_id, full_name: e.full_name },
      });

      if (entrant) {
        entrant = await tx.entrants.update({
          where: { id: entrant.id },
          data: {
            full_name: e.full_name,
            grade: e.grade?.toString(),
          },
        });
      } else {
        entrant = await tx.entrants.create({
          data: {
            school_id: educator.school_id,
            full_name: e.full_name,
            grade: e.grade?.toString(),
            external_ref: e.external_ref || null,
          },
        });
      }

      // ── Enforce progression: must have qualified ──
      if (qualifiedEntrantIds !== null && !qualifiedEntrantIds.has(entrant.id)) {
        throw new BadRequestError(
          `${e.full_name} did not qualify in the previous round ("${previousRound.name}") and cannot be registered for this round.`,
        );
      }

      // Create registration (upsert to handle duplicates)
      await tx.entrant_registrations.upsert({
        where: {
          entrant_id_round_id: {
            entrant_id: entrant.id,
            round_id: roundId,
          },
        },
        update: { status: "registered" },
        create: {
          entrant_id: entrant.id,
          round_id: roundId,
          registered_by: educator.id,
          status: "registered",
        },
      });

      results.push(entrant);
    }

    return results;
  });

  return registered;
};

// ─────────────────────────────────────────
// LIST ENTRANTS FOR A ROUND
//
// Returns entrants registered by this
// educator's school for the given round.
// ─────────────────────────────────────────
const listEntrants = async (roundId, userId) => {
  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    select: { olympiad_id: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  const schoolRegistration = await prisma.school_registrations.findFirst({
    where: { school_id: educator.school_id, olympiad_id: round.olympiad_id },
  });
  if (!schoolRegistration) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  const registrations = await prisma.entrant_registrations.findMany({
    where: {
      round_id: roundId,
      entrants: { school_id: educator.school_id },
    },
    include: {
      entrants: {
        select: {
          id: true,
          full_name: true,
          grade: true,
          external_ref: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });

  return registrations.map((r) => ({
    id: r.entrants.id,
    full_name: r.entrants.full_name,
    grade: r.entrants.grade,
    external_ref: r.entrants.external_ref,
    registered_at: r.created_at,
  }));
};

// ─────────────────────────────────────────
// GET RESULTS FOR EDUCATOR'S SCHOOL (B15)
//
// Results are only visible once the round
// reaches results_released state.
// ─────────────────────────────────────────
const getResults = async (roundId, userId) => {
  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  // B15: Results are only available once released
  if (round.state !== "results_released") {
    throw new BadRequestError(
      `Results are not yet available — round is "${round.state}"`,
    );
  }

  const results = await prisma.results.findMany({
    where: {
      round_id: roundId,
      entrants: { school_id: educator.school_id },
    },
    include: {
      entrants: {
        select: {
          id: true,
          full_name: true,
          grade: true,
          external_ref: true,
        },
      },
    },
    orderBy: { rank: "asc" },
  });

  return {
    round: {
      id: round.id,
      name: round.name,
      state: round.state,
      closes_at: round.closes_at,
    },
    results: results.map((r) => ({
      id: r.id,
      rank: r.rank,
      total_points: r.total_points,
      qualified: r.qualified,
      entrant: {
        id: r.entrants.id,
        full_name: r.entrants.full_name,
        grade: r.entrants.grade,
        external_ref: r.entrants.external_ref,
      },
    })),
  };
};

// ─────────────────────────────────────────
// LIST RESULTS ACROSS ALL ROUNDS (B15)
//
// For the Results page — only rounds that
// have released results.
// ─────────────────────────────────────────
const listAllResults = async (userId) => {
  const educator = await resolveEducator(userId);

  // Get olympiads this school is registered for
  const registrations = await prisma.school_registrations.findMany({
    where: { school_id: educator.school_id },
    select: { olympiad_id: true },
  });
  const olympiadIds = registrations.map((r) => r.olympiad_id);

  // Get rounds with released results
  const rounds = await prisma.rounds.findMany({
    where: {
      olympiad_id: { in: olympiadIds },
      state: "results_released",
    },
    orderBy: { closes_at: "desc" },
    include: {
      olympiads: { select: { name: true, timezone: true } },
      results: {
        where: { entrants: { school_id: educator.school_id } },
        include: {
          entrants: {
            select: {
              id: true,
              full_name: true,
              grade: true,
              external_ref: true,
            },
          },
        },
        orderBy: { rank: "asc" },
      },
    },
  });

  return rounds.map((r) => ({
    id: r.id,
    name: r.name,
    olympiad_name: r.olympiads.name,
    timezone: r.olympiads.timezone,
    closes_at: r.closes_at,
    results: r.results.map((res) => ({
      id: res.id,
      rank: res.rank,
      total_points: res.total_points,
      qualified: res.qualified,
      entrant: {
        id: res.entrants.id,
        full_name: res.entrants.full_name,
        grade: res.entrants.grade,
        external_ref: res.entrants.external_ref,
      },
    })),
  }));
};

// ─────────────────────────────────────────
// LIST PAST PAPERS (B11)
//
// Returns papers from earlier closed rounds
// in the same olympiad, for educator download.
// ─────────────────────────────────────────
const listPastPapers = async (roundId, userId) => {
  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  // Verify school is registered
  const registration = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: round.olympiads.id,
    },
  });
  if (!registration) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  // Find earlier rounds that are closed (or further along)
  const pastRounds = await prisma.rounds.findMany({
    where: {
      olympiad_id: round.olympiad_id,
      closes_at: { lt: round.opens_at },
      state: { in: ["closed", "marking", "results_released"] },
    },
    orderBy: { closes_at: "desc" },
    include: { papers: true },
  });

  const papers = [];
  for (const r of pastRounds) {
    const paper = r.papers[0];
    if (paper && paper.file_url) {
      papers.push({
        id: paper.id,
        round_id: r.id,
        round_name: r.name,
        title: paper.title,
        closed_at: r.closes_at,
        timezone: round.olympiads.timezone,
        has_paper: !!paper.file_url,
        has_memo: !!paper.memo_file_url,
      });
    }
  }

  return papers;
};

// ─────────────────────────────────────────
// GET PAPER DOWNLOAD URL (B7 + B11)
//
// Enforces round-open check: educators
// cannot download papers before the round
// opens.  Returns a signed Supabase URL.
// ─────────────────────────────────────────
const getPaperDownloadUrl = async (roundId, userId, type) => {
  if (!supabase) {
    throw new BadRequestError("File storage is not configured on this server");
  }

  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true, papers: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  // Verify school registration
  const registration = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: round.olympiads.id,
    },
  });
  if (!registration) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  // B7: Prevent downloading before the round opens
  if (round.state === "scheduled") {
    throw new BadRequestError(
      "Paper is not available yet — the round has not opened",
    );
  }

  const paper = round.papers[0];
  if (!paper) throw new NotFoundError("No paper uploaded for this round");

  // Educators can download the paper; memo stays organiser-only
  if (type === "memo") {
    throw new ForbiddenError("Only the organiser can download the memo");
  }

  const path = paper.file_url;
  if (!path) throw new NotFoundError("No paper uploaded for this round");

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (error) {
    throw new BadRequestError(
      `Could not generate download link: ${error.message}`,
    );
  }

  return data.signedUrl;
};

// ─────────────────────────────────────────
// GET PROGRESSION INFO FOR A ROUND
//
// Returns whether the round requires entrants
// to have qualified from a previous round, and
// the list of eligible (qualified) entrant IDs.
// The frontend uses this to show warnings on the
// entrants registration page.
// ─────────────────────────────────────────
const getProgressionInfo = async (roundId, userId) => {
  const educator = await resolveEducator(userId);

  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  // Verify school is registered
  const registration = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: round.olympiads.id,
    },
  });
  if (!registration) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  // Find the immediately preceding round
  const previousRound = await prisma.rounds.findFirst({
    where: {
      olympiad_id: round.olympiads.id,
      opens_at: { lt: round.opens_at },
    },
    orderBy: { opens_at: "desc" },
  });

  // No previous round = no restriction
  if (!previousRound || previousRound.state !== "results_released") {
    return {
      requiresQualification: false,
      previousRound: null,
      qualifiedEntrantIds: [],
    };
  }

  // Fetch qualified entrant IDs from the previous round
  const qualifiedResults = await prisma.results.findMany({
    where: {
      round_id: previousRound.id,
      qualified: true,
      entrants: { school_id: educator.school_id },
    },
    select: { entrant_id: true },
  });

  return {
    requiresQualification: true,
    previousRound: {
      id: previousRound.id,
      name: previousRound.name,
      qualifyingThreshold: previousRound.qualifying_threshold
        ? Number(previousRound.qualifying_threshold)
        : null,
    },
    qualifiedEntrantIds: qualifiedResults.map((r) => r.entrant_id),
  };
};

// ─────────────────────────────────────────
// REGISTER ENTRANTS FOR AN OLYMPIAD
//
// Upserts entrant records and creates
// entrant_registrations for every eligible
// round in the olympiad.  The first round
// is always registered; subsequent rounds
// require the entrant to have qualified in
// the preceding round (when results are
// already released).
// ─────────────────────────────────────────
const registerEntrantsForOlympiad = async (olympiadId, userId, entrantsData) => {
  const educator = await resolveEducator(userId);

  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
  });
  if (!olympiad) throw new NotFoundError("Olympiad not found");

  // School must be registered for the olympiad
  const schoolReg = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: olympiadId,
    },
  });
  if (!schoolReg) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  // Get all rounds ordered by opens_at
  const rounds = await prisma.rounds.findMany({
    where: { olympiad_id: olympiadId },
    orderBy: { opens_at: "asc" },
  });

  if (rounds.length === 0) {
    throw new BadRequestError("No rounds found for this olympiad");
  }
  if (!rounds.some((r) => REGISTRABLE_STATES.has(r.state))) {
    throw new BadRequestError(
      "Every round in this olympiad has closed, so no one can be registered",
    );
  }

  const registered = await prisma.$transaction(async (tx) => {
    const results = [];

    for (const e of entrantsData) {
      // Find or create the entrant record
      let entrant = await tx.entrants.findFirst({
        where: e.external_ref
          ? { school_id: educator.school_id, external_ref: e.external_ref }
          : { school_id: educator.school_id, full_name: e.full_name },
      });

      if (entrant) {
        entrant = await tx.entrants.update({
          where: { id: entrant.id },
          data: {
            full_name: e.full_name,
            grade: e.grade?.toString(),
          },
        });
      } else {
        entrant = await tx.entrants.create({
          data: {
            school_id: educator.school_id,
            full_name: e.full_name,
            grade: e.grade?.toString(),
            external_ref: e.external_ref || null,
          },
        });
      }

      // Register for each eligible round
      const registeredRounds = [];

      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];

        // Closed rounds take no new registrations
        if (!REGISTRABLE_STATES.has(round.state)) continue;

        // First round: always register
        if (i > 0) {
          const prevRound = rounds[i - 1];
          if (prevRound.state === "results_released") {
            // Must have qualified in the previous round
            const qualified = await tx.results.findFirst({
              where: {
                round_id: prevRound.id,
                entrant_id: entrant.id,
                qualified: true,
              },
            });
            if (!qualified) continue; // skip this round
          }
          // If previous round results not released, register tentatively
        }

        // Upsert the registration
        await tx.entrant_registrations.upsert({
          where: {
            entrant_id_round_id: {
              entrant_id: entrant.id,
              round_id: round.id,
            },
          },
          update: { status: "registered" },
          create: {
            entrant_id: entrant.id,
            round_id: round.id,
            registered_by: educator.id,
            status: "registered",
          },
        });

        registeredRounds.push({ id: round.id, name: round.name });
      }

      results.push({
        id: entrant.id,
        full_name: entrant.full_name,
        grade: entrant.grade,
        external_ref: entrant.external_ref,
        rounds: registeredRounds,
      });
    }

    return results;
  });

  return registered;
};

// ─────────────────────────────────────────
// LIST ENTRANTS FOR AN OLYMPIAD
//
// Returns all entrants registered for any
// round in the olympiad, with the list of
// rounds each entrant is registered for.
// ─────────────────────────────────────────
const listOlympiadEntrants = async (olympiadId, userId) => {
  const educator = await resolveEducator(userId);

  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
  });
  if (!olympiad) throw new NotFoundError("Olympiad not found");

  // Verify school is registered
  const schoolReg = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: olympiadId,
    },
  });
  if (!schoolReg) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  // Get all rounds in the olympiad
  const rounds = await prisma.rounds.findMany({
    where: { olympiad_id: olympiadId },
    select: { id: true, name: true },
    orderBy: { opens_at: "asc" },
  });
  const roundIds = rounds.map((r) => r.id);

  const registrations = await prisma.entrant_registrations.findMany({
    where: {
      round_id: { in: roundIds },
      entrants: { school_id: educator.school_id },
    },
    include: {
      entrants: {
        select: {
          id: true,
          full_name: true,
          grade: true,
          external_ref: true,
        },
      },
      rounds: {
        select: { id: true, name: true },
      },
    },
    orderBy: { created_at: "asc" },
  });

  // Group by entrant
  const entrantMap = new Map();
  for (const reg of registrations) {
    const e = reg.entrants;
    if (!entrantMap.has(e.id)) {
      entrantMap.set(e.id, {
        id: e.id,
        full_name: e.full_name,
        grade: e.grade,
        external_ref: e.external_ref,
        rounds: [],
      });
    }
    entrantMap.get(e.id).rounds.push(reg.rounds);
  }

  return Array.from(entrantMap.values());
};

// ─────────────────────────────────────────
// GET PROGRESSION INFO FOR AN OLYMPIAD
//
// Returns per-round progression info so
// the frontend can display which rounds
// require qualification.
// ─────────────────────────────────────────
const getOlympiadProgressionInfo = async (olympiadId, userId) => {
  const educator = await resolveEducator(userId);

  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
  });
  if (!olympiad) throw new NotFoundError("Olympiad not found");

  // Verify school is registered
  const schoolReg = await prisma.school_registrations.findFirst({
    where: {
      school_id: educator.school_id,
      olympiad_id: olympiadId,
    },
  });
  if (!schoolReg) {
    throw new ForbiddenError(
      "Your school is not registered for this olympiad",
    );
  }

  const rounds = await prisma.rounds.findMany({
    where: { olympiad_id: olympiadId },
    orderBy: { opens_at: "asc" },
  });

  const roundProgression = [];

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];

    if (i === 0) {
      roundProgression.push({
        roundId: round.id,
        roundName: round.name,
        requiresQualification: false,
        previousRound: null,
        state: round.state,
      });
      continue;
    }

    const prevRound = rounds[i - 1];
    const requiresQual = prevRound.state === "results_released";

    let qualifiedEntrantIds = [];
    if (requiresQual) {
      const qualifiedResults = await prisma.results.findMany({
        where: {
          round_id: prevRound.id,
          qualified: true,
          entrants: { school_id: educator.school_id },
        },
        select: { entrant_id: true },
      });
      qualifiedEntrantIds = qualifiedResults.map((r) => r.entrant_id);
    }

    roundProgression.push({
      roundId: round.id,
      roundName: round.name,
      requiresQualification: requiresQual,
      previousRound: requiresQual
        ? {
            id: prevRound.id,
            name: prevRound.name,
            qualifyingThreshold: prevRound.qualifying_threshold
              ? Number(prevRound.qualifying_threshold)
              : null,
          }
        : null,
      qualifiedEntrantIds,
      state: round.state,
    });
  }

  return { rounds: roundProgression };
};

module.exports = {
  listEducatorRounds,
  getEducatorRoundDetail,
  registerEntrants,
  registerEntrantsForOlympiad,
  listEntrants,
  listOlympiadEntrants,
  getProgressionInfo,
  getOlympiadProgressionInfo,
  getResults,
  listAllResults,
  listPastPapers,
  getPaperDownloadUrl,
};
