const prisma = require("../config/database").default;
const { assertOwnsOlympiad } = require("./olympiadService");
const { NotFoundError, BadRequestError } = require("../errors/AppError");

const getStandings = async (roundId, organiserId) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });

  if (!round) throw new NotFoundError("Round not found");
  await assertOwnsOlympiad(round.olympiad_id, organiserId);
  if (round.state !== "results_released") {
    throw new BadRequestError("Standings are available after results are released");
  }

  const results = await prisma.results.findMany({
    where: { round_id: roundId, finalised_at: { not: null } },
    include: {
      entrants: {
        select: {
          id: true,
          full_name: true,
          grade: true,
          school_id: true,
          schools: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ rank: "asc" }, { total_points: "desc" }],
  });

  const entrants = results.map((result) => ({
    id: result.entrants.id,
    name: result.entrants.full_name,
    grade: result.entrants.grade,
    school: result.entrants.schools.name,
    school_id: result.entrants.school_id,
    score: Number(result.total_points),
    rank: result.rank,
    qualified: result.qualified,
  }));

  const schoolMap = new Map();
  for (const entrant of entrants) {
    const current = schoolMap.get(entrant.school_id) || {
      id: entrant.school_id,
      name: entrant.school,
      entrant_count: 0,
      total_score: 0,
      qualified_count: 0,
    };
    current.entrant_count += 1;
    current.total_score += entrant.score;
    if (entrant.qualified) current.qualified_count += 1;
    schoolMap.set(entrant.school_id, current);
  }

  const schools = [...schoolMap.values()]
    .map((school) => ({
      ...school,
      total_score: Number(school.total_score.toFixed(2)),
      average_score: Number((school.total_score / school.entrant_count).toFixed(2)),
    }))
    .sort((left, right) => right.total_score - left.total_score || right.average_score - left.average_score || left.name.localeCompare(right.name))
    .map((school, index) => ({ ...school, rank: index + 1 }));

  return {
    round: {
      id: round.id,
      name: round.name,
      state: round.state,
      results_released_at: round.results_release_at,
    },
    entrants,
    schools,
  };
};

module.exports = { getStandings };