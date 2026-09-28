// @ts-nocheck
const prisma = require("../config/database").default;
const { NotFoundError, BadRequestError } = require("../errors/AppError");

// ──────────────────────────────────────────
// 1. Platform-wide stats
// ──────────────────────────────────────────
const getPlatformStats = async () => {
  const [totalOlympiads, totalRounds, totalSchools, totalStudents, totalSubmissions] =
    await Promise.all([
      prisma.olympiads.count(),
      prisma.rounds.count(),
      prisma.schools.count(),
      prisma.entrants.count(),
      prisma.submissions.count(),
    ]);

  return { totalOlympiads, totalRounds, totalSchools, totalStudents, totalSubmissions };
};

// ──────────────────────────────────────────
// 2. List olympiads (public, with filters)
// ──────────────────────────────────────────
const listOlympiads = async ({ search, year, page = 1, limit = 20, sort = "created_at" }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  // Year filter: olympiad has at least one round whose opens_at falls in that year
  if (year) {
    const y = Number(year);
    where.rounds = {
      some: {
        opens_at: {
          gte: new Date(`${y}-01-01T00:00:00Z`),
          lt: new Date(`${y + 1}-01-01T00:00:00Z`),
        },
      },
    };
  }

  const orderBy = sort === "name"
    ? { name: "asc" }
    : { created_at: "desc" };

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const take = Math.min(Number(limit), 100); // cap at 100

  const [olympiads, total] = await Promise.all([
    prisma.olympiads.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        _count: {
          select: {
            rounds: true,
            school_registrations: true,
          },
        },
        rounds: {
          select: { opens_at: true },
          orderBy: { opens_at: "asc" },
          take: 1, // only need the first round for the year
        },
      },
    }),
    prisma.olympiads.count({ where }),
  ]);

  // For each olympiad, count unique entrants across all rounds
  const olympiadIds = olympiads.map((o) => o.id);
  const entrantCounts = olympiadIds.length > 0
    ? await prisma.$queryRawUnsafe(`
        SELECT r.olympiad_id, COUNT(DISTINCT er.entrant_id)::int AS student_count
        FROM entrant_registrations er
        JOIN rounds r ON r.id = er.round_id
        WHERE r.olympiad_id = ANY($1::uuid[])
        GROUP BY r.olympiad_id
      `, olympiadIds)
    : [];

  const studentCountMap = new Map();
  for (const row of entrantCounts) {
    studentCountMap.set(row.olympiad_id, row.student_count);
  }

  const data = olympiads.map((o) => ({
    id: o.id,
    name: o.name,
    createdAt: o.created_at,
    roundCount: o._count.rounds,
    schoolCount: o._count.school_registrations,
    studentCount: studentCountMap.get(o.id) || 0,
    year: o.rounds[0] ? new Date(o.rounds[0].opens_at).getFullYear() : null,
  }));

  return {
    olympiads: data,
    pagination: {
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
};

// ──────────────────────────────────────────
// 3. Olympiad detail (public)
// ──────────────────────────────────────────
const getOlympiadDetail = async (olympiadId) => {
  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
    include: {
      users: { select: { full_name: true } },
      rounds: {
        orderBy: { opens_at: "asc" },
        include: {
          _count: {
            select: {
              entrant_registrations: true,
              submissions: true,
            },
          },
        },
      },
      _count: { select: { school_registrations: true } },
    },
  });

  if (!olympiad) throw new NotFoundError("Olympiad not found");

  // Count unique students across all rounds of this olympiad
  const studentCountResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT er.entrant_id)::int AS student_count
    FROM entrant_registrations er
    JOIN rounds r ON r.id = er.round_id
    WHERE r.olympiad_id = $1::uuid
  `, olympiadId);

  const studentCount = studentCountResult[0]?.student_count || 0;

  return {
    id: olympiad.id,
    name: olympiad.name,
    timezone: olympiad.timezone,
    createdAt: olympiad.created_at,
    organiserName: olympiad.users.full_name,
    schoolCount: olympiad._count.school_registrations,
    studentCount,
    rounds: olympiad.rounds.map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
      resultsReleasedAt: r.results_release_at || null,
      participantCount: r._count.entrant_registrations,
      submissionCount: r._count.submissions,
    })),
  };
};
// ──────────────────────────────────────────
// 4. Round results summary (aggregated, public)
//    Only for rounds with state = results_released
// ──────────────────────────────────────────

// Helper: compute grade distribution buckets from an array of scores
const buildGradeDistribution = (scores, maxPoints) => {
  const buckets = {
    "90-100": 0,
    "80-89": 0,
    "70-79": 0,
    "60-69": 0,
    "50-59": 0,
    "40-49": 0,
    "30-39": 0,
    "0-29": 0,
  };

  for (const score of scores) {
    const pct = maxPoints > 0 ? (score / maxPoints) * 100 : 0;
    if (pct >= 90) buckets["90-100"]++;
    else if (pct >= 80) buckets["80-89"]++;
    else if (pct >= 70) buckets["70-79"]++;
    else if (pct >= 60) buckets["60-69"]++;
    else if (pct >= 50) buckets["50-59"]++;
    else if (pct >= 40) buckets["40-49"]++;
    else if (pct >= 30) buckets["30-39"]++;
    else buckets["0-29"]++;
  }

  return buckets;
};

// Helper: fetch the round + verify it's released
const fetchReleasedRound = async (olympiadId, roundId) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: { select: { id: true, name: true } } },
  });

  if (!round) throw new NotFoundError("Round not found");
  if (round.olympiad_id !== olympiadId) {
    throw new NotFoundError("Round does not belong to this olympiad");
  }
  if (round.state !== "results_released") {
    throw new BadRequestError("Results have not been released for this round");
  }

  return round;
};

// Helper: get max possible points for a round (sum of max_points across all questions)
const getMaxPoints = async (roundId) => {
  const result = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM(q.max_points), 0)::float AS max_points
    FROM questions q
    JOIN papers p ON p.id = q.paper_id
    WHERE p.round_id = $1::uuid
  `, roundId);
  return result[0]?.max_points || 0;
};

