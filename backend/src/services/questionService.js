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
// assert the caller has permission (organiser owns it,
// or educator's school is registered for the olympiad).
const assertQuestionAccess = async (questionId, userId, role) => {
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

  const round = question.papers.rounds;
  const olympiad = round.olympiads;

  if (role === "organiser") {
    if (olympiad.organiser_id !== userId) {
      throw new ForbiddenError("Not your question");
    }
  } else if (role === "educator") {
    const educator = await prisma.educators.findUnique({
      where: { user_id: userId },
    });
    if (!educator) throw new ForbiddenError("Educator profile not found");

    const registration = await prisma.school_registrations.findFirst({
      where: {
        school_id: educator.school_id,
        olympiad_id: olympiad.id,
      },
    });
    if (!registration) {
      throw new ForbiddenError(
        "Your school is not registered for this olympiad",
      );
    }
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }

  return { question, round };
};

// Walk  round → olympiad  and assert access.
const assertRoundAccess = async (roundId, userId, role) => {
  const round = await prisma.rounds.findUnique({
    where: { id: roundId },
    include: { olympiads: true },
  });

  if (!round) throw new NotFoundError("Round not found");

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
  } else {
    throw new ForbiddenError("Insufficient permissions");
  }

  return round;
};

// ─────────────────────────────────────────
// CREATE QUESTION
// ─────────────────────────────────────────
const createQuestion = async (roundId, userId, role, data) => {
  const round = await assertRoundAccess(roundId, userId, role);

  // Questions can only be added/edited while exam_status is draft
  if (round.exam_status !== "draft") {
    throw new BadRequestError(
      "Questions can only be added while the exam is in draft status",
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
      correct_answer: data.correct_answer ?? undefined,
      max_points: data.max_points ?? 1,
    },
  });

  return question;
};

// ─────────────────────────────────────────
// LIST QUESTIONS FOR A ROUND
// ─────────────────────────────────────────
const listQuestions = async (roundId, userId, role) => {
  await assertRoundAccess(roundId, userId, role);

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
const updateQuestion = async (questionId, userId, role, data) => {
  const { round } = await assertQuestionAccess(questionId, userId, role);

  if (round.exam_status !== "draft") {
    throw new BadRequestError(
      "Questions can only be edited while the exam is in draft status",
    );
  }

  const updateData = {};
  if (data.type !== undefined) updateData.type = data.type;
  if (data.prompt !== undefined) updateData.prompt = data.prompt;
  if (data.options !== undefined) updateData.options = data.options;
  if (data.correct_option !== undefined)
    updateData.correct_option = data.correct_option;
  if (data.correct_answer !== undefined)
    updateData.correct_answer = data.correct_answer;
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
const deleteQuestion = async (questionId, userId, role) => {
  const { round } = await assertQuestionAccess(questionId, userId, role);

  if (round.exam_status !== "draft") {
    throw new BadRequestError(
      "Questions can only be deleted while the exam is in draft status",
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
