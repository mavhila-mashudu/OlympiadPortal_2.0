export type QuestionType = "mcq" | "true_false" | "short_answer" | "essay";

export type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[] | null;
  correct_option: string | null;
  correct_answer: string | null;
  // Decimal columns: the API sends them as strings ("2"), so convert with
  // Number() before doing arithmetic or comparisons
  negative_pct: number | string | null;
  max_points: number | string;
};

export const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
  essay: "Essay / long answer",
};

// correct_option holds option indexes as a
// comma-separated string ("0,2") — split it
// so multi-answer MCQs highlight every
// correct option.
export const splitCorrect = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Points each correct option is worth on a multi-answer MCQ
// (max_points split evenly across the correct options).
export const perCorrectPoints = (q: Question) => {
  const n = splitCorrect(q.correct_option).length;
  return n > 0 ? Math.round((Number(q.max_points) / n) * 100) / 100 : 0;
};
