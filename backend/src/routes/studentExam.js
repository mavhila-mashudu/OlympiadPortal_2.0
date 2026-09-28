// @ts-nocheck
const express = require("express");
const { param, body } = require("express-validator");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} = require("../errors/AppError");
const { parseOptionList, scoreMcq } = require("../services/markingMath");
const { getAssignment, optionOrderFor, canonicalizeAnswer } = require("../services/examVariantService");
const { deadlineDecision, recordDeadlineDecision, recordRoundEvent } = require("../services/roundAuditService");

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

// Resolve the entrant record for the authenticated student.
const resolveEntrant = (req) => {
  if (!req.user.entrant) {
    throw new ForbiddenError("No entrant profile linked to your account");
  }
  return req.user.entrant;
};

// Verify the round is open and the student is registered.
const assertCanSit = async (roundId, entrant) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: {
      olympiads: true,
      papers: { include: { questions: { orderBy: { created_at: "asc" } } } },
    },
  });

  if (!round) throw new NotFoundError("Round not found");
  if (round.state !== "open") {
    throw new BadRequestError(`Round is not open (state: ${round.state})`);
  }
  if (round.exam_status !== "live") {
    throw new BadRequestError("This exam is not available for sitting");
  }

  // Check the entrant is registered for this round
  const registration = await prisma.entrant_registrations.findFirst({
    where: { entrant_id: entrant.id, round_id: roundId },
  });
  if (!registration) {
    throw new ForbiddenError("You are not registered for this round");
  }

  return round;
};

