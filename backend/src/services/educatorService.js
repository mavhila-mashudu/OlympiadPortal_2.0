// @ts-nocheck
const prisma = require("../config/database").default;
const supabase = require("../config/supabase");
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");
const { recalculateRoundResults } = require("./resultRecalculationService");

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

// Importing a class list writes many rows inside one transaction; give it
// more room than Prisma's 5-second default on a remote database.
const IMPORT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

// Finds or creates the school's entrant for every uploaded row, matched by
// external_ref when one is given and by full name otherwise. Existing learners
// are fetched in one query rather than one lookup per row, and are only
// rewritten when the upload changes their name or grade. Returns one entrant
// per row, in row order.
const resolveSchoolEntrants = async (tx, schoolId, entrantsData) => {
  const refs = [...new Set(entrantsData.map((e) => e.external_ref).filter(Boolean))];
  const names = [...new Set(entrantsData.filter((e) => !e.external_ref).map((e) => e.full_name))];
  const lookups = [
    ...(refs.length ? [{ external_ref: { in: refs } }] : []),
    ...(names.length ? [{ full_name: { in: names } }] : []),
  ];
  const existing = lookups.length
    ? await tx.entrants.findMany({
        where: { school_id: schoolId, OR: lookups },
        orderBy: { created_at: "asc" },
      })
    : [];

  const byRef = new Map();
  const byName = new Map();
  const keep = (map, key, entrant) => {
    const current = map.get(key);
    if (!current || current.id === entrant.id) map.set(key, entrant);
  };
  const remember = (entrant) => {
    if (entrant.external_ref) keep(byRef, entrant.external_ref, entrant);
    keep(byName, entrant.full_name, entrant);
  };
  existing.forEach(remember);

  const resolved = [];
  for (const e of entrantsData) {
    const grade = e.grade?.toString();
    let entrant = e.external_ref ? byRef.get(e.external_ref) : byName.get(e.full_name);

    if (entrant) {
      const changed =
        entrant.full_name !== e.full_name || (grade !== undefined && entrant.grade !== grade);
      if (changed) {
        const previousName = entrant.full_name;
        entrant = await tx.entrants.update({
          where: { id: entrant.id },
          data: { full_name: e.full_name, grade },
        });
        if (byName.get(previousName)?.id === entrant.id) byName.delete(previousName);
      }
    } else {
      entrant = await tx.entrants.create({
        data: {
          school_id: schoolId,
          full_name: e.full_name,
          grade,
          external_ref: e.external_ref || null,
        },
      });
    }

    remember(entrant);
    resolved.push(entrant);
  }
  return resolved;
};

// Registers every (entrant, round) pair, reviving an earlier registration
// where one exists: one update per round plus one bulk insert, instead of an
// upsert per pair.
const registerPairs = async (tx, educatorId, pairs) => {
  const byRound = new Map();
  for (const { entrantId, roundId } of pairs) {
    if (!byRound.has(roundId)) byRound.set(roundId, new Set());
    byRound.get(roundId).add(entrantId);
  }
  if (byRound.size === 0) return;

  for (const [roundId, entrantIds] of byRound) {
    await tx.entrant_registrations.updateMany({
      where: {
        round_id: roundId,
        entrant_id: { in: [...entrantIds] },
        status: { not: "registered" },
      },
      data: { status: "registered" },
    });
  }

  await tx.entrant_registrations.createMany({
    data: [...byRound].flatMap(([roundId, entrantIds]) =>
      [...entrantIds].map((entrantId) => ({
        entrant_id: entrantId,
        round_id: roundId,
        registered_by: educatorId,
        status: "registered",
      })),
    ),
    skipDuplicates: true,
  });
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
    const entrants = await resolveSchoolEntrants(tx, educator.school_id, entrantsData);

    // ── Enforce progression: must have qualified ──
    if (qualifiedEntrantIds !== null) {
      const index = entrants.findIndex((entrant) => !qualifiedEntrantIds.has(entrant.id));
      if (index !== -1) {
        throw new BadRequestError(
          `${entrantsData[index].full_name} did not qualify in the previous round ("${previousRound.name}") and cannot be registered for this round.`,
        );
      }
    }

    await registerPairs(
      tx,
      educator.id,
      entrants.map((entrant) => ({ entrantId: entrant.id, roundId })),
    );

    return entrants;
  }, IMPORT_TRANSACTION_OPTIONS);

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
    const entrants = await resolveSchoolEntrants(tx, educator.school_id, entrantsData);

    // A round whose predecessor has released results only takes learners
    // who qualified in it; look those passes up once for every row.
    const gatingRoundIds = rounds
      .filter((round, i) => i + 1 < rounds.length && round.state === "results_released")
      .map((round) => round.id);
    const passed = new Set();
    if (gatingRoundIds.length && entrants.length) {
      const qualified = await tx.results.findMany({
        where: {
          round_id: { in: gatingRoundIds },
          entrant_id: { in: [...new Set(entrants.map((entrant) => entrant.id))] },
          qualified: true,
        },
        select: { round_id: true, entrant_id: true },
      });
      for (const r of qualified) passed.add(`${r.round_id}:${r.entrant_id}`);
    }

    const pairs = [];
    const results = entrants.map((entrant) => {
      const registeredRounds = [];

      rounds.forEach((round, i) => {
        // Closed rounds take no new registrations
        if (!REGISTRABLE_STATES.has(round.state)) return;

        // First round: always register. Later rounds need a pass in the
        // previous round once its results are out, otherwise the learner
        // is registered tentatively.
        const prevRound = i > 0 ? rounds[i - 1] : null;
        if (
          prevRound?.state === "results_released" &&
          !passed.has(`${prevRound.id}:${entrant.id}`)
        ) {
          return;
        }

        pairs.push({ entrantId: entrant.id, roundId: round.id });
        registeredRounds.push({ id: round.id, name: round.name });
      });

      return {
        id: entrant.id,
        full_name: entrant.full_name,
        grade: entrant.grade,
        external_ref: entrant.external_ref,
        rounds: registeredRounds,
      };
    });

    await registerPairs(tx, educator.id, pairs);
    return results;
  }, IMPORT_TRANSACTION_OPTIONS);

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