const getRoundResultsSummary = async (olympiadId, roundId) => {
  const round = await fetchReleasedRound(olympiadId, roundId);
  const maxPoints = await getMaxPoints(roundId);

  const results = await prisma.results.findMany({
    where: { round_id: roundId },
    select: { total_points: true, qualified: true },
  });

  if (results.length === 0) {
    return {
      roundName: round.name,
      olympiadName: round.olympiads.name,
      totalParticipants: 0,
      totalSubmissions: 0,
      maxPossibleScore: maxPoints,
      averageScore: 0,
      medianScore: 0,
      highestScore: 0,
      lowestScore: 0,
      qualifyingThreshold: round.qualifying_threshold ? Number(round.qualifying_threshold) : null,
      qualifiedCount: 0,
      gradeDistribution: buildGradeDistribution([], maxPoints),
    };
  }

  const scores = results.map((r) => Number(r.total_points));
  scores.sort((a, b) => a - b);

  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const median = scores.length % 2 === 0
    ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : scores[Math.floor(scores.length / 2)];

  const submissionCount = await prisma.submissions.count({ where: { round_id: roundId } });

  return {
    roundName: round.name,
    olympiadName: round.olympiads.name,
    totalParticipants: results.length,
    totalSubmissions: submissionCount,
    maxPossibleScore: maxPoints,
    averageScore: Number(avg.toFixed(2)),
    medianScore: Number(median.toFixed(2)),
    highestScore: scores[scores.length - 1],
    lowestScore: scores[0],
    qualifyingThreshold: round.qualifying_threshold ? Number(round.qualifying_threshold) : null,
    qualifiedCount: results.filter((r) => r.qualified).length,
    gradeDistribution: buildGradeDistribution(scores, maxPoints),
  };
};

