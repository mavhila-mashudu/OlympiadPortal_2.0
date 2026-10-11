// @ts-nocheck
const prisma = require('../config/database').default;
const {
    NotFoundError,
    ForbiddenError,
    BadRequestError,
    ConflictError,
} = require('../errors/AppError');
const {
    recalculateRoundResults: recalculate,
} = require('./resultRecalculationService');

// An educator's review leaves a remark "reviewed"; an organiser's decision
// leaves it "approved" or "rejected". This page shows all three as reviewed.
const DECIDED_STATUSES = ['reviewed', 'approved', 'rejected'];

/**
 * Asserts that the given round belongs to an olympiad owned by the organiser.
 */
const assertOwnsRound = async (roundId, organiserId) => {
    const round = await prisma.rounds.findUnique({
        where: { id: roundId },
        include: {
            olympiads: { select: { id: true, organiser_id: true, name: true } },
        },
    });

    if (!round) {
        throw new NotFoundError('Round not found');
    }

    if (round.olympiads?.organiser_id !== organiserId) {
        throw new ForbiddenError("You do not own this round's olympiad");
    }

    return round;
};

/**
 * List all remark requests across the organiser's olympiads/rounds.
 */
const listRemarks = async (
    organiserId,
    { olympiadId, roundId, status } = {}
) => {
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

    if (status === 'unassigned') {
        where.reviewer_id = null;
        where.status = 'pending';
    } else if (status === 'assigned') {
        where.reviewer_id = { not: null };
        where.status = 'pending';
    } else if (status === 'reviewed') {
        where.status = { in: DECIDED_STATUSES };
    } else if (status === 'pending') {
        where.status = 'pending';
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
        orderBy: { created_at: 'desc' },
    });

    // Collect reviewer IDs to batch-fetch reviewer profiles
    const reviewerUserIds = [
        ...new Set(remarks.map((r) => r.reviewer_id).filter(Boolean)),
    ];

    const educators =
        reviewerUserIds.length > 0
            ? await prisma.educators.findMany({
                  where: { user_id: { in: reviewerUserIds } },
                  include: {
                      users: {
                          select: { id: true, full_name: true, email: true },
                      },
                      schools: { select: { id: true, name: true } },
                  },
              })
            : [];

    const educatorMap = new Map(
        educators.map((e) => [
            e.user_id,
            {
                name: e.users?.full_name || 'Educator',
                schoolName: e.schools?.name || 'School',
            },
        ])
    );

    return remarks.map((remark) => {
        const reviewer = remark.reviewer_id
            ? educatorMap.get(remark.reviewer_id)
            : null;
        return {
            id: remark.id,
            resultId: remark.result_id,
            studentName: remark.results?.entrants?.full_name || 'Student',
            schoolId: remark.results?.entrants?.schools?.id || null,
            schoolName: remark.results?.entrants?.schools?.name || 'School',
            roundId: remark.results?.rounds?.id || null,
            roundName: remark.results?.rounds?.name || 'Round',
            olympiadId: remark.results?.rounds?.olympiads?.id || null,
            olympiadName: remark.results?.rounds?.olympiads?.name || 'Olympiad',
            score: Number(remark.results?.total_points ?? 0),
            reason: remark.reason,
            status: remark.status === 'pending' ? 'pending' : 'reviewed',
            reviewerId: remark.reviewer_id,
            reviewerName: reviewer ? reviewer.name : null,
            reviewerSchool: reviewer ? reviewer.schoolName : null,
            reviewNote: remark.decision
                ? `${remark.status === 'approved' ? 'Approved' : 'Rejected'}: ${remark.decision}`
                : remark.review_note,
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
        orderBy: [
            { schools: { name: 'asc' } },
            { users: { full_name: 'asc' } },
        ],
    });

    // Calculate current active pending assignments for each educator in this olympiad
    const reviewerUserIds = educators.map((e) => e.user_id);
    const pendingRemarks = await prisma.remark_requests.groupBy({
        by: ['reviewer_id'],
        where: {
            reviewer_id: { in: reviewerUserIds },
            status: 'pending',
        },
        _count: { id: true },
    });

    const countMap = new Map(
        pendingRemarks.map((item) => [item.reviewer_id, item._count.id])
    );

    return educators.map((edu) => ({
        id: edu.id,
        userId: edu.user_id,
        name: edu.users?.full_name || 'Educator',
        email: edu.users?.email || '',
        schoolId: edu.school_id,
        schoolName: edu.schools?.name || 'School',
        pendingCount: countMap.get(edu.user_id) || 0,
    }));
};

/**
 * Manually assign a remark request to a specific educator. The educator must
 * be from another school than the learner, so no one reviews their own
 * school's marks.
 */
