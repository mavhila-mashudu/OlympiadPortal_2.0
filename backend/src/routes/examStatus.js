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
} = require("../errors/AppError");

// Auth at router level; role per route. Role guards must NOT be applied
// with router.use — other routers are also mounted on /rounds in app.js,
// and a router-level guard would 403 their requests before Express
// falls through to them.
router.use(requireAuth);

// GET /rounds/:roundId/exam-status — get current exam status + question count
const getExamStatus = async (req, res, next) => {
  try {
    const round = await prisma.rounds.findUnique({
      where: { id: req.params.roundId },
      include: {
        olympiads: { select: { organiser_id: true } },
        papers: {
          include: {
            questions: { select: { id: true, type: true } },
          },
        },
      },
    });

    if (!round) throw new NotFoundError("Round not found");
    if (round.olympiads.organiser_id !== req.user.userId) {
      throw new ForbiddenError("Not your round");
    }

    const paper = round.papers[0];
    const questionCount = paper ? paper.questions.length : 0;
    const byType = {};
    if (paper) {
      for (const q of paper.questions) {
        byType[q.type] = (byType[q.type] || 0) + 1;
      }
    }

    // Resolve the approver's name for the audit trail
    let approved_by_name = null;
    if (round.approved_by) {
      const approver = await prisma.users.findUnique({
        where: { id: round.approved_by },
        select: { full_name: true },
      });
      approved_by_name = approver?.full_name ?? null;
    }

    res.json({
      success: true,
      data: {
        exam_status: round.exam_status,
        state: round.state,
        question_count: questionCount,
        questions_by_type: byType,
        paper_id: paper?.id || null,
        approved_by: round.approved_by,
        approved_at: round.approved_at,
        approved_by_name,
      },
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /rounds/:roundId/exam-status — transition exam status
// Allowed transitions: draft → ready, ready → draft (un-approve), ready → live
const updateExamStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["draft", "ready", "live"].includes(status)) {
      throw new BadRequestError("status must be one of: draft, ready, live");
    }

    const round = await prisma.rounds.findUnique({
      where: { id: req.params.roundId },
      include: {
        olympiads: { select: { organiser_id: true } },
        papers: { include: { questions: true } },
      },
    });

    if (!round) throw new NotFoundError("Round not found");
    if (round.olympiads.organiser_id !== req.user.userId) {
      throw new ForbiddenError("Not your round");
    }

    // Validate transitions
    const current = round.exam_status;
    const allowed = {
      draft: ["ready"],
      ready: ["draft", "live"],
      live: [],
    };

    if (!allowed[current].includes(status)) {
      throw new BadRequestError(
        `Cannot transition from ${current} to ${status}`,
      );
    }

    // Must have at least one question before going ready
    const paper = round.papers[0];
    if (status === "ready" && (!paper || paper.questions.length === 0)) {
      throw new BadRequestError(
        "Cannot mark as ready — at least one question is required",
      );
    }

    // Audit trail: going live records which organiser
    // verified the exam (two-person integrity).  Any
    // other transition clears a stale approval record.
    const patchData = { exam_status: status };
    if (status === "live") {
      patchData.approved_by = req.user.userId;
      patchData.approved_at = new Date();
    } else {
      patchData.approved_by = null;
      patchData.approved_at = null;
    }

    const updated = await prisma.rounds.update({
      where: { id: req.params.roundId },
      data: patchData,
    });

    res.json({
      success: true,
      data: { exam_status: updated.exam_status },
    });
  } catch (err) {
    next(err);
  }
};

router.get("/:roundId/exam-status", requireRole("organiser"), getExamStatus);
router.patch(
  "/:roundId/exam-status",
  requireRole("organiser"),
  [
    param("roundId").isUUID(),
    body("status").trim().notEmpty().isIn(["draft", "ready", "live"]),
  ],
  validate,
  updateExamStatus,
);

module.exports = router;
