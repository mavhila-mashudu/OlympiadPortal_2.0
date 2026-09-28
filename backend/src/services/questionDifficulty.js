// A question's difficulty, derived from how entrants actually answered it
// (A8): 1 − (average score ÷ max points), over its marked answers. It is
// worked out on request rather than stored, so re-marks, moderation and
// remarks are reflected straight away.
const prisma = require("../config/database").default;

// Fewer marked answers than this say too little to call a question easy or hard
const MIN_ANSWERS = 5;
// The usual cut-offs for exam questions: below 0.3 (learners earned more than
// 70% of the marks on average) is easy, above 0.7 (less than 30%) is hard
const EASY_BELOW = 0.3;
const HARD_ABOVE = 0.7;

// Per question: the marks its marked answers earned in total, and how many
// there were. An answer counts once it has been marked; an unfinished online
// exam or an essay still waiting for a marker is left out, while a question
// left blank in a submitted exam counts as 0.
async function answerStats(questionIds, db = prisma) {
  if (questionIds.length === 0) return new Map();
  const rows = await db.answers.groupBy({
    by: ["question_id"],
    where: { question_id: { in: questionIds }, points_awarded: { not: null } },
    _sum: { points_awarded: true },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [
    row.question_id,
    { points: Number(row._sum.points_awarded ?? 0), answered: row._count._all },
  ]));
}

// Difficulty over one or more versions of a question (a bank question and its
// copies), each given as { maxPoints, points, answered }. Each answer is
// weighed against its own version's max points, so pooled versions with
// different marks still compare fairly. Negative marking can take the average
// below zero, so the value is kept between 0 and 1.
function describeDifficulty(versions) {
  let earnedShare = 0;
  let answered = 0;
  for (const { maxPoints, points, answered: count } of versions) {
    if (!count || !(Number(maxPoints) > 0)) continue;
    earnedShare += points / Number(maxPoints);
    answered += count;
  }
  if (answered < MIN_ANSWERS) return { value: null, band: null, answered };

  const value = Math.round(Math.min(1, Math.max(0, 1 - earnedShare / answered)) * 100) / 100;
  const band = value < EASY_BELOW ? "easy" : value > HARD_ABOVE ? "hard" : "medium";
  return { value, band, answered };
}

module.exports = { MIN_ANSWERS, answerStats, describeDifficulty };
