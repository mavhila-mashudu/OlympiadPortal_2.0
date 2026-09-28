// @ts-nocheck
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");

/**
 * Asserts that the given round belongs to an olympiad owned by the organiser.
 */
const assertOwnsRound = async (roundId, organiserId) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: { select: { id: true, organiser_id: true, name: true } } },
  });

  if (!round) {
    throw new NotFoundError("Round not found");
  }

  if (round.olympiads?.organiser_id !== organiserId) {
    throw new ForbiddenError("You do not own this round's olympiad");
  }

  return round;
};

/**
 * List all remark requests across the organiser's olympiads/rounds.
 */
const listRemarks = async (organiserId, { olympiadId, roundId, status } = {}) => {
  const where = {
    results: {
      rounds: {
        olympiads: {
          organiser_id: organiserId,
          ...(olympiadId ? { id: olympiadId } : {}),
        },
        ...(roundId ? { id: roundId } : {}),
      },
    },
  };

  if (status === "unassigned") {
    where.reviewer_id = null;
    where.status = "pending";
  } else if (status === "assigned") {
    where.reviewer_id = { not: null };
    where.status = "pending";
  } else if (status === "reviewed") {
    where.status = "reviewed";
  } else if (status === "pending") {
    where.status = "pending";
  }

  const remarks = await prisma.remark_requests.findMany({
    where,
    include: {
      results: {
        include: {
          entrants: {
            select: {
              id: true,
              full_name: true,
              schools: { select: { id: true, name: true } },
            },
          },
          rounds: {
            select: {
              id: true,
              name: true,
              olympiad_id: true,
              olympiads: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  // Collect reviewer IDs to batch-fetch reviewer profiles
  const reviewerUserIds = [
    ...new Set(remarks.map((r) => r.reviewer_id).filter(Boolean)),
  ];

  const educators = reviewerUserIds.length > 0
    ? await prisma.educators.findMany({
        where: { user_id: { in: reviewerUserIds } },
        include: {
          users: { select: { id: true, full_name: true, email: true } },
          schools: { select: { id: true, name: true } },
        },
      })
    : [];

  const educatorMap = new Map(
    educators.map((e) => [e.user_id, { name: e.users?.full_name || "Educator", schoolName: e.schools?.name || "School" }]),
  );

  return remarks.map((remark) => {
    const reviewer = remark.reviewer_id ? educatorMap.get(remark.reviewer_id) : null;
    return {
      id: remark.id,
      resultId: remark.result_id,
      studentName: remark.results?.entrants?.full_name || "Student",
      schoolName: remark.results?.entrants?.schools?.name || "School",
      roundId: remark.results?.rounds?.id || null,
      roundName: remark.results?.rounds?.name || "Round",
      olympiadId: remark.results?.rounds?.olympiads?.id || null,
      olympiadName: remark.results?.rounds?.olympiads?.name || "Olympiad",
      score: Number(remark.results?.total_points ?? 0),
      reason: remark.reason,
      status: remark.status,
      reviewerId: remark.reviewer_id,
      reviewerName: reviewer ? reviewer.name : null,
      reviewerSchool: reviewer ? reviewer.schoolName : null,
      reviewNote: remark.review_note,
      createdAt: remark.created_at,
      reviewedAt: remark.reviewed_at,
    };
  });
};

/**
 * List educators eligible to review remarks for a specific round.
 * Eligible educators are those whose school is registered for the round's olympiad.
 */
const listEligibleEducators = async (organiserId, roundId) => {
  const round = await assertOwnsRound(roundId, organiserId);

  const registeredSchools = await prisma.school_registrations.findMany({
    where: { olympiad_id: round.olympiad_id },
    select: { school_id: true },
  });

  const schoolIds = registeredSchools.map((s) => s.school_id);
  if (schoolIds.length === 0) {
    return [];
  }

  const educators = await prisma.educators.findMany({
    where: { school_id: { in: schoolIds } },
    include: {
      users: { select: { id: true, full_name: true, email: true } },
      schools: { select: { id: true, name: true } },
    },
    orderBy: [{ schools: { name: "asc" } }, { users: { full_name: "asc" } }],
  });

  // Calculate current active pending assignments for each educator in this olympiad
  const reviewerUserIds = educators.map((e) => e.user_id);
  const pendingRemarks = await prisma.remark_requests.groupBy({
    by: ["reviewer_id"],
    where: {
      reviewer_id: { in: reviewerUserIds },
      status: "pending",
    },
    _count: { id: true },
  });

  const countMap = new Map(
    pendingRemarks.map((item) => [item.reviewer_id, item._count.id]),
  );

  return educators.map((edu) => ({
    id: edu.id,
    userId: edu.user_id,
    name: edu.users?.full_name || "Educator",
    email: edu.users?.email || "",
    schoolId: edu.school_id,
    schoolName: edu.schools?.name || "School",
    pendingCount: countMap.get(edu.user_id) || 0,
  }));
};

/**
 * Manually assign a remark request to a specific educator.
 */
const assignRemark = async (organiserId, remarkId, reviewerUserId) => {
  const remark = await prisma.remark_requests.findUnique({
    where: { id: remarkId },
    include: {
      results: {
        include: {
          rounds: {
            include: { olympiads: { select: { id: true, organiser_id: true } } },
          },
        },
      },
    },
  });

  if (!remark) {
    throw new NotFoundError("Remark request not found");
  }

  if (remark.results?.rounds?.olympiads?.organiser_id !== organiserId) {
    throw new ForbiddenError("You do not own this round's olympiad");
  }

  if (remark.status === "reviewed") {
    throw new BadRequestError("Cannot reassign a remark that has already been reviewed");
  }

  const olympiadId = remark.results.rounds.olympiads.id;

  // Verify the educator belongs to a registered school in this olympiad
  const educator = await prisma.educators.findFirst({
    where: {
      user_id: reviewerUserId,
      schools: {
        school_registrations: {
          some: { olympiad_id: olympiadId },
        },
      },
    },
  });

  if (!educator) {
    throw new BadRequestError("The selected educator is not participating in this olympiad");
  }

  return prisma.remark_requests.update({
    where: { id: remarkId },
    data: { reviewer_id: reviewerUserId },
  });
};

/**
 * Automatically distribute all unassigned pending remarks for a round
 * across eligible educators, balancing the review workload evenly.
 */
const autoAssignRemarks = async (organiserId, roundId) => {
  const eligibleEducators = await listEligibleEducators(organiserId, roundId);

  if (eligibleEducators.length === 0) {
    throw new BadRequestError("No eligible educators found participating in this olympiad");
  }

  const unassignedRemarks = await prisma.remark_requests.findMany({
    where: {
      results: { round_id: roundId },
      status: "pending",
      reviewer_id: null,
    },
    orderBy: { created_at: "asc" },
  });

  if (unassignedRemarks.length === 0) {
    return {
      assignedCount: 0,
      educatorCount: eligibleEducators.length,
      message: "No unassigned pending remarks to assign",
    };
  }

  // Track each educator's workload and assign to whoever has the fewest pending items
  const workload = eligibleEducators.map((edu) => ({
    userId: edu.userId,
    count: edu.pendingCount,
  }));

  const updates = [];

  for (const remark of unassignedRemarks) {
    // Sort ascending by current count to pick the least-loaded educator
    workload.sort((a, b) => a.count - b.count);
    const chosen = workload[0];
    chosen.count += 1;

    updates.push(
      prisma.remark_requests.update({
        where: { id: remark.id },
        data: { reviewer_id: chosen.userId },
      }),
    );
  }

  await prisma.$transaction(updates);

  return {
    assignedCount: unassignedRemarks.length,
    educatorCount: eligibleEducators.length,
  };
};

module.exports = {
  assertOwnsRound,
  listRemarks,
  listEligibleEducators,
  assignRemark,
  autoAssignRemarks,
};
