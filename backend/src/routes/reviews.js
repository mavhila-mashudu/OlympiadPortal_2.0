const router = require("express").Router();
const prisma = require("../config/database").default;
const { requireAuth, requireRole } = require("../middlewares/auth");
const { BadRequestError, ForbiddenError, NotFoundError, ConflictError } = require("../errors/AppError");

router.use(requireAuth);
async function ownedRound(roundId, organiserId) {
  const round = await prisma.rounds.findUnique({ where: { id: roundId }, include: { olympiads: true } });
  if (!round) throw new NotFoundError("Round not found");
  if (round.olympiads.organiser_id !== organiserId) throw new ForbiddenError("Not your round");
  return round;
}
async function recalculate(tx, roundId) {
  const round = await tx.rounds.findUnique({ where: { id: roundId } });
  const submissions = await tx.submissions.findMany({ where: { round_id: roundId }, include: { answers: true } });
  for (const submission of submissions) {
    const total = submission.answers.reduce((n, a) => n + Number(a.points_awarded || 0), 0);
    await tx.results.upsert({
      where: { round_id_entrant_id: { round_id: roundId, entrant_id: submission.entrant_id } },
      create: { round_id: roundId, entrant_id: submission.entrant_id, total_points: total },
      update: { total_points: total },
    });
  }
  if (round.state === "results_released") {
    const results = await tx.results.findMany({ where: { round_id: roundId }, orderBy: [{ total_points: "desc" }, { id: "asc" }] });
    for (let i = 0; i < results.length; i++) {
      await tx.results.update({ where: { id: results[i].id }, data: {
        rank: i + 1,
        qualified: round.qualifying_threshold !== null && Number(results[i].total_points) >= Number(round.qualifying_threshold),
      } });
    }
    const nextRound = await tx.rounds.findFirst({
      where: { olympiad_id: round.olympiad_id, opens_at: { gt: round.opens_at } },
      orderBy: { opens_at: "asc" }, select: { id: true, state: true },
    });
    if (nextRound && ["scheduled", "open"].includes(nextRound.state)) {
      const previousRegistrations = await tx.entrant_registrations.findMany({
        where: { round_id: roundId }, select: { entrant_id: true, registered_by: true },
      });
      const registrants = new Map(previousRegistrations.map((r) => [r.entrant_id, r.registered_by]));
      const qualified = new Set(results.filter((r) => round.qualifying_threshold !== null && Number(r.total_points) >= Number(round.qualifying_threshold)).map((r) => r.entrant_id));
      const newlyQualified = [...qualified].filter((id) => registrants.has(id));
      if (newlyQualified.length) await tx.entrant_registrations.createMany({
        data: newlyQualified.map((id) => ({ entrant_id: id, round_id: nextRound.id, registered_by: registrants.get(id) })), skipDuplicates: true,
      });
      const noLongerQualified = [...registrants.keys()].filter((id) => !qualified.has(id));
      if (noLongerQualified.length && nextRound.state === "scheduled") {
        const submitted = await tx.submissions.findMany({ where: { round_id: nextRound.id, entrant_id: { in: noLongerQualified } }, select: { entrant_id: true } });
        const protectedIds = new Set(submitted.map((s) => s.entrant_id));
        await tx.entrant_registrations.deleteMany({ where: { round_id: nextRound.id, entrant_id: { in: noLongerQualified.filter((id) => !protectedIds.has(id)) } } });
      }
    }
  }
}

