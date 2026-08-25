// @ts-nocheck
const crypto = require("crypto");
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} = require("../errors/AppError");

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

// Resolve educator record from a user id.
const resolveEducator = async (userId) => {
  const educator = await prisma.educators.findUnique({
    where: { user_id: userId },
    include: { schools: true },
  });
  if (!educator) throw new ForbiddenError("Educator profile not found");
  return educator;
};

// Verify the round is open and belongs to a valid olympiad.
const assertRoundOpen = async (roundId) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true, papers: { include: { questions: true } } },
  });

  if (!round) throw new NotFoundError("Round not found");
  if (round.state !== "open") {
    throw new BadRequestError(
      `Submissions are not accepted — round is "${round.state}"`,
    );
  }

  return round;
};

// Build a deterministic idempotency key from the
// triple (round, entrant, route) so a retry won't
// create a duplicate submission.
const buildIdempotencyKey = (roundId, entrantId, route) =>
  `${roundId}:${entrantId}:${route}`;

// ─────────────────────────────────────────
// CREATE SUBMISSION  (+ inline auto-mark)
//
// An educator submits answers on behalf of an
// entrant.  MCQ answers are marked immediately
// against the question's correct_option.
// ─────────────────────────────────────────
const createSubmission = async (roundId, educatorUserId, body) => {
  const { entrant_id, route, answers } = body;

  // 1. Round must be open
  const round = await assertRoundOpen(roundId);

  // 2. Educator must exist and belong to same school as entrant
  const educator = await resolveEducator(educatorUserId);

  const entrant = await prisma.entrants.findUnique({
    where: { id: entrant_id },
  });
  if (!entrant) throw new NotFoundError("Entrant not found");
  if (entrant.school_id !== educator.school_id) {
    throw new ForbiddenError("Entrant does not belong to your school");
  }

  // 3. Idempotency — reject duplicate (round + entrant + route)
  const idempotencyKey = buildIdempotencyKey(roundId, entrant_id, route);

  const existing = await prisma.submissions.findUnique({
    where: { idempotency_key: idempotencyKey },
  });
  if (existing) {
    throw new ConflictError(
      "A submission already exists for this entrant, round, and route",
    );
  }

  // 4. Validate that every question_id belongs to the round's paper
  const paper = round.papers[0]; // a round has at most one paper
  const validQuestionIds = new Set((paper?.questions ?? []).map((q) => q.id));

  if (answers && answers.length > 0 && !paper) {
    throw new BadRequestError("No paper exists for this round");
  }

  for (const a of answers ?? []) {
    if (!validQuestionIds.has(a.question_id)) {
      throw new BadRequestError(
        `Question ${a.question_id} does not belong to this round's paper`,
      );
    }
  }

  // 5. Build the question lookup for auto-marking
  const questionMap = new Map((paper?.questions ?? []).map((q) => [q.id, q]));

  // 6. Create submission + answers + auto-mark in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.submissions.create({
      data: {
        round_id: roundId,
        entrant_id,
        submitted_by: educator.id,
        route: route || "offline",
        status: "received",
        idempotency_key: idempotencyKey,
        round_close_snapshot: round.closes_at,
      },
    });

    let totalPoints = 0;
    let allAutoMarked = true;
    const answerRows = [];

    for (const a of answers ?? []) {
      const question = questionMap.get(a.question_id);

      let isCorrect = null;
      let pointsAwarded = null;
      let markedAt = null;

      // Auto-mark MCQ questions immediately
      if (question && question.type === "mcq" && question.correct_option) {
        isCorrect = a.answer_value === question.correct_option;
        pointsAwarded = isCorrect ? Number(question.max_points) : 0;
        markedAt = new Date();
        totalPoints += pointsAwarded;
      } else {
        // Non-MCQ — needs manual marking
        allAutoMarked = false;
      }

      const row = await tx.answers.create({
        data: {
          submission_id: submission.id,
          question_id: a.question_id,
          answer_value: a.answer_value ?? null,
          is_correct: isCorrect,
          points_awarded: pointsAwarded,
          marked_at: markedAt,
        },
      });
      answerRows.push(row);
    }

    // Update submission status
    const submissionStatus =
      allAutoMarked && (answers?.length ?? 0) > 0
        ? "automarked"
        : answers?.length > 0
          ? "received"
          : "received";

    await tx.submissions.update({
      where: { id: submission.id },
      data: { status: submissionStatus },
    });

    // Create or update the results row
    if (answers?.length > 0) {
      await tx.results.upsert({
        where: {
          round_id_entrant_id: {
            round_id: roundId,
            entrant_id,
          },
        },
        create: {
          round_id: roundId,
          entrant_id,
          total_points: totalPoints,
        },
        update: {
          total_points: totalPoints,
        },
      });
    }

    return { submission, answers: answerRows, totalPoints, allAutoMarked };
  });

  return result;
};

// ─────────────────────────────────────────
// LIST SUBMISSIONS FOR A ROUND
//
// Organiser: can see all submissions for any of
//            their rounds.
// Educator:  can only see submissions for entrants
//            at their own school.
// ─────────────────────────────────────────
const listSubmissions = async (roundId, userId, role) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });
  if (!round) throw new NotFoundError("Round not found");

  let where = { round_id: roundId };

  if (role === "organiser") {
    if (round.olympiads.organiser_id !== userId) {
      throw new ForbiddenError("Not your round");
    }
  } else if (role === "educator") {
    const educator = await resolveEducator(userId);
    // Only show submissions from entrants at the educator's school
    where.entrants = { school_id: educator.school_id };
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }

  const submissions = await prisma.submissions.findMany({
    where,
    orderBy: { received_at: "desc" },
    include: {
      entrants: { select: { id: true, full_name: true } },
      _count: { select: { answers: true } },
    },
  });

  return submissions;
};

// ─────────────────────────────────────────
// GET A SINGLE SUBMISSION WITH ANSWERS
// ─────────────────────────────────────────
const getSubmission = async (submissionId, userId, role) => {
  const submission = await prisma.submissions.findUnique({
    where: { id: submissionId },
    include: {
      rounds: { include: { olympiads: true } },
      entrants: { select: { id: true, full_name: true, school_id: true } },
      answers: {
        include: {
          questions: {
            select: { id: true, prompt: true, type: true, max_points: true },
          },
        },
        orderBy: { questions: { created_at: "asc" } },
      },
    },
  });

  if (!submission) throw new NotFoundError("Submission not found");

  if (role === "organiser") {
    if (submission.rounds.olympiads.organiser_id !== userId) {
      throw new ForbiddenError("Not your submission");
    }
  } else if (role === "educator") {
    const educator = await resolveEducator(userId);
    if (submission.entrants.school_id !== educator.school_id) {
      throw new ForbiddenError("Not your school's submission");
    }
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }

  return submission;
};

module.exports = { createSubmission, listSubmissions, getSubmission };
