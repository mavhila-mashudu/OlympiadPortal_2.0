// @ts-nocheck
const prisma = require("../config/database").default;
const { assertOwnsOlympiad } = require("./olympiadService");
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} = require("../errors/AppError");

// ─────────────────────────────────────────
// CREATE ROUND
// A round always starts in "scheduled" state —
// the lifecycle job (separate piece of work) is what
// later moves it to open/closed on its own.
// ─────────────────────────────────────────
const createRound = async ({
  olympiadId,
  organiserId,
  name,
  opensAt,
  closesAt,
}) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const opens = new Date(opensAt);
  const closes = new Date(closesAt);

  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) {
    throw new BadRequestError("opens_at and closes_at must be valid dates");
  }
  if (closes <= opens) {
    throw new BadRequestError("closes_at must be after opens_at");
  }

  const round = await prisma.rounds.create({
    data: {
      olympiad_id: olympiadId,
      name,
      opens_at: opens,
      closes_at: closes,
    },
  });

  return round;
};

// ─────────────────────────────────────────
// LIST ROUNDS FOR AN OLYMPIAD
// ─────────────────────────────────────────
const listRounds = async (olympiadId, organiserId) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const rounds = await prisma.rounds.findMany({
    where: { olympiad_id: olympiadId },
    orderBy: { opens_at: "asc" },
    include: {
      _count: { select: { submissions: true, entrant_registrations: true } },
    },
  });

  return rounds;
};

// ─────────────────────────────────────────
// GET A SINGLE ROUND
// Ownership is checked via the round's parent olympiad
// ─────────────────────────────────────────
const getRound = async (roundId, organiserId) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: {
      olympiads: true,
      papers: true,
      _count: { select: { submissions: true, entrant_registrations: true } },
    },
  });

  if (!round) throw new NotFoundError("Round not found");
  if (round.olympiads.organiser_id !== organiserId) {
    throw new ForbiddenError("Not your round");
  }

  return round;
};

// ─────────────────────────────────────────
// UPDATE ROUND (name / schedule)
// Only while the round is still "scheduled" —
// once it's live, its timing shouldn't move under
// schools that are already relying on it.
// ─────────────────────────────────────────
const updateRound = async (roundId, organiserId, { name, opensAt, closesAt }) => {
  const round = await getRound(roundId, organiserId);

  if (round.state !== "scheduled") {
    throw new BadRequestError(
      "Only a round that hasn't opened yet can be edited",
    );
  }

  const data = {};
  if (name !== undefined) data.name = name;

  const opens = opensAt !== undefined ? new Date(opensAt) : round.opens_at;
  const closes = closesAt !== undefined ? new Date(closesAt) : round.closes_at;

  if (opensAt !== undefined || closesAt !== undefined) {
    if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) {
      throw new BadRequestError("opens_at and closes_at must be valid dates");
    }
    if (closes <= opens) {
      throw new BadRequestError("closes_at must be after opens_at");
    }
    data.opens_at = opens;
    data.closes_at = closes;
  }

  const updated = await prisma.rounds.update({
    where: { id: roundId },
    data,
  });

  return updated;
};

// ─────────────────────────────────────────
// DELETE ROUND
// Only while still "scheduled" — once schools may have
// seen it, removing it silently would be unfair
// ─────────────────────────────────────────
const deleteRound = async (roundId, organiserId) => {
  const round = await getRound(roundId, organiserId);

  if (round.state !== "scheduled") {
    throw new BadRequestError(
      "Only a round that hasn't opened yet can be deleted",
    );
  }

  await prisma.rounds.delete({ where: { id: roundId } });
};

module.exports = {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound,
};