// ─────────────────────────────────────────
// GET /rounds/:roundId/exam
//
// Returns round info + questions STRIPPED of
// correct_option and correct_answer.  Used
// to render the exam sitting UI.
// ─────────────────────────────────────────
const getExam = async (req, res, next) => {
  try {
    const entrant = resolveEntrant(req);
    const round = await assertCanSit(req.params.roundId, entrant);
    // Check if the student already has a submission
    const existingSubmission = await prisma.submissions.findFirst({
      where: {
        round_id: round.id,
        entrant_id: entrant.id,
        route: "online",
      },
      include: {
        answers: {
          select: { id: true, question_id: true, answer_value: true },
        },
      },
    });

    const paper = round.papers[0];
    let assignment = null;
    if (existingSubmission?.exam_assignment_id) {
      assignment = await prisma.exam_assignments.findUnique({
        where: { id: existingSubmission.exam_assignment_id },
      });
    } else if (!existingSubmission && paper) {
      assignment = await getAssignment(round.id, entrant.id, paper.questions);
    }
    const questionById = new Map((paper?.questions ?? []).map((q) => [q.id, q]));
    const orderedQuestionIds = assignment?.question_order ?? (paper?.questions ?? []).map((q) => q.id);
    const orderedQuestions = orderedQuestionIds
      .map((id) => questionById.get(id))
      .filter(Boolean);

    // Strip the answers themselves but keep shape info:
    //   multi_select  → how many correct options exist
    //                   (not which ones), so the UI can
    //                   switch between radio and checkboxes
    //   negative_pct  → shown to students so they know
    //                   wrong selections cost marks
    const questions = orderedQuestions.map((q) => {
      const options = Array.isArray(q.options) ? q.options : null;
      const optionOrder = optionOrderFor(assignment, q.id);
      return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: options && optionOrder.length === options.length
        ? optionOrder.map((index) => options[index])
        : options,
      max_points: q.max_points,
      multi_select: parseOptionList(q.correct_option).length > 1,
      negative_pct: Number(q.negative_pct) || 0,
      // Deliberately omit correct_option and correct_answer
      };
    });

    const totalPoints = orderedQuestions.reduce(
      (sum, q) => sum + Number(q.max_points),
      0,
    );

    res.json({
      success: true,
      data: {
        round: {
          id: round.id,
          name: round.name,
          opens_at: round.opens_at,
          closes_at: round.closes_at,
          state: round.state,
        },
        questions,
        total_points: totalPoints,
        // Server clock — lets the client compute its
        // offset so the countdown survives a skewed
        // local clock.
        server_time: new Date().toISOString(),
        submission: existingSubmission
          ? {
            id: existingSubmission.id,
            status: existingSubmission.status,
            answers: existingSubmission.answers,
          }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// POST /rounds/:roundId/exam/start
//
// Creates a submission + empty answer rows
// for every question.  If a submission
// already exists, returns it (resume).
// ─────────────────────────────────────────
const startExam = async (req, res, next) => {
  try {
    const entrant = resolveEntrant(req);
    const round = await assertCanSit(req.params.roundId, entrant);
    const paper = round.papers[0];

    if (!paper || paper.questions.length === 0) {
      throw new BadRequestError("No questions available for this exam");
    }

    // Check for existing submission (resume)
    const findOnline = () =>
      prisma.submissions.findFirst({
        where: {
          round_id: round.id,
          entrant_id: entrant.id,
          route: "online",
        },
        include: {
          answers: {
            select: { id: true, question_id: true, answer_value: true },
          },
        },
      });
    const resume = (existing) => {
      if (existing.status !== "received") {
        throw new BadRequestError("This exam has already been submitted");
      }
      return res.json({
        success: true,
        data: {
          submission: {
            id: existing.id,
            status: existing.status,
            answers: existing.answers,
          },
        },
      });
    };

    const existing = await findOnline();
    if (existing) return resume(existing);

    // The school may already have captured this learner's answers on paper
    const offline = await prisma.submissions.findFirst({
      where: { round_id: round.id, entrant_id: entrant.id, route: "offline" },
      select: { id: true },
    });
    if (offline) {
      throw new ConflictError(
        "Your school has already submitted your results for this round",
      );
    }

    const assignment = await getAssignment(round.id, entrant.id, paper.questions);
    const questionsById = new Map(paper.questions.map((question) => [question.id, question]));

    // Create new submission with empty answers
    const idempotencyKey = `${round.id}:${entrant.id}:online`;

    let submission;
    try {
      submission = await prisma.$transaction(async (tx) => {
        const sub = await tx.submissions.create({
          data: {
            round_id: round.id,
            entrant_id: entrant.id,
            submitted_by: null, // student self-submitted
            route: "online",
            status: "received",
            idempotency_key: idempotencyKey,
            round_close_snapshot: round.closes_at,
            exam_assignment_id: assignment.id,
          },
        });

        // Create empty answer rows for each question
        const answers = [];
        for (const questionId of assignment.question_order) {
          const q = questionsById.get(questionId);
          if (!q) continue;
          const ans = await tx.answers.create({
            data: {
              submission_id: sub.id,
              question_id: q.id,
              answer_value: null,
            },
          });
          answers.push({
            id: ans.id,
            question_id: q.id,
            answer_value: null,
          });
        }

        await recordRoundEvent(round.id, "online_exam_started", "student_request", `exam-start:${sub.id}`,
          { submission_id: sub.id, question_count: answers.length }, tx);
        return { id: sub.id, status: sub.status, answers };
      });
    } catch (err) {
      // The database allows one submission per learner per round. If this
      // insert lost a race, either the same student started twice (a double
      // click or a second tab), so resume that attempt, or the school's paper
      // results arrived in the meantime.
      if (err.code !== "P2002") throw err;
      const started = await findOnline();
      if (started) return resume(started);
      throw new ConflictError(
        "Your school has already submitted your results for this round",
      );
    }

    res.status(201).json({ success: true, data: { submission } });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// PATCH /rounds/:roundId/exam/answers/:qid
//
// Update a single answer value.  Used for
// auto-save as the student types.
// ─────────────────────────────────────────
const saveAnswer = async (req, res, next) => {
  try {
    const entrant = resolveEntrant(req);
    const { answer_value } = req.body;
    const questionId = req.params.qid;

    // Find the student's submission for this round
    const submission = await prisma.submissions.findFirst({
      where: {
        round_id: req.params.roundId,
        entrant_id: entrant.id,
        route: "online",
        status: "received",
      },
    });

    if (!submission) {
      throw new BadRequestError(
        "No active submission found — start the exam first",
      );
    }

    // Find the answer row for this question
    const answer = await prisma.answers.findFirst({
      where: {
        submission_id: submission.id,
        question_id: questionId,
      },
    });

    if (!answer) {
      throw new NotFoundError("Answer row not found for this question");
    }

    // Update the answer value (no marking yet)
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.answers.update({
        where: { id: answer.id }, data: { answer_value: answer_value ?? null },
      });
      await recordRoundEvent(req.params.roundId, "answer_autosaved", "student_request",
        `answer-save:${answer.id}:${require("node:crypto").randomUUID()}`,
        { submission_id: submission.id, question_id: questionId }, tx);
      return saved;
    });

    res.json({
      success: true,
      data: {
        answer: {
          id: updated.id,
          question_id: updated.question_id,
          answer_value: updated.answer_value,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────
// POST /rounds/:roundId/exam/submit
//
// Finalize the submission.  Triggers
// auto-marking for MCQ and short-answer
// questions. The receipt timestamp is captured at entry;
// arriving at or after closes_at is rejected and recorded.
// ─────────────────────────────────────────
const submitExam = async (req, res, next) => {
  try {
    const receivedAt = new Date(); // Capture at the server as soon as the request arrives.
    const entrant = resolveEntrant(req);

    const submission = await prisma.submissions.findFirst({
      where: {
        round_id: req.params.roundId,
        entrant_id: entrant.id,
        route: "online",
      },
      include: {
        rounds: { select: { state: true } },
        exam_assignments: { select: { option_orders: true } },
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

    if (!submission) {
      throw new BadRequestError("No submission found — start the exam first");
    }

    if (submission.status !== "received") {
      throw new BadRequestError("This exam has already been submitted");
    }

    // Auto-mark choice questions (MCQ + True/False) and
    // short answers inline
    const now = receivedAt;
    const closesAt = submission.round_close_snapshot;
    const decision = deadlineDecision(now, closesAt);
    if (submission.rounds?.state !== undefined && submission.rounds.state !== "open") {
      decision.accepted = false;
      decision.explanation = `Round was "${submission.rounds.state}" when the submission arrived.`;
    }
    if (!decision.accepted) {
      await recordDeadlineDecision(req.params.roundId, entrant.id, "online", decision);
      if (submission.rounds?.state !== undefined && submission.rounds.state !== "open") {
        throw new BadRequestError(`Round is not open (state: ${submission.rounds.state})`);
      }
      throw new BadRequestError("Submission received at or after the round deadline");
    }
    const isLate = false;
    let totalPoints = 0;
    let allAutoMarked = true;

    await prisma.$transaction(async (tx) => {
      for (const answer of submission.answers) {
        const q = answer.questions;

        if ((q.type === "mcq" || q.type === "true_false") && q.correct_option) {
          // Choice-question scoring — partial credit
          // split across correct options, minus negative
          // marking per wrong selection (markingMath.scoreMcq).
          // True/False is the two-option case.
          const score = scoreMcq({
            maxPoints: q.max_points,
            correctOption: q.correct_option,
            selected: canonicalizeAnswer(
              answer.answer_value,
              submission.exam_assignments,
              q.id,
            ),
            negativePct: q.negative_pct,
          });
          totalPoints += score.points;

          await tx.answers.update({
            where: { id: answer.id },
            data: {
              is_correct: score.isCorrect,
              points_awarded: score.points,
              marked_at: now,
            },
          });
        } else if (q.type === "short_answer" && q.correct_answer) {
          // Case-insensitive match for short answers
          const studentAnswer = (answer.answer_value ?? "")
            .trim()
            .toLowerCase();
          const correct = (q.correct_answer ?? "").trim().toLowerCase();
          const isCorrect = studentAnswer === correct;
          const points = isCorrect ? Number(q.max_points) : 0;
          totalPoints += points;

          await tx.answers.update({
            where: { id: answer.id },
            data: {
              is_correct: isCorrect,
              points_awarded: points,
              marked_at: now,
            },
          });
        } else if (q.type === "essay") {
          allAutoMarked = false;
          // Leave for manual marking
        } else {
          allAutoMarked = false;
        }
      }

      // Update submission status and record the accepted boundary ruling.
      const status = allAutoMarked ? "automarked" : "queued_for_marking";
      await tx.submissions.update({
        where: { id: submission.id },
        data: { status, is_late: isLate },
      });
      await recordDeadlineDecision(req.params.roundId, entrant.id, "online", decision, tx);
      if (allAutoMarked) {
        await recordRoundEvent(req.params.roundId, "submission_automarked", "automatic", `online-mark:${submission.id}`, { submission_id: submission.id, total_points: totalPoints }, tx, now);
      }

      // Upsert results
      await tx.results.upsert({
        where: {
          round_id_entrant_id: {
            round_id: req.params.roundId,
            entrant_id: entrant.id,
          },
        },
        create: {
          round_id: req.params.roundId,
          entrant_id: entrant.id,
          total_points: totalPoints,
        },
        update: { total_points: totalPoints },
      });
    });

    res.json({
      success: true,
      data: {
        message: "Exam submitted successfully",
        status: allAutoMarked ? "automarked" : "queued_for_marking",
        total_points: totalPoints,
        is_late: isLate,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Routes ──────────────────────────────────────────

router.get("/:roundId/exam", requireRole("student"), getExam);
router.post("/:roundId/exam/start", requireRole("student"), startExam);

router.patch(
  "/:roundId/exam/answers/:qid",
  requireRole("student"),
  [
    param("roundId").isUUID(),
    param("qid").isUUID(),
    body("answer_value").optional().isString(),
  ],
  validate,
  saveAnswer,
);

router.post("/:roundId/exam/submit", requireRole("student"), submitExam);

module.exports = router;
