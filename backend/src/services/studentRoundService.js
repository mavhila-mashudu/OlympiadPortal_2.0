// @ts-nocheck
const prisma = require("../config/database").default;
const supabase = require("../config/supabase");
const { BadRequestError, NotFoundError } = require("../errors/AppError");

const BUCKET = "papers";

// ==========================================
// Shared Helpers
// ==========================================

/**
 * Builds the Prisma include object for round associations relative to an entrant.
 * @param {string} entrantId
 * @param {boolean} [includeSubmissions=true]
 */
const buildRoundInclude = (entrantId, includeSubmissions = true) => {
  const include = {
    olympiads: { select: { id: true, name: true, timezone: true } },
    papers: {
      include: {
        questions: { select: { id: true, max_points: true } },
      },
    },
    results: {
      where: { entrant_id: entrantId },
      select: { id: true, total_points: true, rank: true, qualified: true },
    },
  };

  if (includeSubmissions) {
    include.submissions = {
      where: { entrant_id: entrantId },
      select: { id: true, status: true, route: true, received_at: true },
    };
  }

  return include;
};

/**
 * Extracts the first paper and computes the total max points from its questions.
 */
const calcPaperPoints = (round) => {
  const paper = round.papers?.[0] || null;
  const maxPoints = paper
    ? paper.questions.reduce((sum, q) => sum + Number(q.max_points || 0), 0)
    : 0;
  return { paper, maxPoints };
};

/**
 * Maps round lifecycle state to student-facing status: upcoming | open | closed
 */
const mapRoundStatus = (state) => {
  if (state === "open") return "open";
  if (["closed", "marking", "results_released"].includes(state)) return "closed";
  return "upcoming";
};

/**
 * Formats score and percentage strings from a result row and total max points.
 */
const formatScoreAndPercentage = (resultRow, maxPoints) => {
  if (!resultRow) return { score: "—", percentage: "—" };
  const scoreNum = Number(resultRow.total_points || 0);
  const percentage = maxPoints > 0 ? `${Math.round((scoreNum / maxPoints) * 100)}%` : "0%";
  return {
    score: `${scoreNum} / ${maxPoints}`,
    percentage,
  };
};

/**
 * Formats full round result for dashboard and round detail views.
 */
const formatRoundResult = (resultRow, maxPoints, isResultsReleased) => {
  if (!isResultsReleased || !resultRow) return null;
  const { score, percentage } = formatScoreAndPercentage(resultRow, maxPoints);
  return {
    score,
    percentage,
    rankInSchool: resultRow.rank ?? null,
    hasCertificate: Boolean(resultRow.qualified),
  };
};

/**
 * An online sitting creates its submission (status "received") when the
 * student starts, so that alone means the exam is still in progress and can be
 * resumed. Anything else is a finished submission.
 */
const isSubmitted = (submission) =>
  Boolean(submission) &&
  !(submission.route === "online" && submission.status === "received");

/**
 * Returns contextual helper note based on round status.
 */
const getPaperNote = (status) => {
  if (status === "closed") return "This round has closed.";
  if (status === "open") return "Paper is available for download or online sitting.";
  return "Available when the round opens.";
};

// ==========================================
// Service Exports
// ==========================================

/**
 * List all rounds the logged-in student is registered for,
 * including summary stats for the Student Dashboard.
 */
const getRegisteredRounds = async (entrantId) => {
  const registrations = await prisma.entrant_registrations.findMany({
    where: { entrant_id: entrantId },
    include: {
      rounds: {
        include: buildRoundInclude(entrantId),
      },
    },
    orderBy: {
      rounds: { opens_at: "asc" },
    },
  });

  let resultsAvailableCount = 0;
  let certificatesCount = 0;

  const rounds = registrations.map((reg) => {
    const round = reg.rounds;
    const { paper, maxPoints } = calcPaperPoints(round);
    const submission = round.submissions?.[0] || null;
    const resultRow = round.results?.[0] || null;
    const isResultsReleased = round.state === "results_released";

    if (isResultsReleased && resultRow) {
      resultsAvailableCount += 1;
      if (resultRow.qualified) certificatesCount += 1;
    }

    const status = mapRoundStatus(round.state);
    const result = formatRoundResult(resultRow, maxPoints, isResultsReleased);

    return {
      id: round.id,
      title: round.name,
      olympiadTitle: round.olympiads?.name || "",
      // Round times are shown in the olympiad's timezone
      timezone: round.olympiads?.timezone,
      opens_at: round.opens_at,
      closes_at: round.closes_at,
      status,
      paperFile: paper?.file_url ? paper.file_url.split("/").pop() : null,
      paperTitle: paper?.title || null,
      hasSubmitted: isSubmitted(submission),
      result,
    };
  });

  const stats = {
    roundsEntered: rounds.length,
    resultsAvailable: resultsAvailableCount,
    certificatesEarned: certificatesCount,
  };

  return { rounds, stats };
};

