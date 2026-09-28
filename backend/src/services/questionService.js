// @ts-nocheck
const prisma = require("../config/database").default;
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} = require("../errors/AppError");
const { answerStats, describeDifficulty } = require("./questionDifficulty");

// A question and every copy imported from it share the original's id
const familyOf = (question) => question.source_question_id ?? question.id;

const NO_ANSWERS = { points: 0, answered: 0 };

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

// Resolve the paper for a round, creating it if it
// doesn't exist yet.  Questions must attach to a paper.
const ensurePaperForRound = async (roundId, db = prisma) => {
  let paper = await db.papers.findFirst({ where: { round_id: roundId } });

  if (!paper) {
    const round = await db.rounds.findUnique({
      where: { id: roundId },
      select: { name: true },
    });
    paper = await db.papers.create({
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
  const questions = paper ? paper.questions : [];

  // Organisers also see how hard each question proved in this round
  if (role !== "organiser") return questions;
  const stats = await answerStats(questions.map((question) => question.id));
  return questions.map((question) => ({
    ...question,
    difficulty: describeDifficulty([{ maxPoints: question.max_points, ...(stats.get(question.id) ?? NO_ANSWERS) }]),
  }));
};

// List reusable questions from rounds owned by an organiser. Questions are
// copied into a paper when selected, so editing a paper never changes the bank.
// A question and its copies are listed once, as the original, with every
// round it was used in and its difficulty over all of them. A question already
// on this round's paper, as the original or a copy, is left out.
const listQuestionBank = async (roundId, userId) => {
  await assertRoundAccess(roundId, userId, "organiser");

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

  const onThisPaper = new Set(
    questions.filter((question) => question.papers.round_id === roundId).map(familyOf),
  );
  const families = new Map();
  for (const question of questions) {
    const family = familyOf(question);
    if (onThisPaper.has(family)) continue;
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(question);
  }

  const stats = await answerStats([...families.values()].flat().map((question) => question.id));

  return [...families.entries()]
    .map(([originalId, versions]) => {
      const original = versions.find((version) => version.id === originalId) ?? versions[versions.length - 1];
      const { papers, ...question } = original;
      const usedIn = new Map(versions.map((version) => [version.papers.rounds.id, version.papers.rounds]));
      return {
        ...question,
        source_round: papers.rounds,
        used_in: [...usedIn.values()],
        difficulty: describeDifficulty(versions.map((version) => ({
          maxPoints: version.max_points,
          ...(stats.get(version.id) ?? NO_ANSWERS),
        }))),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

// Copies the chosen bank questions onto this round's paper. Each copy records
// the original, and a question already on the paper (as the original or any
// copy) is refused, so no question can appear on one paper twice.
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

  // One copy per question, however many of its versions were chosen,
  // taken from the original when that was one of them
  const toCopy = new Map();
  for (const question of sourceQuestions) {
    const family = familyOf(question);
    if (!toCopy.has(family) || question.id === family) toCopy.set(family, question);
  }

  return prisma.$transaction(async (tx) => {
    // Imports into one round take turns, so two at once (a double click)
    // can't both create the paper or both pass the check below
    await tx.$queryRaw`SELECT "id" FROM "rounds" WHERE "id" = ${roundId}::uuid FOR UPDATE`;
    const paper = await ensurePaperForRound(roundId, tx);
    const current = await tx.questions.findMany({
      where: { paper_id: paper.id },
      select: { id: true, source_question_id: true },
    });
    const onPaper = new Set(current.map(familyOf));
    if ([...toCopy.keys()].some((family) => onPaper.has(family))) {
      throw new ConflictError("One or more of these questions is already on this paper");
    }

    const imported = [];
    for (const [family, question] of toCopy) {
      imported.push(await tx.questions.create({
        data: {
          paper_id: paper.id,
          type: question.type,
          prompt: question.prompt,
          options: question.options ?? undefined,
          correct_option: question.correct_option ?? undefined,
          correct_answer: question.correct_answer ?? undefined,
          negative_pct: question.negative_pct,
          max_points: question.max_points,
          source_question_id: family,
        },
      }));
    }
    return imported;
  });
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
