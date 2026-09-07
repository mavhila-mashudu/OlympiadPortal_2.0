// @ts-nocheck
// ─────────────────────────────────────────
// MCQ SCORING MATH
//
// Shared by every marking path (student
// submit, round-close auto-mark, educator
// offline submissions) so the rules can
// never drift apart.
//
// Rules (single- and multi-answer MCQ):
//   • max_points is split evenly across the
//     correct options:  perCorrect = max / n
//   • each wrongly selected option deducts
//     negative_pct% of max_points
//   • negative_pct = 0 disables the penalty
//
// Example — 6 marks, 3 correct, 10% negative:
//   picks 2 correct, 0 wrong → 6/3 × 2      = 4
//   picks 1 correct, 2 wrong → 2 − 2 × 0.6  = 0.8
//
// correct_option and answer_value both store
// option indexes as a comma-separated string
// ("0,2,3").  A single-answer MCQ is just the
// length-1 case, so one formula covers both.
// ─────────────────────────────────────────

// "0, 2,3" → ["0", "2", "3"]
const parseOptionList = (value) =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const scoreMcq = ({ maxPoints, correctOption, selected, negativePct }) => {
  const max = Number(maxPoints) || 0;
  const correct = parseOptionList(correctOption);
  const picked = parseOptionList(selected);

  // Even split across the correct options
  const perCorrect = correct.length > 0 ? max / correct.length : 0;

  const rightCount = picked.filter((p) => correct.includes(p)).length;
  const wrongCount = picked.length - rightCount;

  const raw = rightCount * perCorrect;
  const penalty = wrongCount * ((Number(negativePct) || 0) / 100) * max;

  // Only an exact match with the correct set
  // counts as fully correct — points carry the
  // partial credit.
  const isCorrect =
    correct.length > 0 && rightCount === correct.length && wrongCount === 0;

  return {
    isCorrect,
    points: Math.round((raw - penalty) * 100) / 100,
  };
};

module.exports = { parseOptionList, scoreMcq };
