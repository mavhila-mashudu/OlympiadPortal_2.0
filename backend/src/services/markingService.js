// @ts-nocheck
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");
const { scoreMcq } = require("./markingMath");

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

// Walk  round → olympiad  and assert the
// caller has access.  Organisers must own the
// olympiad; educators must have their school
// registered for it.  Returns the round plus
// the educator's school_id (null for organisers).
const assertRoundOwnership = async (roundId, userId, role) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });

  if (!round) throw new NotFoundError("Round not found");

  let schoolId = null;

  if (role === "organiser") {
    if (round.olympiads.organiser_id !== userId) {
      throw new ForbiddenError("Not your round");
    }
  } else if (role === "educator") {
    const educator = await prisma.educators.findUnique({
      where: { user_id: userId },
    });
    if (!educator) throw new ForbiddenError("Educator profile not found");

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
    schoolId = educator.school_id;
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }

  return { ...round, _educatorSchoolId: schoolId };
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
// Marks every MCQ answer with the shared
// partial-credit + negative-marking rules
// (see markingMath.scoreMcq) and every
// short_answer against correct_answer
// (case-insensitive).  Essay answers
// are left untouched (they queue for
// manual marking).
// ─────────────────────────────────────────
const isAutoMarkable = (q) =>
  ((q.type === "mcq" || q.type === "true_false") && q.correct_option) ||
  (q.type === "short_answer" && q.correct_answer);

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
              correct_answer: true,
              negative_pct: true,
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

      if (!q || answer.marked_at !== null) continue;

      let isCorrect = null;
      let points = null;

      // Choice questions (MCQ + True/False) — partial credit
      // + negative marking (multi-answer aware, see
      // markingMath.scoreMcq)
      if ((q.type === "mcq" || q.type === "true_false") && q.correct_option) {
        const score = scoreMcq({
          maxPoints: q.max_points,
          correctOption: q.correct_option,
          selected: answer.answer_value,
          negativePct: q.negative_pct,
        });
        isCorrect = score.isCorrect;
        points = score.points;
      }

      // Short answer — case-insensitive trimmed match
      if (q.type === "short_answer" && q.correct_answer) {
        const studentAnswer = (answer.answer_value ?? "").trim().toLowerCase();
        const correct = q.correct_answer.trim().toLowerCase();
        isCorrect = studentAnswer === correct;
        points = isCorrect ? Number(q.max_points) : 0;
      }

      if (isCorrect !== null) {
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
    const hasManual = submission.answers.some(
      (a) => a.questions && !isAutoMarkable(a.questions),
    );

    await tx.submissions.update({
      where: { id: submissionId },
      data: { status: hasManual ? "queued_for_marking" : "automarked" },
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
//
// The internal variant skips ownership
// checks — it is meant for system /
// lifecycle use where there is no user.
// ─────────────────────────────────────────
const autoMarkRoundInternal = async (roundId) => {
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
// AUTO-MARK A ROUND (with ownership check)
//
// Thin wrapper around autoMarkRoundInternal
// that first verifies the caller owns the
// round.  Used by the organiser-facing
// POST /rounds/:roundId/mark endpoint.
// ─────────────────────────────────────────
const autoMarkRound = async (roundId, userId, role) => {
  const round = await assertRoundOwnership(roundId, userId, role);

  // Educators can only auto-mark submissions from their own school
  const where = { round_id: roundId, status: "received" };
  if (round._educatorSchoolId) {
    where.entrants = { school_id: round._educatorSchoolId };
  }

  const pending = await prisma.submissions.findMany({
    where,
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

  return { total: pending.length, processed: results };
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
  roundId,
  answerId,
  markerUserId,
  role,
  { is_correct, points_awarded },
) => {
  // Same access rules as the marking queue: the organiser who owns the
  // round, or an educator marking their own school's entrants
  const round = await assertRoundOwnership(roundId, markerUserId, role);

  const answer = await prisma.answers.findUnique({
    where: { id: answerId },
    include: {
      submissions: { include: { entrants: { select: { school_id: true } } } },
      questions: { select: { max_points: true } },
    },
  });

  // An answer from another round is reported as missing, so a marker can't
  // reach other rounds' answers through a round they do have access to
  if (!answer || answer.submissions.round_id !== roundId) {
    throw new NotFoundError("Answer not found");
  }
  if (
    round._educatorSchoolId &&
    answer.submissions.entrants?.school_id !== round._educatorSchoolId
  ) {
    throw new ForbiddenError("Not your school's submission");
  }

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
  // Only organisers can generate results (the route guard enforces this,
  // but we double-check here for safety).
  if (role !== "organiser") {
    throw new ForbiddenError("Only organisers can generate final results");
  }

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

    // Transition round to results_released.  results_release_at records
    // the actual release moment — the notification dispatcher uses it to
    // send the "results are out" notices.
    await tx.rounds.update({
      where: { id: roundId },
      data: { state: "results_released", results_release_at: now },
    });

    await tx.papers.updateMany({
      where: { round_id: roundId },
      data: { is_archived: true, released_at: now },
    });
  });

  return {
    roundId,
    entrantCount: results.length,
    threshold,
    state: "results_released",
  };
};

// ─────────────────────────────────────────
// GET MARKING QUEUE FOR A ROUND
//
// Returns every submission still holding
// unmarked answers (essays), with the
// entrant's name, the question prompt and
// the student's answer text — everything
// a human marker needs to award points.
// ─────────────────────────────────────────
const getMarkingQueue = async (roundId, userId, role) => {
  const round = await assertRoundOwnership(roundId, userId, role);

  // Educators only see submissions from their own school
  const where = { round_id: roundId, status: "queued_for_marking" };
  if (round._educatorSchoolId) {
    where.entrants = { school_id: round._educatorSchoolId };
  }

  const submissions = await prisma.submissions.findMany({
    where,
    include: {
      entrants: { select: { id: true, full_name: true, grade: true } },
      answers: {
        where: { marked_at: null },
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
        orderBy: { questions: { created_at: "asc" } },
      },
    },
    orderBy: { received_at: "asc" },
  });

  return submissions.filter((s) => s.answers.length > 0);
};

module.exports = {
  autoMarkSubmission,
  autoMarkRoundInternal,
  autoMarkRound,
  markAnswer,
  generateResults,
  getMarkingQueue,
};