const assignRemark = async (organiserId, remarkId, reviewerUserId) => {
    const remark = await prisma.remark_requests.findUnique({
        where: { id: remarkId },
        include: {
            results: {
                include: {
                    entrants: { select: { school_id: true } },
                    rounds: {
                        include: {
                            olympiads: {
                                select: { id: true, organiser_id: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!remark) {
        throw new NotFoundError('Remark request not found');
    }

    if (remark.results?.rounds?.olympiads?.organiser_id !== organiserId) {
        throw new ForbiddenError("You do not own this round's olympiad");
    }

    if (remark.status !== 'pending') {
        throw new BadRequestError(
            'Cannot reassign a remark that has already been reviewed'
        );
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
        throw new BadRequestError(
            'The selected educator is not participating in this olympiad'
        );
    }

    const learnerSchoolId = remark.results.entrants?.school_id;
    if (learnerSchoolId && educator.school_id === learnerSchoolId) {
        throw new BadRequestError(
            'An educator cannot review a remark from a learner at their own school'
        );
    }

    return prisma.remark_requests.update({
        where: { id: remarkId },
        data: { reviewer_id: reviewerUserId },
    });
};

/**
 * Automatically distribute all unassigned pending remarks for a round
 * across eligible educators, balancing the review workload evenly. A remark
 * only goes to an educator from another school than the learner; one with
 * no such educator stays unassigned and is counted as skipped.
 */
const autoAssignRemarks = async (organiserId, roundId) => {
    const eligibleEducators = await listEligibleEducators(organiserId, roundId);

    if (eligibleEducators.length === 0) {
        throw new BadRequestError(
            'No eligible educators found participating in this olympiad'
        );
    }

    const unassignedRemarks = await prisma.remark_requests.findMany({
        where: {
            results: { round_id: roundId },
            status: 'pending',
            reviewer_id: null,
        },
        include: {
            results: { select: { entrants: { select: { school_id: true } } } },
        },
        orderBy: { created_at: 'asc' },
    });

    if (unassignedRemarks.length === 0) {
        return {
            assignedCount: 0,
            skippedCount: 0,
            educatorCount: eligibleEducators.length,
            message: 'No unassigned pending remarks to assign',
        };
    }

    // Track each educator's workload and assign to whoever has the fewest pending items
    const workload = eligibleEducators.map((edu) => ({
        userId: edu.userId,
        schoolId: edu.schoolId,
        count: edu.pendingCount,
    }));

    const updates = [];

    for (const remark of unassignedRemarks) {
        const learnerSchoolId = remark.results?.entrants?.school_id;
        // The least-loaded educator from another school than the learner
        const chosen = workload
            .filter((edu) => edu.schoolId !== learnerSchoolId)
            .sort((a, b) => a.count - b.count)[0];
        if (!chosen) continue;
        chosen.count += 1;

        updates.push(
            prisma.remark_requests.update({
                where: { id: remark.id },
                data: { reviewer_id: chosen.userId },
            })
        );
    }

    if (updates.length > 0) await prisma.$transaction(updates);

    return {
        assignedCount: updates.length,
        skippedCount: unassignedRemarks.length - updates.length,
        educatorCount: eligibleEducators.length,
    };
};

/**
 * The organiser's decision on a remark: reject the appeal, or approve it
 * with a revised mark on one of the entrant's answers. An approval re-marks
 * the answer, recalculates the round (totals, ranks, next-round entry) and
 * records the review; either way the request is stamped decided.
 */
const decideRemark = async (
    organiserId,
    remarkId,
    { status, decision: rawDecision, answer_id, points_awarded }
) => {
    const remark = await prisma.remark_requests.findUnique({
        where: { id: remarkId },
        include: {
            results: { select: { round_id: true, entrant_id: true } },
        },
    });
    if (!remark) {
        throw new NotFoundError('Remark not found');
    }

    // The round comes from the remark itself; only its owner may decide
    const roundId = remark.results?.round_id;
    if (!roundId) {
        throw new NotFoundError('Remark not found');
    }
    const round = await prisma.rounds.findUnique({
        where: { id: roundId },
        include: { olympiads: true },
    });
    if (!round) {
        throw new NotFoundError('Round not found');
    }
    if (round.olympiads.organiser_id !== organiserId) {
        throw new ForbiddenError('Not your round');
    }

    if (remark.status !== 'pending') {
        throw new ConflictError('Remark has already been decided');
    }
    const decision = String(rawDecision || '').trim();
    if (!['approved', 'rejected'].includes(status) || decision.length < 5) {
        throw new BadRequestError(
            'Decision and approved/rejected status required'
        );
    }

    let answer = null;
    let points = null;
    if (status === 'approved') {
        points = Number(points_awarded);
        answer = await prisma.answers.findUnique({
            where: { id: answer_id },
            include: { questions: true, submissions: true },
        });
        if (
            !answer ||
            answer.submissions.round_id !== roundId ||
            answer.submissions.entrant_id !== remark.results.entrant_id ||
            !Number.isFinite(points) ||
            points < 0 ||
            points > Number(answer.questions.max_points)
        ) {
            throw new BadRequestError(
                'Select an answer from this entrant and valid revised points'
            );
        }
    }

    await prisma.$transaction(async (tx) => {
        if (answer) {
            await tx.marking_reviews.create({
                data: {
                    answer_id: answer.id,
                    reviewer_id: organiserId,
                    original_points: answer.points_awarded || 0,
                    revised_points: points,
                    comment: decision,
                },
            });
            await tx.answers.update({
                where: { id: answer.id },
                data: { points_awarded: points },
            });
            await recalculate(tx, roundId);
        }
        const now = new Date();
        await tx.remark_requests.update({
            where: { id: remark.id },
            data: {
                status,
                decision,
                decided_at: now,
                reviewer_id: organiserId,
                reviewed_at: now,
            },
        });
    });

    return { message: 'Remark decided' };
};

module.exports = {
    assertOwnsRound,
    listRemarks,
    listEligibleEducators,
    assignRemark,
    autoAssignRemarks,
    decideRemark,
};
