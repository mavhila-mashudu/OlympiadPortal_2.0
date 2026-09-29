const router = require("express").Router();
const prisma = require("../config/database").default;
const { requireAuth, requireRole } = require("../middlewares/auth");
const { BadRequestError, ForbiddenError, NotFoundError, ConflictError } = require("../errors/AppError");
const { recalculateRoundResults: recalculate } = require("../services/resultRecalculationService");

router.use(requireAuth);
async function ownedRound(roundId, organiserId) {
  const round = await prisma.rounds.findUnique({ where: { id: roundId }, include: { olympiads: true } });
  if (!round) throw new NotFoundError("Round not found");
  if (round.olympiads.organiser_id !== organiserId) throw new ForbiddenError("Not your round");
  return round;
}

async function assertRoundReviewAccess(roundId, userId, role) {
  const round = await prisma.rounds.findUnique({ where: { id: roundId }, include: { olympiads: true } });
  if (!round) throw new NotFoundError("Round not found");
  if (role === "organiser") {
    if (round.olympiads.organiser_id !== userId) throw new ForbiddenError("Not your round");
  } else if (role === "educator") {
    const educator = await prisma.educators.findUnique({ where: { user_id: userId } });
    if (!educator) throw new ForbiddenError("Educator profile not found");
    const registration = await prisma.school_registrations.findFirst({
      where: { school_id: educator.school_id, olympiad_id: round.olympiads.id },
    });
    if (!registration) throw new ForbiddenError("Your school is not registered for this olympiad");
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }
  return round;
}