// ─────────────────────────────────────────
// SCHOOL OVERVIEW (I19)
//
// One-call dashboard payload: every olympiad the
// school is registered for, with per-round
// participation stats, plus every entrant with
// their per-round submission and — only once
// released — their result.  Scores stay hidden
// until the round reaches results_released,
// matching getResults / listAllResults.
// ─────────────────────────────────────────
const getSchoolOverview = async (userId) => {
  const educator = await resolveEducator(userId);

  const registrations = await prisma.school_registrations.findMany({
    where: { school_id: educator.school_id },
    include: {
      olympiads: { include: { rounds: { orderBy: { opens_at: "asc" } } } },
    },
  });

  const olympiads = registrations.map((r) => r.olympiads);
  const olympiadIds = olympiads.map((o) => o.id);
  const hasOlympiads = olympiadIds.length > 0;

  // Everything below is scoped to the school's own entrants
  const schoolEntrantRegs = hasOlympiads
    ? await prisma.entrant_registrations.findMany({
        where: {
          rounds: { olympiad_id: { in: olympiadIds } },
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
      })
    : [];

  const schoolSubmissions = hasOlympiads
    ? await prisma.submissions.findMany({
        where: {
          rounds: { olympiad_id: { in: olympiadIds } },
          entrants: { school_id: educator.school_id },
        },
        select: { round_id: true, entrant_id: true, received_at: true },
      })
    : [];

  const schoolResults = hasOlympiads
    ? await prisma.results.findMany({
        where: {
          rounds: { olympiad_id: { in: olympiadIds } },
          entrants: { school_id: educator.school_id },
        },
        select: {
          round_id: true,
          entrant_id: true,
          total_points: true,
          rank: true,
          qualified: true,
        },
      })
    : [];

  // round_id -> round (with olympiad context), for quick lookups
  const roundById = new Map();
  for (const olympiad of olympiads) {
    for (const round of olympiad.rounds) {
      roundById.set(round.id, {
        ...round,
        olympiad_name: olympiad.name,
      });
    }
  }

  // Latest submission per (round, entrant)
  const submissionMap = new Map();
  for (const s of schoolSubmissions) {
    const key = `${s.round_id}|${s.entrant_id}`;
    const existing = submissionMap.get(key);
    if (!existing || new Date(s.received_at) > new Date(existing.received_at)) {
      submissionMap.set(key, s);
    }
  }

  // Result per (round, entrant)
  const resultMap = new Map();
  for (const r of schoolResults) {
    resultMap.set(`${r.round_id}|${r.entrant_id}`, r);
  }

  // ── Per-olympiad / per-round stats ────────────
  const olympiadSummaries = olympiads.map((olympiad) => ({
    id: olympiad.id,
    name: olympiad.name,
    rounds: olympiad.rounds.map((round) => {
      const registered = schoolEntrantRegs
        .filter((reg) => reg.round_id === round.id)
        .map((reg) => reg.entrants);
      const released = round.state === "results_released";

      const submittedIds = new Set(
        schoolSubmissions
          .filter((s) => s.round_id === round.id)
          .map((s) => s.entrant_id),
      );

      let school_average = null;
      let qualified_count = null;
      let top_rank = null;
      if (released) {
        const roundResults = registered
          .map((e) => resultMap.get(`${round.id}|${e.id}`))
          .filter(Boolean);

        if (roundResults.length > 0) {
          const points = roundResults.map((r) => Number(r.total_points) || 0);
          school_average =
            Math.round(
              (points.reduce((sum, p) => sum + p, 0) / points.length) * 10,
            ) / 10;
          qualified_count = roundResults.filter((r) => r.qualified).length;
          const ranks = roundResults.map((r) => r.rank).filter((r) => r != null);
          top_rank = ranks.length > 0 ? Math.min(...ranks) : null;
        }
      }

      return {
        id: round.id,
        name: round.name,
        state: round.state,
        status: mapRoundState(round.state),
        opens_at: round.opens_at,
        closes_at: round.closes_at,
        entrant_count: registered.length,
        submitted_count: submittedIds.size,
        results_available: released,
        school_average,
        qualified_count,
        top_rank,
      };
    }),
  }));

  // ── Per-entrant rows ───────────────────────────
  // One row per entrant; one entry per round they are
  // registered for, carrying their submission and —
  // only once released — their result.
  const entrantMap = new Map();
  for (const reg of schoolEntrantRegs) {
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

    const row = entrantMap.get(e.id);
    if (row.rounds.some((r) => r.round_id === reg.round_id)) continue;

    const round = roundById.get(reg.round_id);
    const released = round?.state === "results_released";
    const submission = submissionMap.get(`${reg.round_id}|${e.id}`) ?? null;
    const result = released
      ? resultMap.get(`${reg.round_id}|${e.id}`) ?? null
      : null;

    row.rounds.push({
      round_id: reg.round_id,
      round_name: round?.name ?? "Round",
      olympiad_id: round?.olympiad_id ?? null,
      state: round?.state ?? null,
      submitted: Boolean(submission),
      submitted_at: submission?.received_at ?? null,
      score: result ? Number(result.total_points) : null,
      rank: result?.rank ?? null,
      qualified: result ? result.qualified : null,
    });
  }

  const entrants = [...entrantMap.values()]
    .map((e) => ({
      ...e,
      rounds: [...e.rounds].sort(
        (a, b) =>
          new Date(roundById.get(a.round_id)?.opens_at ?? 0) -
          new Date(roundById.get(b.round_id)?.opens_at ?? 0),
      ),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    school: {
      id: educator.schools.id,
      name: educator.schools.name,
    },
    olympiads: olympiadSummaries,
    entrants,
  };
};

/**
 * List remarks specifically assigned to this educator for review.
 */
const listRemarks = async (userId) => {
  const educator = await resolveEducator(userId);

  const remarks = await prisma.remark_requests.findMany({
    where: {
      reviewer_id: educator.user_id,
    },
    include: {
      results: {
        include: {
          entrants: {
            select: { full_name: true, schools: { select: { name: true } } },
          },
          rounds: {
            select: { name: true, olympiads: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  return remarks.map((remark) => ({
    id: remark.id,
    resultId: remark.result_id,
    studentName: remark.results?.entrants?.full_name || "Student",
    studentSchool: remark.results?.entrants?.schools?.name || "School",
    roundName: remark.results?.rounds?.name || "Round",
    olympiadName: remark.results?.rounds?.olympiads?.name || "Olympiad",
    score: Number(remark.results?.total_points ?? 0),
    reason: remark.reason,
    status: remark.status === "pending" ? "pending" : "reviewed",
    review_note: remark.review_note,
    created_at: remark.created_at,
    reviewed_at: remark.reviewed_at,
  }));
};

/**
 * Get question-by-question answers for an assigned remark.
 */
const getRemarkSubmissionAnswers = async (remarkId, userId) => {
  const educator = await resolveEducator(userId);

  const remark = await prisma.remark_requests.findUnique({
    where: { id: remarkId },
    include: {
      results: {
        include: {
          entrants: { select: { id: true, full_name: true } },
          rounds: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!remark) {
    throw new NotFoundError("Remark request not found");
  }

  if (remark.reviewer_id !== educator.user_id) {
    throw new ForbiddenError("You are not assigned to review this remark");
  }

  const submission = await prisma.submissions.findFirst({
    where: {
      round_id: remark.results.round_id,
      entrant_id: remark.results.entrant_id,
    },
    include: {
      answers: {
        include: {
          questions: {
            select: {
              id: true,
              prompt: true,
              type: true,
              options: true,
              correct_option: true,
              correct_answer: true,
              max_points: true,
            },
          },
        },
      },
    },
  });

  return {
    remarkId: remark.id,
    submissionId: submission?.id || null,
    studentName: remark.results?.entrants?.full_name || "Student",
    roundName: remark.results?.rounds?.name || "Round",
    totalPoints: Number(remark.results?.total_points ?? 0),
    answers: (submission?.answers || []).map((a) => ({
      id: a.id,
      questionId: a.question_id,
      prompt: a.questions?.prompt || "",
      type: a.questions?.type || "",
      options: a.questions?.options || null,
      correctOption: a.questions?.correct_option || null,
      correctAnswer: a.questions?.correct_answer || null,
      maxPoints: Number(a.questions?.max_points || 0),
      studentAnswer: a.answer_value,
      pointsAwarded: a.points_awarded !== null ? Number(a.points_awarded) : null,
      isCorrect: a.is_correct,
      markedAt: a.marked_at,
    })),
  };
};

/**
 * Re-mark an individual question answer during a remark review.
 * The change is logged in marking_reviews, and the round's results are
 * recalculated: the student's total, every rank, qualification and the next
 * round's enrolment.
 */
const updateRemarkAnswer = async (
  remarkId,
  answerId,
  userId,
  { points_awarded, is_correct },
) => {
  const educator = await resolveEducator(userId);

  const remark = await prisma.remark_requests.findUnique({
    where: { id: remarkId },
    include: { results: { select: { round_id: true, entrant_id: true } } },
  });

  if (!remark) {
    throw new NotFoundError("Remark request not found");
  }

  if (remark.reviewer_id !== educator.user_id) {
    throw new ForbiddenError("You are not assigned to review this remark");
  }

  if (remark.status !== "pending") {
    throw new BadRequestError("Cannot adjust marks on an already reviewed remark");
  }

  const answer = await prisma.answers.findUnique({
    where: { id: answerId },
    include: {
      submissions: true,
      questions: { select: { max_points: true } },
    },
  });

  if (
    !answer ||
    answer.submissions?.round_id !== remark.results.round_id ||
    answer.submissions?.entrant_id !== remark.results.entrant_id
  ) {
    throw new NotFoundError("Answer not found for this remark request");
  }

  const maxPoints = Number(answer.questions?.max_points || 0);
  const clampedPoints = Math.max(0, Math.min(Number(points_awarded), maxPoints));
  const resolvedIsCorrect =
    is_correct !== undefined ? is_correct : clampedPoints > 0;

  const updatedResult = await prisma.$transaction(async (tx) => {
    await tx.marking_reviews.create({
      data: {
        answer_id: answerId,
        reviewer_id: educator.user_id,
        original_points: answer.points_awarded || 0,
        revised_points: clampedPoints,
        comment: "Re-marked in a remark review",
      },
    });

    await tx.answers.update({
      where: { id: answerId },
      data: {
        points_awarded: clampedPoints,
        is_correct: resolvedIsCorrect,
        marked_by: educator.user_id,
        marked_at: new Date(),
      },
    });

    await recalculateRoundResults(tx, remark.results.round_id);

    return tx.results.findUnique({
      where: { id: remark.result_id },
      select: { total_points: true },
    });
  });

  return {
    answerId,
    pointsAwarded: clampedPoints,
    isCorrect: resolvedIsCorrect,
    totalPoints: Number(updatedResult?.total_points ?? 0),
  };
};

/**
 * Resolve an assigned remark with review feedback.
 */
const resolveRemark = async (remarkId, userId, { status, review_note }) => {
  const educator = await resolveEducator(userId);

  const remark = await prisma.remark_requests.findUnique({
    where: { id: remarkId },
  });

  if (!remark) {
    throw new NotFoundError("Remark request not found");
  }

  if (remark.reviewer_id !== educator.user_id) {
    throw new ForbiddenError("You are not assigned to review this remark");
  }

  if (remark.status !== "pending") {
    throw new BadRequestError("This remark has already been reviewed");
  }

  return prisma.remark_requests.update({
    where: { id: remarkId },
    data: {
      status,
      review_note: review_note ?? null,
      reviewed_at: new Date(),
    },
  });
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
  getSchoolOverview,
  listPastPapers,
  getPaperDownloadUrl,
  listRemarks,
  getRemarkSubmissionAnswers,
  updateRemarkAnswer,
  resolveRemark,
};


