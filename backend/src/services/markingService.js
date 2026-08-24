// @ts-nocheck
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

// Walk  round → olympiad  and assert the
// organiser owns it.  Returns the round.
const assertRoundOwnership = async (roundId, userId, role) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });

  if (!round) throw new NotFoundError("Round not found");

  if (role === "organiser") {
    if (round.olympiads.organiser_id !== userId) {
      throw new ForbiddenError("Not your round");
    }
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }

  return round;
};

// Recalculate the total points for a submission
// and upsert the results row.  Used after any
// marking change (auto or manual).
const recalcSubmissionResults = async (tx, submission) => {
  const answers = await tx.answers.findMany({
    where: { submission_id: submission.id },
    select: { points_awarded: true },
  });

  const totalPoints = answers.reduce(
    (sum, a) => sum + (Number(a.points_awarded) || 0),
    0,
  );

  await tx.results.upsert({
    where: {
      round_id_entrant_id: {
        round_id: submission.round_id,
        entrant_id: submission.entrant_id,
      },
    },
    create: {
      round_id: submission.round_id,
      entrant_id: submission.entrant_id,
      total_points: totalPoints,
    },
    update: { total_points: totalPoints },
  });

  return totalPoints;
};

// ─────────────────────────────────────────
// AUTO-MARK A SINGLE SUBMISSION
//
// Marks every MCQ answer in the submission
// against its question's correct_option.
// Non-MCQ answers are left untouched (they
// queue for manual marking).
// ─────────────────────────────────────────
const autoMarkSubmission = async (submissionId) => {
  const submission = await prisma.submissions.findUnique({
    where: { id: submissionId },
    include: {
      answers: {
        include: {
          questions: {
            select: {
              id: true,
              type: true,
              correct_option: true,
              max_points: true,
            },
          },
        },
      },
    },
  });

  if (!submission) throw new NotFoundError("Submission not found");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const answer of submission.answers) {
      const q = answer.questions;

      // Only auto-mark MCQ with a known correct option
      if (q && q.type === "mcq" && q.correct_option) {
        const isCorrect = answer.answer_value === q.correct_option;
        const points = isCorrect ? Number(q.max_points) : 0;

        await tx.answers.update({
          where: { id: answer.id },
          data: {
            is_correct: isCorrect,
            points_awarded: points,
            marked_at: now,
          },
        });
      }
    }

    // Recalculate totals + results
    await recalcSubmissionResults(tx, submission);

    // Update submission status
    const hasUnmarked = submission.answers.some(
      (a) => a.questions && a.questions.type !== "mcq",
    );

    await tx.submissions.update({
      where: { id: submissionId },
      data: { status: hasUnmarked ? "queued_for_marking" : "automarked" },
    });
  });

  return { submissionId, status: "processed" };
};

// ─────────────────────────────────────────
// AUTO-MARK ALL SUBMISSIONS IN A ROUND
//
// Bulk-marks every submission still in
// "received" status.  Called when a round
// closes (see lifecycleService) or on
// demand by an organiser.
// ─────────────────────────────────────────
const autoMarkRound = async (roundId, userId, role) => {
  const round = await assertRoundOwnership(roundId, userId, role);

  const pending = await prisma.submissions.findMany({
    where: { round_id: roundId, status: "received" },
    select: { id: true },
  });

  const results = [];
  for (const sub of pending) {
    try {
      const r = await autoMarkSubmission(sub.id);
      results.push(r);
    } catch (err) {
      results.push({ submissionId: sub.id, error: err.message });
    }
  }

  return {
    total: pending.length,
    processed: results,
  };
};

// ─────────────────────────────────────────
// MANUALLY MARK A SINGLE ANSWER
//
// Used for non-MCQ questions that the
// auto-marker skipped.  The marker (any
// authenticated user with organiser role)
// sets is_correct and points_awarded.
// ─────────────────────────────────────────
const markAnswer = async (
  answerId,
  markerUserId,
  { is_correct, points_awarded },
) => {
  const answer = await prisma.answers.findUnique({
    where: { id: answerId },
    include: {
      submissions: true,
      questions: { select: { max_points: true } },
    },
  });

  if (!answer) throw new NotFoundError("Answer not found");

  // Clamp points to [0, max_points]
  const maxPoints = Number(answer.questions?.max_points ?? 0);
  const clampedPoints = Math.max(0, Math.min(points_awarded, maxPoints));

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.answers.update({
      where: { id: answerId },
      data: {
        is_correct,
        points_awarded: clampedPoints,
        marked_by: markerUserId,
        marked_at: now,
      },
    });

    // Recalculate the submission's total + results
    await recalcSubmissionResults(tx, answer.submissions);

    // If all answers in the submission are now marked,
    // advance the submission status.
    const allAnswers = await tx.answers.findMany({
      where: { submission_id: answer.submission_id },
      select: { marked_at: true },
    });

    const allMarked = allAnswers.every((a) => a.marked_at !== null);
    if (allMarked) {
      await tx.submissions.update({
        where: { id: answer.submission_id },
        data: { status: "marked" },
      });
    }
  });

  return { answerId, is_correct, points_awarded: clampedPoints };
};

// ─────────────────────────────────────────
// GENERATE FINAL RESULTS
//
// Ranks every entrant by total_points within
// the round, sets qualification status based
// on the round's qualifying_threshold, and
// finalises the results.  Also transitions
// the round to "results_released".
// ─────────────────────────────────────────
const generateResults = async (roundId, userId, role) => {
  const round = await assertRoundOwnership(roundId, userId, role);

  if (round.state === "scheduled" || round.state === "open") {
    throw new BadRequestError(
      `Cannot generate results — round is "${round.state}"`,
    );
  }

  const results = await prisma.results.findMany({
    where: { round_id: roundId },
    orderBy: { total_points: "desc" },
  });

  if (results.length === 0) {
    throw new BadRequestError("No results to generate — no submissions found");
  }

  const threshold = round.qualifying_threshold
    ? Number(round.qualifying_threshold)
    : null;

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const rank = i + 1;
      const qualified =
        threshold !== null ? Number(result.total_points) >= threshold : false;

      await tx.results.update({
        where: { id: result.id },
        data: { rank, qualified, finalised_at: now },
      });
    }

    // Transition round to results_released
    await tx.rounds.update({
      where: { id: roundId },
      data: { state: "results_released" },
    });
  });

  return {
    roundId,
    entrantCount: results.length,
    threshold,
    state: "results_released",
  };
};

module.exports = {
  autoMarkSubmission,
  autoMarkRound,
  markAnswer,
  generateResults,
};
