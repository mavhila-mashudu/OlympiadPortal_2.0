import { CheckCircle2, GripVertical, Pencil, Trash2 } from "lucide-react";
import { TYPE_LABELS, type Question } from "../../lib/questions";
import styles from "./ExamBuilder.module.css";

export function QuestionCard({
  question,
  index,
  onEdit,
  onDelete,
}: {
  question: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const correctList = (question.correct_option ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionHeader}>
        <span className={styles.questionNumber}>
          <GripVertical className={styles.grip} />Q{index + 1}
        </span>
        <span className={styles.typeBadge}>
          {TYPE_LABELS[question.type]}
          {question.type === "mcq" && correctList.length > 1
            ? " (multiple answers)"
            : ""}
        </span>
        <span className={styles.points}>
          {Number(question.max_points)} pt
          {Number(question.max_points) !== 1 ? "s" : ""}
        </span>
        <div className={styles.questionActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onEdit}
            title="Edit"
          >
            <Pencil />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 />
          </button>
        </div>
      </div>
      <p className={styles.questionPrompt}>{question.prompt}</p>
      {(question.type === "mcq" || question.type === "true_false") &&
        question.options && (
          <ul className={styles.optionsReview}>
            {question.options.map((opt, i) => (
              <li
                key={i}
                className={`${styles.optionItem} ${correctList.includes(String(i)) ? styles.correctOption : ""}`}
              >
                {correctList.includes(String(i)) && (
                  <CheckCircle2 className={styles.checkIcon} />
                )}
                {opt}
              </li>
            ))}
          </ul>
        )}
      {question.type === "mcq" && Number(question.negative_pct) > 0 && (
        <p className={styles.answerPreview}>
          Negative marking: -{Number(question.negative_pct)}% per wrong
          selection
        </p>
      )}
      {question.type === "short_answer" && question.correct_answer && (
        <p className={styles.answerPreview}>
          Answer: <strong>{question.correct_answer}</strong>
        </p>
      )}
      {question.type === "essay" && (
        <p className={styles.answerPreview}>Marked manually</p>
      )}
    </div>
  );
}
