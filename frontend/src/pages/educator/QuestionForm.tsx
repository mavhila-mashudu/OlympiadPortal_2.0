import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { Question, QuestionType } from "../../lib/questions";
import styles from "./ExamBuilder.module.css";

export function QuestionForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Question;
  onSave: (data: Omit<Question, "id">) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? "mcq");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(
    initial?.options ?? ["", "", "", ""],
  );
  const [correctOptions, setCorrectOptions] = useState<string[]>(
    initial?.correct_option
      ? initial.correct_option
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );
  const [correctAnswer, setCorrectAnswer] = useState(
    initial?.correct_answer ?? "",
  );
  const [negativePct, setNegativePct] = useState(
    Number(initial?.negative_pct) || 0,
  );
  const [maxPoints, setMaxPoints] = useState(initial?.max_points ?? 1);

  const toggleCorrect = (idx: string) => {
    setCorrectOptions((prev) =>
      prev.includes(idx) ? prev.filter((c) => c !== idx) : [...prev, idx],
    );
  };

  const addOption = () => setOptions([...options, ""]);
  const removeOption = (idx: number) => {
    const next = options.filter((_, i) => i !== idx);
    setOptions(next.length >= 2 ? next : ["", ""]);
    // Drop the removed index and shift later indexes down
    setCorrectOptions((prev) =>
      prev
        .filter((c) => c !== String(idx))
        .map((c) => (Number(c) > idx ? String(Number(c) - 1) : c)),
    );
  };
  const updateOption = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  // Blank options are dropped on save, which shifts every later option
  // down. Renumber the ticked answers to match, and ignore ticks on blanks,
  // so the answer key still points at the options the student will see.
  const filledIndexes = options.flatMap((opt, idx) => (opt ? [idx] : []));
  const savedMcqCorrect = correctOptions
    .map(Number)
    .filter((idx) => filledIndexes.includes(idx))
    .map((idx) => String(filledIndexes.indexOf(idx)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correct = type === "mcq" ? savedMcqCorrect : correctOptions;
    onSave({
      type,
      prompt: prompt.trim(),
      options:
        type === "mcq"
          ? options.filter(Boolean)
          : type === "true_false"
            ? ["True", "False"]
            : null,
      correct_option:
        (type === "mcq" || type === "true_false") && correct.length > 0
          ? correct.join(",")
          : null,
      correct_answer: type === "short_answer" ? correctAnswer.trim() : null,
      negative_pct: type === "mcq" ? negativePct : 0,
      max_points: maxPoints,
    });
  };

  const canSave =
    prompt.trim().length > 0 &&
    (type === "essay" ||
      (type === "mcq" &&
        filledIndexes.length >= 2 &&
        savedMcqCorrect.length > 0) ||
      (type === "true_false" && correctOptions.length === 1) ||
      (type === "short_answer" && correctAnswer.trim().length > 0));

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <Label htmlFor="q-type">Question type</Label>
        <Select
          id="q-type"
          value={type}
          onChange={(e) => {
            const next = e.target.value as QuestionType;
            setType(next);
            // True/False has fixed options; switching in or
            // out resets the option editor so stale values
            // never leak between types
            if (next === "true_false") {
              setOptions(["True", "False"]);
              setCorrectOptions([]);
            } else if (type === "true_false") {
              setOptions(["", "", "", ""]);
              setCorrectOptions([]);
            }
          }}
        >
          <option value="mcq">
            Multiple choice (single or multiple answers)
          </option>
          <option value="true_false">True / False</option>
          <option value="short_answer">
            Short answer (single word / number)
          </option>
          <option value="essay">Essay / long answer</option>
        </Select>
      </div>

      <div className={styles.field}>
        <Label htmlFor="q-prompt">Question prompt</Label>
        <Textarea
          id="q-prompt"
          rows={3}
          placeholder="Enter the question text..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      {type === "mcq" && (
        <div className={styles.field}>
          <Label>Answer options (tick every correct answer)</Label>
          <div className={styles.optionsList}>
            {options.map((opt, idx) => (
              <div key={idx} className={styles.optionRow}>
                <input
                  type="checkbox"
                  checked={correctOptions.includes(String(idx))}
                  onChange={() => toggleCorrect(String(idx))}
                  title="Mark as correct"
                  className={styles.radio}
                />
                <Input
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => removeOption(idx)}
                    title="Remove option"
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 6 && (
            <Button type="button" variant="ghost" size="sm" onClick={addOption}>
              <Plus /> Add option
            </Button>
          )}
        </div>
      )}

      {type === "mcq" && (
        <div className={styles.field}>
          <Label htmlFor="q-negative">
            Negative marking per wrong selection (%)
          </Label>
          <Input
            id="q-negative"
            type="number"
            min={0}
            max={100}
            step={1}
            value={negativePct}
            onChange={(e) => setNegativePct(Number(e.target.value) || 0)}
            className={styles.pointsInput}
          />
          <p className={styles.hint}>
            Set to 0 to disable. Each wrongly selected option deducts this
            percentage of the question&apos;s points.
          </p>
        </div>
      )}

      {type === "true_false" && (
        <div className={styles.field}>
          <Label>Correct answer</Label>
          <div className={styles.tfRow}>
            {["True", "False"].map((label, idx) => (
              <label key={label} className={styles.tfOption}>
                <input
                  type="radio"
                  name="tf-correct"
                  checked={correctOptions.includes(String(idx))}
                  onChange={() => setCorrectOptions([String(idx)])}
                  className={styles.radio}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {type === "short_answer" && (
        <div className={styles.field}>
          <Label htmlFor="q-answer">Correct answer</Label>
          <Input
            id="q-answer"
            placeholder="Expected answer (e.g. 42, photosynthesis)"
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
          />
        </div>
      )}

      {type === "essay" && (
        <p className={styles.hint}>
          Essay questions will be queued for manual marking after submission.
        </p>
      )}

      <div className={styles.field}>
        <Label htmlFor="q-points">Points</Label>
        <Input
          id="q-points"
          type="number"
          min={1}
          step={1}
          value={maxPoints}
          onChange={(e) => setMaxPoints(Number(e.target.value) || 1)}
          className={styles.pointsInput}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? "Saving..." : initial ? "Update question" : "Add question"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