router.get("/:roundId/review-sample", requireRole("organiser", "educator"), async (req, res, next) => {
  try {
    await assertRoundReviewAccess(req.params.roundId, req.user.userId, req.user.role);
    const answers = await prisma.answers.findMany({
      where: { submissions: { round_id: req.params.roundId }, marked_by: { not: null }, marked_at: { not: null } },
      take: 200,
      orderBy: { marked_at: "desc" },
      include: {
        questions: { select: { prompt: true, max_points: true } },
        submissions: { select: { entrants: { select: { full_name: true } } } },
        marking_reviews: { select: { id: true } },
        users: { select: { id: true, email: true, full_name: true, role: true } },
      },
    });
    // Deterministic ten-percent sample so reviewers see the same set on refresh.
    const sample = answers.filter((_, i) => i % 10 === 0).slice(0, 20);
    res.json({ success: true, data: { sample } });
  } catch (err) { next(err); }
});
router.patch("/:roundId/review-sample/:answerId", requireRole("organiser", "educator"), async (req, res, next) => {
  try {
    await assertRoundReviewAccess(req.params.roundId, req.user.userId, req.user.role);
    const answer = await prisma.answers.findUnique({ where: { id: req.params.answerId }, include: { questions: true, submissions: true } });
    if (!answer || answer.submissions.round_id !== req.params.roundId || !answer.marked_at) throw new NotFoundError("Marked answer not found");
    if (answer.marked_by === req.user.userId) throw new ForbiddenError("A marker cannot moderate their own marking");
    const points = Number(req.body.points_awarded);
    if (!Number.isFinite(points) || points < 0 || points > Number(answer.questions.max_points) || !String(req.body.comment || "").trim()) {
      throw new BadRequestError("Valid points and a review comment are required");
    }
    await prisma.$transaction(async (tx) => {
      await tx.marking_reviews.create({ data: { answer_id: answer.id, reviewer_id: req.user.userId, original_points: answer.points_awarded || 0, revised_points: points, comment: req.body.comment.trim() } });
      await tx.answers.update({ where: { id: answer.id }, data: { points_awarded: points } });
      await recalculate(tx, req.params.roundId);
    });
    res.json({ success: true, data: { message: "Review saved and results recalculated" } });
  } catch (err) { next(err); }
});
// Remarks a student made from their results page carry only the result link,
// so the round and entrant come from the result.
const presentRemark = (remark) => ({
  ...remark,
  round_id: remark.results?.round_id,
  entrant_id: remark.results?.entrant_id,
  entrants: remark.results?.entrants,
});
router.get("/:roundId/remarks", requireRole("organiser"), async (req, res, next) => {
  try {
    await ownedRound(req.params.roundId, req.user.userId);
    const remarks = await prisma.remark_requests.findMany({
      where: { results: { round_id: req.params.roundId } },
      orderBy: { created_at: "asc" },
      include: { results: { include: { entrants: { select: { full_name: true, submissions: {
        where: { round_id: req.params.roundId },
        select: { id: true, answers: { select: { id: true, answer_value: true, points_awarded: true,
          questions: { select: { prompt: true, max_points: true } } } } },
      } } } } } },
    });
    res.json({ success: true, data: { remarks: remarks.map(presentRemark) } });
  } catch (err) { next(err); }
});
router.post("/:roundId/remark", requireRole("student"), async (req, res, next) => {
  try {
    const entrantId = req.user.entrant?.id;
    if (!entrantId) throw new ForbiddenError("No linked entrant profile");
    const result = await prisma.results.findUnique({ where: { round_id_entrant_id: { round_id: req.params.roundId, entrant_id: entrantId } }, include: { rounds: true } });
    if (!result || result.rounds.state !== "results_released") throw new ForbiddenError("Result not released for this student");
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 10 || reason.length > 2000) throw new BadRequestError("Provide a reason of 10 to 2000 characters");
    // Store both the direct round link and the result link used by educator reviews.
    const remark = await prisma.remark_requests.create({
      data: { round_id: req.params.roundId, entrant_id: entrantId, result_id: result.id, reason },
      include: { results: { select: { round_id: true, entrant_id: true } } },
    }).catch((err) => {
      if (err.code === "P2002") throw new ConflictError("You already requested a remark for this round");
      throw err;
    });
    res.status(201).json({ success: true, data: { remark: presentRemark(remark) } });
  } catch (err) { next(err); }
});
router.get("/:roundId/my-remark", requireRole("student"), async (req, res, next) => {
  try {
    if (!req.user.entrant) throw new ForbiddenError("No linked entrant profile");
    const remark = await prisma.remark_requests.findFirst({
      where: { results: { round_id: req.params.roundId, entrant_id: req.user.entrant.id } },
      include: { results: { select: { round_id: true, entrant_id: true } } },
    });
    res.json({ success: true, data: { remark: remark ? presentRemark(remark) : null } });
  } catch (err) { next(err); }
});
router.patch("/:roundId/remarks/:remarkId", requireRole("organiser"), async (req, res, next) => {
  try {
    await ownedRound(req.params.roundId, req.user.userId);
    const remark = await prisma.remark_requests.findUnique({ where: { id: req.params.remarkId }, include: { results: { select: { round_id: true, entrant_id: true } } } });
    if (!remark || remark.results.round_id !== req.params.roundId) throw new NotFoundError("Remark not found");
    if (remark.status !== "pending") throw new ConflictError("Remark has already been decided");
    const status = req.body.status;
    const decision = String(req.body.decision || "").trim();
    if (!["approved", "rejected"].includes(status) || decision.length < 5) throw new BadRequestError("Decision and approved/rejected status required");
    let answer = null;
    let points = null;
    if (status === "approved") {
      points = Number(req.body.points_awarded);
      answer = await prisma.answers.findUnique({ where: { id: req.body.answer_id }, include: { questions: true, submissions: true } });
      if (!answer || answer.submissions.round_id !== req.params.roundId || answer.submissions.entrant_id !== remark.results.entrant_id || !Number.isFinite(points) || points < 0 || points > Number(answer.questions.max_points)) {
        throw new BadRequestError("Select an answer from this entrant and valid revised points");
      }
    }
    await prisma.$transaction(async (tx) => {
      if (answer) {
        await tx.marking_reviews.create({ data: { answer_id: answer.id, reviewer_id: req.user.userId, original_points: answer.points_awarded || 0, revised_points: points, comment: decision } });
        await tx.answers.update({ where: { id: answer.id }, data: { points_awarded: points } });
        await recalculate(tx, req.params.roundId);
      }
      const now = new Date();
      await tx.remark_requests.update({ where: { id: remark.id }, data: { status, decision, decided_at: now, reviewer_id: req.user.userId, reviewed_at: now } });
    });
    res.json({ success: true, data: { message: "Remark decided" } });
  } catch (err) { next(err); }
});
module.exports = router;