router.get("/:roundId/review-sample", requireRole("organiser"), async (req, res, next) => {
  try {
    await ownedRound(req.params.roundId, req.user.userId);
    const answers = await prisma.answers.findMany({
      where: { submissions: { round_id: req.params.roundId }, marked_by: { not: null }, marked_at: { not: null } },
      take: 200,
      orderBy: { marked_at: "desc" },
      include: { questions: { select: { prompt: true, max_points: true } }, submissions: { select: { entrants: { select: { full_name: true } } } }, marking_reviews: { select: { id: true } } },
    });
    // Deterministic ten-percent sample so reviewers see the same set on refresh.
    const sample = answers.filter((_, i) => i % 10 === 0).slice(0, 20);
    res.json({ success: true, data: { sample } });
  } catch (err) { next(err); }
});
router.patch("/:roundId/review-sample/:answerId", requireRole("organiser"), async (req, res, next) => {
  try {
    await ownedRound(req.params.roundId, req.user.userId);
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
router.get("/:roundId/remarks", requireRole("organiser"), async (req, res, next) => {
  try {
    await ownedRound(req.params.roundId, req.user.userId);
    const remarks = await prisma.remark_requests.findMany({ where: { round_id: req.params.roundId }, orderBy: { created_at: "asc" }, include: { entrants: { select: { full_name: true, submissions: { where: { round_id: req.params.roundId }, select: { id: true, answers: { select: { id: true, answer_value: true, points_awarded: true, questions: { select: { prompt: true, max_points: true } } } } } } } } } });
    res.json({ success: true, data: { remarks } });
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
    // Keep the result link too: the educator review flow reads remarks through their result.
    const remark = await prisma.remark_requests.create({ data: { round_id: req.params.roundId, entrant_id: entrantId, result_id: result.id, reason } }).catch((err) => {
      if (err.code === "P2002") throw new ConflictError("You already requested a remark for this round");
      throw err;
    });
    res.status(201).json({ success: true, data: { remark } });
  } catch (err) { next(err); }
});
router.get("/:roundId/my-remark", requireRole("student"), async (req, res, next) => {
  try {
    if (!req.user.entrant) throw new ForbiddenError("No linked entrant profile");
    const remark = await prisma.remark_requests.findFirst({ where: { round_id: req.params.roundId, entrant_id: req.user.entrant.id }, select: { id: true, status: true, decision: true, created_at: true } });
    res.json({ success: true, data: { remark } });
  } catch (err) { next(err); }
});
router.patch("/:roundId/remarks/:remarkId", requireRole("organiser"), async (req, res, next) => {
  try {
    await ownedRound(req.params.roundId, req.user.userId);
    const remark = await prisma.remark_requests.findUnique({ where: { id: req.params.remarkId } });
    if (!remark || remark.round_id !== req.params.roundId) throw new NotFoundError("Remark not found");
    if (remark.status !== "pending") throw new ConflictError("Remark has already been decided");
    const status = req.body.status;
    const decision = String(req.body.decision || "").trim();
    if (!["approved", "rejected"].includes(status) || decision.length < 5) throw new BadRequestError("Decision and approved/rejected status required");
    let answer = null;
    let points = null;
    if (status === "approved") {
      points = Number(req.body.points_awarded);
      answer = await prisma.answers.findUnique({ where: { id: req.body.answer_id }, include: { questions: true, submissions: true } });
      if (!answer || answer.submissions.round_id !== req.params.roundId || answer.submissions.entrant_id !== remark.entrant_id || !Number.isFinite(points) || points < 0 || points > Number(answer.questions.max_points)) {
        throw new BadRequestError("Select an answer from this entrant and valid revised points");
      }
    }
    await prisma.$transaction(async (tx) => {
      if (answer) {
        await tx.marking_reviews.create({ data: { answer_id: answer.id, reviewer_id: req.user.userId, original_points: answer.points_awarded || 0, revised_points: points, comment: decision } });
        await tx.answers.update({ where: { id: answer.id }, data: { points_awarded: points } });
        await recalculate(tx, req.params.roundId);
      }
      await tx.remark_requests.update({ where: { id: remark.id }, data: { status, decision, reviewer_id: req.user.userId, decided_at: new Date() } });
    });
    res.json({ success: true, data: { message: "Remark decided" } });
  } catch (err) { next(err); }
});
module.exports = router;