/**
 * Get detailed information for a single round the student is registered for.
 */
const getStudentRoundDetail = async (roundId, entrantId) => {
  const reg = await prisma.entrant_registrations.findFirst({
    where: {
      entrant_id: entrantId,
      round_id: roundId,
    },
    include: {
      entrants: {
        include: {
          schools: { select: { id: true, name: true } },
        },
      },
      rounds: {
        include: buildRoundInclude(entrantId),
      },
    },
  });
  if (!reg) {
    throw new NotFoundError(
      "Round not found or you are not registered for this round",
    );
  }
  const round = reg.rounds;
  const entrant = reg.entrants;
  const { paper, maxPoints } = calcPaperPoints(round);
  const submission = round.submissions?.[0] || null;
  const resultRow = round.results?.[0] || null;
  const isResultsReleased = round.state === "results_released";
  const status = mapRoundStatus(round.state);
  const result = formatRoundResult(resultRow, maxPoints, isResultsReleased);
  return {
    id: round.id,
    title: round.name,
    olympiadTitle: round.olympiads?.name || "",
    schoolName: entrant?.schools?.name || "School",
    timezone: round.olympiads?.timezone,
    opens_at: round.opens_at,
    closes_at: round.closes_at,
    status,
    canSitOnline: round.state === "open" && round.exam_status === "live",
    hasSubmitted: isSubmitted(submission),
    submissionStatus: submission?.status || null,
    paperFile: paper?.file_url ? paper.file_url.split("/").pop() : "question-paper.pdf",
    hasPaper: Boolean(paper?.file_url),
    paperNote: getPaperNote(status),
    result,
  };
};

/**
 * Get all closed/released rounds with results for the student results page.
 */
const getStudentResults = async (entrantId) => {
  const registrations = await prisma.entrant_registrations.findMany({
    where: {
      entrant_id: entrantId,
      rounds: {
        state: { in: ["closed", "marking", "results_released"] },
      },
    },
    include: {
      rounds: {
        include: buildRoundInclude(entrantId, false),
      },
    },
    orderBy: {
      rounds: { closes_at: "desc" },
    },
  });
  const results = registrations.map((reg) => {
    const round = reg.rounds;
    const { maxPoints } = calcPaperPoints(round);
    const resultRow = round.results?.[0] || null;
    const isReleased = round.state === "results_released" && Boolean(resultRow);
    const { score, percentage } = isReleased
      ? formatScoreAndPercentage(resultRow, maxPoints)
      : { score: "—", percentage: "—" };
    return {
      id: round.id,
      round: round.name,
      olympiadTitle: round.olympiads?.name || "",
      timezone: round.olympiads?.timezone,
      closes_at: round.closes_at,
      resultStatus: isReleased ? "released" : "pending",
      score,
      percentage,
      rank: resultRow?.rank ?? null,
      hasCertificate: isReleased && Boolean(resultRow?.qualified),
    };
  });
  return { results };
};

/**
 * Signed, short-lived download link for the question paper of a round the
 * student is registered for. Like educators, students get the paper once the
 * round has opened; the memo stays with the organiser.
 */
const getStudentPaperUrl = async (roundId, entrantId) => {
  if (!supabase) {
    throw new BadRequestError("File storage is not configured on this server");
  }

  const reg = await prisma.entrant_registrations.findFirst({
    where: { entrant_id: entrantId, round_id: roundId },
    include: { rounds: { include: { papers: true } } },
  });
  if (!reg) {
    throw new NotFoundError(
      "Round not found or you are not registered for this round",
    );
  }

  if (mapRoundStatus(reg.rounds.state) === "upcoming") {
    throw new BadRequestError(
      "Paper is not available yet — the round has not opened",
    );
  }

  const path = reg.rounds.papers?.[0]?.file_url;
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

module.exports = {
  getRegisteredRounds,
  getStudentRoundDetail,
  getStudentResults,
  getStudentPaperUrl,
};
