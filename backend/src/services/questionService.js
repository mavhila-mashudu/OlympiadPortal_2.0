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

// Resolve the paper for a round, creating it if it
// doesn't exist yet.  Questions must attach to a paper.
const ensurePaperForRound = async (roundId) => {
  let paper = await prisma.papers.findFirst({ where: { round_id: roundId } });

  if (!paper) {
    const round = await prisma.rounds.findUnique({
      where: { id: roundId },
      select: { name: true },
    });
    paper = await prisma.papers.create({
      data: { round_id: roundId, title: round.name },
    });
  }

  return paper;
};

// Walk  question → paper → round → olympiad  and
// assert the organiser owns the parent olympiad.
// Also returns the round so callers can check its state.
const assertQuestionOwnership = async (questionId, organiserId) => {
  const question = await prisma.questions.findUnique({
    where: { id: questionId },
    include: {
      papers: {
        include: {
          rounds: { include: { olympiads: true } },
        },
      },
    },
  });

  if (!question) throw new NotFoundError("Question not found");

  if (question.papers.rounds.olympiads.organiser_id !== organiserId) {
    throw new ForbiddenError("Not your question");
  }

  return { question, round: question.papers.rounds };
};

// Walk  round → olympiad  and assert ownership.
const assertRoundOwnership = async (roundId, organiserId) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });

  if (!round) throw new NotFoundError("Round not found");
  if (round.olympiads.organiser_id !== organiserId) {
    throw new ForbiddenError("Not your round");
  }

  return round;
};

// ─────────────────────────────────────────
// CREATE QUESTION
// Adds a question to the paper belonging to the
// given round.  Only allowed while the round is
// still in "scheduled" state.
// ─────────────────────────────────────────
const createQuestion = async (roundId, organiserId, data) => {
  const round = await assertRoundOwnership(roundId, organiserId);

  if (round.state !== "scheduled") {
    throw new BadRequestError(
      "Questions can only be added while the round is still scheduled",
    );
  }

  const paper = await ensurePaperForRound(roundId);

  const question = await prisma.questions.create({
    data: {
      paper_id: paper.id,
      type: data.type,
      prompt: data.prompt,
      options: data.options ?? undefined,
      correct_option: data.correct_option ?? undefined,
      max_points: data.max_points ?? 1,
    },
  });

  return question;
};

// ─────────────────────────────────────────
// LIST QUESTIONS FOR A ROUND
// Returns every question on the round's paper,
// ordered by creation time.
// ─────────────────────────────────────────
const listQuestions = async (roundId, organiserId) => {
  const round = await assertRoundOwnership(roundId, organiserId);

  const paper = await prisma.papers.findFirst({
    where: { round_id: roundId },
    include: {
      questions: { orderBy: { created_at: "asc" } },
    },
  });

  return paper ? paper.questions : [];
};

// ─────────────────────────────────────────
// UPDATE QUESTION
// ─────────────────────────────────────────
const updateQuestion = async (questionId, organiserId, data) => {
  const { round } = await assertQuestionOwnership(questionId, organiserId);

  if (round.state !== "scheduled") {
    throw new BadRequestError(
      "Questions can only be edited while the round is still scheduled",
    );
  }

  const updateData = {};
  if (data.type !== undefined) updateData.type = data.type;
  if (data.prompt !== undefined) updateData.prompt = data.prompt;
  if (data.options !== undefined) updateData.options = data.options;
  if (data.correct_option !== undefined)
    updateData.correct_option = data.correct_option;
  if (data.max_points !== undefined) updateData.max_points = data.max_points;

  const question = await prisma.questions.update({
    where: { id: questionId },
    data: updateData,
  });

  return question;
};

// ─────────────────────────────────────────
// DELETE QUESTION
// ─────────────────────────────────────────
const deleteQuestion = async (questionId, organiserId) => {
  const { round } = await assertQuestionOwnership(questionId, organiserId);

  if (round.state !== "scheduled") {
    throw new BadRequestError(
      "Questions can only be deleted while the round is still scheduled",
    );
  }

  await prisma.questions.delete({ where: { id: questionId } });
};

module.exports = {
  createQuestion,
  listQuestions,
  updateQuestion,
  deleteQuestion,
};
