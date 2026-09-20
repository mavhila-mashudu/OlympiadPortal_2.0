import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { splitCorrect, type Question } from "../../lib/questions";
import styles from "./ExamReview.module.css";

// Inline editor the organiser uses to correct a question's
// expected answer before approving.  The backend enforces
// that corrections are allowed only while the exam is
// "ready" (awaiting verification).
export function CorrectAnswerEditor({
  question,
  onSave,
  onCancel,
  saving,
}: {
  question: Question;
  onSave: (data: {
    correct_option?: string | null;
    correct_answer?: string | null;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [correctOptions, setCorrectOptions] = useState<string[]>(
    splitCorrect(question.correct_option),
  );
  const [correctAnswer, setCorrectAnswer] = useState(
    question.correct_answer ?? "",
  );

  const isChoice = question.type === "mcq" || question.type === "true_false";

  const canSave =
    question.type === "essay" ||
    (question.type === "short_answer" && correctAnswer.trim().length > 0) ||
    (isChoice && correctOptions.length > 0);

  return (
    <div className={styles.correctEditor}>
      <p className={styles.correctLabel}>Correct this answer</p>

      {isChoice && question.options && (
        <div className={styles.correctOptions}>
          {question.options.map((opt, idx) => (
            <label key={idx} className={styles.correctOptionRow}>
              <input
                type={question.type === "mcq" ? "checkbox" : "radio"}
                name={`correct-${question.id}`}
                checked={correctOptions.includes(String(idx))}
                onChange={() =>
                  question.type === "mcq"
                    ? setCorrectOptions((prev) =>
                        prev.includes(String(idx))
                          ? prev.filter((c) => c !== String(idx))
                          : [...prev, String(idx)],
                      )
                    : setCorrectOptions([String(idx)])
                }
                className={styles.correctRadio}
              />
              <span>
                {String.fromCharCode(65 + idx)}. {opt}
              </span>
            </label>
          ))}
        </div>
      )}

      {question.type === "short_answer" && (
        <Input
          placeholder="Expected answer"
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
        />
      )}

      {question.type === "essay" && (
        <p className={styles.essayNote}>
          Essays have no reference answer — mark them against the memo after
          submissions close.
        </p>
      )}

      <div className={styles.correctActions}>
        <Button
          size="sm"
          disabled={!canSave || saving}
          onClick={() =>
            onSave({
              correct_option: isChoice ? correctOptions.join(",") : null,
              correct_answer:
                question.type === "short_answer" ? correctAnswer.trim() : null,
            })
          }
        >
          {saving ? "Saving..." : "Save correction"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
