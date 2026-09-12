// @ts-nocheck
const prisma = require("../config/database").default;
const { NotFoundError } = require("../errors/AppError");

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
    olympiads: { select: { id: true, name: true } },
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
      opens_at: round.opens_at,
      closes_at: round.closes_at,
      status,
      paperFile: paper?.file_url ? paper.file_url.split("/").pop() : null,
      paperTitle: paper?.title || null,
      hasSubmitted: Boolean(submission),
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

module.exports = {
  getRegisteredRounds,
};