// ──────────────────────────────────────────
// 5. Round results by school
// ──────────────────────────────────────────
const getRoundResultsBySchool = async (olympiadId, roundId) => {
  const round = await fetchReleasedRound(olympiadId, roundId);
  const maxPoints = await getMaxPoints(roundId);

  const results = await prisma.results.findMany({
    where: { round_id: roundId },
    select: {
      total_points: true,
      qualified: true,
      entrants: {
        select: {
          school_id: true,
          schools: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Group by school
  const schoolMap = new Map();
  for (const r of results) {
    const schoolId = r.entrants.school_id;
    if (!schoolMap.has(schoolId)) {
      schoolMap.set(schoolId, {
        schoolId,
        schoolName: r.entrants.schools.name,
        scores: [],
        qualifiedCount: 0,
      });
    }
    const entry = schoolMap.get(schoolId);
    const score = Number(r.total_points);
    entry.scores.push(score);
    if (r.qualified) entry.qualifiedCount++;
  }

  const schools = [...schoolMap.values()]
    .map((s) => {
      const avg = s.scores.reduce((a, b) => a + b, 0) / s.scores.length;
      return {
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        participantCount: s.scores.length,
        averageScore: Number(avg.toFixed(2)),
        qualifiedCount: s.qualifiedCount,
        gradeDistribution: buildGradeDistribution(s.scores, maxPoints),
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore);

  return {
    roundName: round.name,
    olympiadName: round.olympiads.name,
    schools,
  };
};

// ──────────────────────────────────────────
// 6. Olympiad leaderboard (schools ranked by
//    average score across all released rounds)
// ──────────────────────────────────────────
const getOlympiadLeaderboard = async (olympiadId) => {
  const olympiad = await prisma.olympiads.findUnique({
    where: { id: olympiadId },
    select: { id: true, name: true },
  });

  if (!olympiad) throw new NotFoundError("Olympiad not found");

  // Get all released round IDs for this olympiad
  const releasedRounds = await prisma.rounds.findMany({
    where: { olympiad_id: olympiadId, state: "results_released" },
    select: { id: true },
  });

  if (releasedRounds.length === 0) {
    return { olympiadName: olympiad.name, schools: [] };
  }

  const roundIds = releasedRounds.map((r) => r.id);

  // Aggregate results by school across all released rounds
  const results = await prisma.results.findMany({
    where: { round_id: { in: roundIds } },
    select: {
      total_points: true,
      qualified: true,
      entrants: {
        select: {
          school_id: true,
          schools: { select: { id: true, name: true } },
        },
      },
    },
  });

  const schoolMap = new Map();
  for (const r of results) {
    const schoolId = r.entrants.school_id;
    if (!schoolMap.has(schoolId)) {
      schoolMap.set(schoolId, {
        schoolId,
        schoolName: r.entrants.schools.name,
        totalScore: 0,
        count: 0,
        qualifiedCount: 0,
      });
    }
    const entry = schoolMap.get(schoolId);
    entry.totalScore += Number(r.total_points);
    entry.count++;
    if (r.qualified) entry.qualifiedCount++;
  }

  const schools = [...schoolMap.values()]
    .map((s) => ({
      schoolName: s.schoolName,
      averageScore: Number((s.totalScore / s.count).toFixed(2)),
      totalParticipants: s.count,
      qualifiedCount: s.qualifiedCount,
    }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .map((s, i) => ({ rank: i + 1, ...s }));

  return { olympiadName: olympiad.name, schools };
};

// ──────────────────────────────────────────
// 7. List schools (public, with search)
// ──────────────────────────────────────────
const listSchools = async ({ search, page = 1, limit = 20 }) => {
  const where = {};

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const take = Math.min(Number(limit), 100);

  const [schools, total] = await Promise.all([
    prisma.schools.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      include: {
        _count: {
          select: {
            school_registrations: true,
            entrants: true,
          },
        },
      },
    }),
    prisma.schools.count({ where }),
  ]);

  const data = schools.map((s) => ({
    id: s.id,
    name: s.name,
    olympiadCount: s._count.school_registrations,
    studentCount: s._count.entrants,
  }));

  return {
    schools: data,
    pagination: {
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
};

// ──────────────────────────────────────────
// 8. School detail (public)
// ──────────────────────────────────────────
const getSchoolDetail = async (schoolId) => {
  const school = await prisma.schools.findUnique({
    where: { id: schoolId },
    include: {
      _count: { select: { entrants: true } },
      school_registrations: {
        where: { status: "approved" },
        include: {
          olympiads: {
            select: {
              id: true,
              name: true,
              rounds: {
                select: { opens_at: true },
                orderBy: { opens_at: "asc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!school) throw new NotFoundError("School not found");

  // Count total rounds this school's entrants have participated in
  const roundCountResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT er.round_id)::int AS round_count
    FROM entrant_registrations er
    JOIN entrants e ON e.id = er.entrant_id
    WHERE e.school_id = $1::uuid
  `, schoolId);

  const totalRoundsParticipated = roundCountResult[0]?.round_count || 0;

  // Get average score across all released rounds for this school's entrants
  const avgResult = await prisma.$queryRawUnsafe(`
    SELECT
      COALESCE(AVG(res.total_points), 0)::float AS avg_score,
      COUNT(res.id)::int AS result_count
    FROM results res
    JOIN entrants e ON e.id = res.entrant_id
    JOIN rounds r ON r.id = res.round_id
    WHERE e.school_id = $1::uuid
      AND r.state = 'results_released'
  `, schoolId);

  const overallAverageScore = Number((avgResult[0]?.avg_score || 0).toFixed(2));

  // Per-olympiad breakdown: student count + average score (only from released rounds)
  const perOlympiadStats = await prisma.$queryRawUnsafe(`
    SELECT
      o.id AS olympiad_id,
      COUNT(DISTINCT e.id)::int AS student_count,
      COALESCE(AVG(res.total_points), 0)::float AS avg_score
    FROM school_registrations sr
    JOIN olympiads o ON o.id = sr.olympiad_id
    LEFT JOIN rounds r ON r.olympiad_id = o.id AND r.state = 'results_released'
    LEFT JOIN results res ON res.round_id = r.id
    LEFT JOIN entrants e ON e.id = res.entrant_id AND e.school_id = $1::uuid
    WHERE sr.school_id = $1::uuid AND sr.status = 'approved'
    GROUP BY o.id
  `, schoolId);

  const statsMap = new Map();
  for (const row of perOlympiadStats) {
    statsMap.set(row.olympiad_id, {
      studentCount: row.student_count,
      averageScore: Number((row.avg_score || 0).toFixed(2)),
    });
  }

  const olympiads = school.school_registrations.map((reg) => {
    const stats = statsMap.get(reg.olympiads.id) || { studentCount: 0, averageScore: 0 };
    return {
      id: reg.olympiads.id,
      name: reg.olympiads.name,
      year: reg.olympiads.rounds[0]
        ? new Date(reg.olympiads.rounds[0].opens_at).getFullYear()
        : null,
      studentCount: stats.studentCount,
      averageScore: stats.averageScore,
    };
  });

  return {
    id: school.id,
    name: school.name,
    olympiads,
    stats: {
      totalStudents: school._count.entrants,
      totalRoundsParticipated,
      overallAverageScore,
    },
  };
};
// ──────────────────────────────────────────
// 9. Past paper archive (public)
//    Only papers from released rounds with a file_url
// ──────────────────────────────────────────
const listPapers = async ({ olympiad, year, page = 1, limit = 20 }) => {
  const where = {
    file_url: { not: null },
    rounds: { state: "results_released" },
  };

  if (olympiad) {
    where.rounds = { ...where.rounds, olympiad_id: olympiad };
  }

  if (year) {
    const y = Number(year);
    where.rounds = {
      ...where.rounds,
      opens_at: {
        gte: new Date(`${y}-01-01T00:00:00Z`),
        lt: new Date(`${y + 1}-01-01T00:00:00Z`),
      },
    };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const take = Math.min(Number(limit), 100);

  const [papers, total] = await Promise.all([
    prisma.papers.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take,
      include: {
        rounds: {
          select: {
            name: true,
            opens_at: true,
            olympiads: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.papers.count({ where }),
  ]);

  const data = papers.map((p) => ({
    id: p.id,
    title: p.title,
    olympiadId: p.rounds.olympiads.id,
    olympiadName: p.rounds.olympiads.name,
    roundName: p.rounds.name,
    year: new Date(p.rounds.opens_at).getFullYear(),
    fileUrl: p.file_url,
    memoFileUrl: p.memo_file_url || null,
  }));

  return {
    papers: data,
    pagination: {
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
};

// ──────────────────────────────────────────
// 10. Platform recent activity
// ──────────────────────────────────────────
const getActivity = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [recentlyCompleted, upcoming, recentResults] = await Promise.all([
    prisma.rounds.findMany({
      where: {
        closes_at: { gte: thirtyDaysAgo, lte: now },
      },
      orderBy: { closes_at: "desc" },
      take: 5,
      include: {
        olympiads: { select: { id: true, name: true } },
      },
    }),
    prisma.rounds.findMany({
      where: {
        opens_at: { gte: now },
      },
      orderBy: { opens_at: "asc" },
      take: 5,
      include: {
        olympiads: { select: { id: true, name: true } },
      },
    }),
    prisma.rounds.findMany({
      where: {
        state: "results_released",
        results_release_at: { gte: thirtyDaysAgo },
      },
      orderBy: { results_release_at: "desc" },
      take: 5,
      include: {
        olympiads: { select: { id: true, name: true } },
      },
    }),
  ]);

  const mapRound = (r) => ({
    id: r.id,
    name: r.name,
    olympiadId: r.olympiads.id,
    olympiadName: r.olympiads.name,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    resultsReleaseAt: r.results_release_at,
    state: r.state,
  });

  return {
    recentlyCompletedRounds: recentlyCompleted.map(mapRound),
    upcomingRounds: upcoming.map(mapRound),
    recentResultsReleased: recentResults.map(mapRound),
  };
};

// ──────────────────────────────────────────
// 11. Yearly stats comparison
// ──────────────────────────────────────────
const getYearlyStats = async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 
      EXTRACT(YEAR FROM r.opens_at)::int AS year,
      COUNT(DISTINCT r.olympiad_id)::int AS total_olympiads,
      COUNT(DISTINCT r.id)::int AS total_rounds,
      COUNT(DISTINCT er.entrant_id)::int AS total_students,
      COUNT(DISTINCT e.school_id)::int AS total_schools,
      COUNT(DISTINCT s.id)::int AS total_submissions
    FROM rounds r
    LEFT JOIN entrant_registrations er ON er.round_id = r.id
    LEFT JOIN entrants e ON e.id = er.entrant_id
    LEFT JOIN submissions s ON s.round_id = r.id
    WHERE r.opens_at IS NOT NULL
    GROUP BY EXTRACT(YEAR FROM r.opens_at)
    ORDER BY year DESC
  `);

  return rows.map((row) => ({
    year: row.year,
    totalOlympiads: row.total_olympiads,
    totalRounds: row.total_rounds,
    totalStudents: row.total_students,
    totalSchools: row.total_schools,
    totalSubmissions: row.total_submissions,
  }));
};

// ──────────────────────────────────────────
// 12. Calendar of rounds
// ──────────────────────────────────────────
const getCalendar = async ({ from, to }) => {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : defaultTo;

  const rounds = await prisma.rounds.findMany({
    where: {
      opens_at: { lte: toDate },
      closes_at: { gte: fromDate },
    },
    orderBy: { opens_at: "asc" },
    include: {
      olympiads: { select: { id: true, name: true } },
    },
  });

  return rounds.map((r) => ({
    id: r.id,
    name: r.name,
    olympiadId: r.olympiads.id,
    olympiadName: r.olympiads.name,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    resultsReleaseAt: r.results_release_at,
    state: r.state,
  }));
};

// ──────────────────────────────────────────
// 13. Top schools platform-wide
// ──────────────────────────────────────────
const getTopSchools = async ({ year, limit = 10 }) => {
  const take = Math.min(Math.max(1, Number(limit) || 10), 50);
  const yearParam = year ? Number(year) : null;

  const rows = await prisma.$queryRawUnsafe(`
    SELECT 
      s.id AS school_id,
      s.name AS school_name,
      COALESCE(AVG(res.total_points), 0)::float AS average_score,
      COUNT(res.id)::int AS total_results,
      COUNT(DISTINCT e.id)::int AS total_students,
      COUNT(DISTINCT r.olympiad_id)::int AS total_olympiads
    FROM schools s
    JOIN entrants e ON e.school_id = s.id
    JOIN results res ON res.entrant_id = e.id
    JOIN rounds r ON r.id = res.round_id
    WHERE r.state = 'results_released'
      AND ($1::int IS NULL OR EXTRACT(YEAR FROM r.opens_at) = $1::int)
    GROUP BY s.id, s.name
    HAVING COUNT(res.id) > 0
    ORDER BY average_score DESC, total_results DESC
    LIMIT $2::int
  `, yearParam, take);

  return rows.map((row, index) => ({
    rank: index + 1,
    schoolId: row.school_id,
    schoolName: row.school_name,
    averageScore: Number(row.average_score.toFixed(2)),
    totalResults: row.total_results,
    totalStudents: row.total_students,
    totalOlympiads: row.total_olympiads,
  }));
};

// ──────────────────────────────────────────
// 14. Unified search across olympiads, schools, rounds
// ──────────────────────────────────────────
const unifiedSearch = async (queryStr) => {
  if (!queryStr || typeof queryStr !== "string" || !queryStr.trim()) {
    return { olympiads: [], schools: [], rounds: [] };
  }

  const q = queryStr.trim();

  const [olympiads, schools, rounds] = await Promise.all([
    prisma.olympiads.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 10,
      select: {
        id: true,
        name: true,
        created_at: true,
        _count: { select: { rounds: true } },
      },
    }),
    prisma.schools.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 10,
      select: {
        id: true,
        name: true,
        _count: { select: { entrants: true } },
      },
    }),
    prisma.rounds.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 10,
      include: {
        olympiads: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    olympiads: olympiads.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.created_at,
      roundCount: o._count.rounds,
    })),
    schools: schools.map((s) => ({
      id: s.id,
      name: s.name,
      studentCount: s._count.entrants,
    })),
    rounds: rounds.map((r) => ({
      id: r.id,
      name: r.name,
      olympiadId: r.olympiads.id,
      olympiadName: r.olympiads.name,
      state: r.state,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
    })),
  };
};

module.exports = {
  getPlatformStats,
  listOlympiads,
  getOlympiadDetail,
  getRoundResultsSummary,
  getRoundResultsBySchool,
  getOlympiadLeaderboard,
  listSchools,
  getSchoolDetail,
  listPapers,
  getActivity,
  getYearlyStats,
  getCalendar,
  getTopSchools,
  unifiedSearch,
};
