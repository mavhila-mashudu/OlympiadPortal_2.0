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
// When the request names a round, the question must be on it.
const assertQuestionAccess = async (questionId, userId, role, roundId) => {
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

  const round = question?.papers.rounds;
  if (!question || (roundId !== undefined && round.id !== roundId)) {
    throw new NotFoundError("Question not found");
  }

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
      negative_pct: data.negative_pct ?? 0,
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

// List reusable questions from rounds owned by an organiser. Questions are
// copied into a paper when selected, so editing a paper never changes the bank.
const listQuestionBank = async (roundId, userId) => {
  const round = await assertRoundAccess(roundId, userId, "organiser");
  const currentQuestions = await prisma.questions.findMany({
    where: { papers: { round_id: roundId } },
    select: { id: true },
  });
  const excluded = new Set(currentQuestions.map((question) => question.id));

  const questions = await prisma.questions.findMany({
    where: {
      papers: {
        rounds: {
          olympiads: { organiser_id: userId },
        },
      },
    },
    include: {
      papers: { include: { rounds: { select: { id: true, name: true } } } },
    },
    orderBy: { created_at: "desc" },
  });

  return questions
    .filter((question) => !excluded.has(question.id))
    .map(({ papers, ...question }) => ({
      ...question,
      source_round: papers.rounds,
    }));
};

const importQuestions = async (roundId, userId, questionIds) => {
  const round = await assertRoundAccess(roundId, userId, "organiser");
  if (round.exam_status !== "draft") {
    throw new BadRequestError("Questions can only be imported while the exam is in draft status");
  }

  const uniqueIds = [...new Set(questionIds)];
  const sourceQuestions = await prisma.questions.findMany({
    where: {
      id: { in: uniqueIds },
      papers: { rounds: { olympiads: { organiser_id: userId } } },
    },
  });
  if (sourceQuestions.length !== uniqueIds.length) {
    throw new NotFoundError("One or more bank questions were not found");
  }

  const paper = await ensurePaperForRound(roundId);
  const imported = await prisma.$transaction(
    sourceQuestions.map((question) =>
      prisma.questions.create({
        data: {
          paper_id: paper.id,
          type: question.type,
          prompt: question.prompt,
          options: question.options ?? undefined,
          correct_option: question.correct_option ?? undefined,
          correct_answer: question.correct_answer ?? undefined,
          negative_pct: question.negative_pct,
          max_points: question.max_points,
        },
      }),
    ),
  );

  return imported;
};

// ─────────────────────────────────────────
// UPDATE QUESTION
// ─────────────────────────────────────────
const updateQuestion = async (questionId, userId, role, data, roundId) => {
  const { round } = await assertQuestionAccess(questionId, userId, role, roundId);

  // Editing is locked once digitization moves on:
  //   • educators may edit only while the exam is draft
  //   • organisers may additionally CORRECT answers while
  //     the exam awaits their verification (ready) — this is
  //     the organiser's answer-correction path
  if (round.exam_status !== "draft") {
    const mayCorrect = role === "organiser" && round.exam_status === "ready";
    if (!mayCorrect) {
      throw new BadRequestError(
        role === "organiser"
          ? "Questions are locked once the exam is live"
          : "Questions can only be edited while the exam is in draft status",
      );
    }
  }

  const updateData = {};
  if (data.type !== undefined) updateData.type = data.type;
  if (data.prompt !== undefined) updateData.prompt = data.prompt;
  if (data.options !== undefined) updateData.options = data.options;
  if (data.correct_option !== undefined)
    updateData.correct_option = data.correct_option;
  if (data.correct_answer !== undefined)
    updateData.correct_answer = data.correct_answer;
  if (data.negative_pct !== undefined)
    updateData.negative_pct = data.negative_pct;
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
const deleteQuestion = async (questionId, userId, role, roundId) => {
  const { round } = await assertQuestionAccess(questionId, userId, role, roundId);

  if (round.exam_status !== "draft") {
    throw new BadRequestError(
      "Questions can only be deleted while the exam is in draft status",
    );
  }

  await prisma.questions.delete({ where: { id: questionId } });
};

module.exports = {
  assertRoundAccess,
  createQuestion,
  listQuestions,
  updateQuestion,
  deleteQuestion,
  listQuestionBank,
  importQuestions,
};
