import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import styles from "./MarkingQueue.module.css";

export type QueueAnswer = {
  id: string;
  answer_value: string | null;
  questions: {
    id: string;
    prompt: string;
    type: string;
    options: string[] | null;
    correct_option: string | null;
    correct_answer: string | null;
    max_points: string | number;
  };
};

export function AnswerCard({
  answer,
  roundId,
  onMarked,
}: {
  answer: QueueAnswer;
  roundId: string;
  onMarked: () => void;
}) {
  const maxPoints = Number(answer.questions.max_points);
  const [points, setPoints] = useState<number>(maxPoints);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the memo answer: option texts for choice
  // questions, the expected string for short answers
  const correctList = (answer.questions.correct_option ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const memoOptions = answer.questions.options ?? [];
  const memoAnswer =
    answer.questions.type === "short_answer"
      ? answer.questions.correct_answer
      : correctList.length > 0
        ? correctList
            .map((i) => memoOptions[Number(i)] ?? `Option ${Number(i) + 1}`)
            .join(", ")
        : null;

  const saveMark = async (awarded: number) => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/answers/${answer.id}`, {
        is_correct: awarded > 0,
        points_awarded: awarded,
      });
      onMarked();
    } catch (err: any) {
      setError(err.message || "Failed to save mark");
      setSaving(false);
    }
  };

  return (
    <div className={styles.answerCard}>
      <div className={styles.answerHeader}>
        <span className={styles.typeBadge}>
          {answer.questions.type === "essay"
            ? "Essay"
            : answer.questions.type === "true_false"
              ? "True / False"
              : answer.questions.type === "mcq"
                ? "Multiple choice"
                : answer.questions.type === "short_answer"
                  ? "Short answer"
                  : answer.questions.type}
        </span>
        <span className={styles.points}>out of {maxPoints}</span>
      </div>

      <p className={styles.prompt}>{answer.questions.prompt}</p>

      <div className={styles.studentAnswer}>
        <span className={styles.answerLabel}>Student answer</span>
        <p>{answer.answer_value?.trim() || <em>No answer provided</em>}</p>
      </div>

      {memoAnswer && (
        <div className={styles.memoAnswer}>
          <span className={styles.answerLabel}>Memo answer</span>
          <p>
            <strong>{memoAnswer}</strong>
          </p>
        </div>
      )}

      {error && <p className={styles.answerError}>{error}</p>}

      <div className={styles.markRow}>
        <div className={styles.pointsField}>
          <Input
            type="number"
            min={0}
            max={maxPoints}
            step={maxPoints > 1 ? 0.5 : 1}
            value={points}
            onChange={(e) =>
              setPoints(
                Math.max(0, Math.min(maxPoints, Number(e.target.value) || 0)),
              )
            }
            disabled={saving}
          />
        </div>
        <Button size="sm" onClick={() => saveMark(points)} disabled={saving}>
          {saving ? "Saving..." : "Award"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveMark(maxPoints)}
          disabled={saving}
        >
          <CheckCircle2 /> Full
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveMark(0)}
          disabled={saving}
        >
          Zero
        </Button>
      </div>
    </div>
  );
}
