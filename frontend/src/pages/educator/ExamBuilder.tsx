import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { educatorNav } from "../../lib/mockData";
import styles from "./ExamBuilder.module.css";

type QuestionType = "mcq" | "true_false" | "short_answer" | "essay";

type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[] | null;
  correct_option: string | null;
  correct_answer: string | null;
  negative_pct: number | null;
  max_points: number;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
  essay: "Essay / long answer",
};

function QuestionForm({
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        (type === "mcq" || type === "true_false") && correctOptions.length > 0
          ? correctOptions.join(",")
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
        options.filter(Boolean).length >= 2 &&
        correctOptions.length > 0) ||
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

function QuestionCard({
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
          {question.max_points} pt{question.max_points !== 1 ? "s" : ""}
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

function ExamBuilder() {
  const { id: roundId } = useParams<{ id: string }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [examStatus, setExamStatus] = useState<string>("draft");
  const [paperUrl, setPaperUrl] = useState<string | null>(null);
  const [showPaper, setShowPaper] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await api.get<{ questions: any[] }>(
        `/rounds/${roundId}/questions`,
      );
      setQuestions(res.questions);
    } catch {
      setQuestions([]);
    }
  }, [roundId]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<{ exam_status: string }>(
        `/rounds/${roundId}/exam-status`,
      );
      setExamStatus(res.exam_status);
    } catch {
      setExamStatus("draft");
    }
  }, [roundId]);

  // Signed viewing URL for the uploaded question paper —
  // shown side-by-side so the educator can digitize while
  // reading the original PDF
  const fetchPaperUrl = useCallback(async () => {
    try {
      const res = await api.get<{ url: string }>(
        `/papers/by-round/${roundId}?type=paper`,
      );
      setPaperUrl(res.url);
    } catch {
      setPaperUrl(null);
    }
  }, [roundId]);

  useEffect(() => {
    Promise.all([fetchQuestions(), fetchStatus(), fetchPaperUrl()]).finally(
      () => setLoading(false),
    );
  }, [fetchQuestions, fetchStatus, fetchPaperUrl]);

  const handleSave = async (data: Omit<Question, "id">) => {
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const res = await api.patch<{ question: any }>(
          `/rounds/${roundId}/questions/${editingId}`,
          data,
        );
        setQuestions((prev) =>
          prev.map((q) => (q.id === editingId ? res.question : q)),
        );
      } else {
        const res = await api.post<{ question: any }>(
          `/rounds/${roundId}/questions`,
          data,
        );
        setQuestions((prev) => [...prev, res.question]);
      }
      setShowForm(false);
      setEditingId(null);
      fetchStatus();
    } catch (err: any) {
      setError(err.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    setError(null);
    try {
      await api.delete(`/rounds/${roundId}/questions/${id}`);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      fetchStatus();
    } catch (err: any) {
      setError(err.message || "Failed to delete question");
    }
  };

  const handleMarkReady = async () => {
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/exam-status`, { status: "ready" });
      setExamStatus("ready");
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  const totalPoints = questions.reduce((sum, q) => sum + q.max_points, 0);
  const isDraft = examStatus === "draft";
  const isReady = examStatus === "ready";

  if (loading) {
    return (
      <AppShell
        activeRole="educator"
        navItems={educatorNav}
        organisation=""
        portalLabel="Educator portal"
        userInitials=""
        userName=""
      >
        <p className={styles.loading}>Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation=""
      portalLabel="Educator portal"
      userInitials=""
      userName=""
    >
      <div
        className={showPaper && paperUrl ? styles.builderLayout : styles.stack}
      >
        <div className={styles.stack}>
          <header className={styles.pageHeader}>
            <div>
              <h1>Exam Builder</h1>
              <p>
                Digitize the question paper — add each question with its type,
                options, and correct answer.
              </p>
            </div>
            <div className={styles.pageActions}>
              {paperUrl && (
                <Button
                  variant="outline"
                  onClick={() => setShowPaper((v) => !v)}
                >
                  <FileText />
                  {showPaper ? "Hide" : "Show"} question paper
                </Button>
              )}
              <Button variant="outline" to="/educator">
                <ArrowLeft /> Back to rounds
              </Button>
            </div>
          </header>

          {/* Status bar */}
          <div className={styles.statusBar}>
            <div className={styles.statsRow}>
              <span>
                <strong>{questions.length}</strong> question
                {questions.length !== 1 ? "s" : ""}
              </span>
              <span>
                <strong>{totalPoints}</strong> total point
                {totalPoints !== 1 ? "s" : ""}
              </span>
              <span className={`${styles.statusPill} ${styles[examStatus]}`}>
                {examStatus === "draft" && "Draft"}
                {examStatus === "ready" && "Ready for review"}
                {examStatus === "live" && "Live"}
              </span>
            </div>
            {isDraft && questions.length > 0 && (
              <Button size="sm" onClick={handleMarkReady}>
                <CheckCircle2 /> Mark as ready for review
              </Button>
            )}
            {isReady && (
              <span className={styles.readyNote}>
                Submitted for organiser verification. Waiting for approval.
              </span>
            )}
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Question list */}
          {questions.length > 0 && !showForm && (
            <div className={styles.questionList}>
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  onEdit={() => {
                    setEditingId(q.id);
                    setShowForm(true);
                  }}
                  onDelete={() => handleDelete(q.id)}
                />
              ))}
            </div>
          )}

          {/* Form */}
          {showForm && isDraft && (
            <Card className={styles.formCard}>
              <h2>{editingId ? "Edit question" : "Add a question"}</h2>
              <QuestionForm
                initial={
                  editingId
                    ? questions.find((q) => q.id === editingId)
                    : undefined
                }
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                saving={saving}
              />
            </Card>
          )}

          {/* Add button */}
          {isDraft && !showForm && (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
            >
              <Plus /> Add question
            </Button>
          )}

          {!isDraft && !showForm && questions.length === 0 && (
            <Card className={styles.emptyCard}>
              <p>
                No questions yet. The exam must be in draft mode to add
                questions.
              </p>
            </Card>
          )}
        </div>

        {/* Side-by-side PDF viewer — the original question paper */}
        {showPaper && paperUrl && (
          <aside className={styles.pdfPanel}>
            <div className={styles.pdfPanelHeader}>
              <FileText />
              <span>Question paper (for reference)</span>
            </div>
            <iframe
              src={paperUrl}
              title="Question paper"
              className={styles.pdfFrame}
            />
          </aside>
        )}
      </div>
    </AppShell>
  );
}

export default ExamBuilder;
