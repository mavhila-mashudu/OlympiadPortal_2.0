import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { organiserNav } from "../../lib/mockData";
import styles from "./ExamReview.module.css";

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

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

// correct_option holds option indexes as a
// comma-separated string ("0,2") — split it
// so multi-answer MCQs highlight every
// correct option.
const splitCorrect = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const perCorrectPoints = (q: Question) => {
  const n = splitCorrect(q.correct_option).length;
  return n > 0 ? Math.round((Number(q.max_points) / n) * 100) / 100 : 0;
};

// Inline editor the organiser uses to correct a question's
// expected answer before approving.  The backend enforces
// that corrections are allowed only while the exam is
// "ready" (awaiting verification).
function CorrectAnswerEditor({
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

function ExamReview() {
  const { id: roundId } = useParams<{ id: string }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [examStatus, setExamStatus] = useState<string>("draft");
  const [questionCount, setQuestionCount] = useState(0);
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [memoUrl, setMemoUrl] = useState<string | null>(null);
  const [showMemo, setShowMemo] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [qRes, sRes] = await Promise.all([
        api.get<{ questions: any[] }>(`/rounds/${roundId}/questions`),
        api.get<{
          exam_status: string;
          question_count: number;
          approved_by_name?: string | null;
          approved_at?: string | null;
        }>(`/rounds/${roundId}/exam-status`),
      ]);
      setQuestions(qRes.questions);
      setExamStatus(sRes.exam_status);
      setQuestionCount(sRes.question_count);
      setApprovedBy(sRes.approved_by_name ?? null);
      setApprovedAt(sRes.approved_at ?? null);
    } catch {
      setQuestions([]);
      setExamStatus("draft");
    }
  }, [roundId]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Signed viewing URL for the round's memo — displayed
  // side-by-side so each digitized answer can be verified
  // against the original
  useEffect(() => {
    api
      .get<{ url: string }>(`/papers/by-round/${roundId}?type=memo`)
      .then((res) => setMemoUrl(res.url))
      .catch(() => setMemoUrl(null));
  }, [roundId]);

  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/exam-status`, { status: "live" });
      // Re-fetch so the audit trail (approved_by / approved_at)
      // reflects this approval
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to approve");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendBack = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/exam-status`, { status: "draft" });
      setExamStatus("draft");
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || "Failed to send back");
    } finally {
      setActionLoading(false);
    }
  };

  // Save an organiser correction to a question's expected
  // answer (only offered while the exam is "ready")
  const handleCorrectSave = async (
    q: Question,
    data: { correct_option?: string | null; correct_answer?: string | null },
  ) => {
    setCorrecting(true);
    setError(null);
    try {
      const res = await api.patch<{ question: any }>(
        `/rounds/${roundId}/questions/${q.id}`,
        data,
      );
      setQuestions((prev) =>
        prev.map((x) => (x.id === q.id ? res.question : x)),
      );
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || "Failed to save correction");
    } finally {
      setCorrecting(false);
    }
  };

  const totalPoints = questions.reduce((sum, q) => sum + q.max_points, 0);
  const mcqCount = questions.filter((q) => q.type === "mcq").length;
  const tfCount = questions.filter((q) => q.type === "true_false").length;
  const shortCount = questions.filter((q) => q.type === "short_answer").length;
  const essayCount = questions.filter((q) => q.type === "essay").length;
  const isReady = examStatus === "ready";
  const isLive = examStatus === "live";

  if (loading) {
    return (
      <AppShell
        activeRole="organiser"
        navItems={organiserNav}
        organisation=""
        portalLabel="Organiser portal"
        userInitials=""
        userName=""
      >
        <p className={styles.loading}>Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeRole="organiser"
      navItems={organiserNav}
      organisation=""
      portalLabel="Organiser portal"
      userInitials=""
      userName=""
    >
      <div className={showMemo && memoUrl ? styles.reviewLayout : styles.stack}>
        <div className={styles.stack}>
          <header className={styles.pageHeader}>
            <div>
              <h1>Exam Review</h1>
              <p>
                Verify the digitized questions against the original paper memo
                before approving for online sitting.
              </p>
            </div>
            <div className={styles.pageActions}>
              {memoUrl && (
                <Button
                  variant="outline"
                  onClick={() => setShowMemo((v) => !v)}
                >
                  <FileText />
                  {showMemo ? "Hide" : "Show"} memo
                </Button>
              )}
              <Button variant="outline" to="/organiser">
                <ArrowLeft /> Dashboard
              </Button>
            </div>
          </header>

          {/* Summary + actions */}
          <Card className={styles.summaryCard} padded={false}>
            <div className={styles.summaryHeader}>
              <ShieldCheck className={styles.shieldIcon} />
              <div>
                <h2>Verification summary</h2>
                <p>
                  {questionCount} question{questionCount !== 1 ? "s" : ""}{" "}
                  &middot; {totalPoints} total point
                  {totalPoints !== 1 ? "s" : ""}
                </p>
              </div>
              <span className={`${styles.statusPill} ${styles[examStatus]}`}>
                {examStatus === "draft" && "Draft"}
                {examStatus === "ready" && "Awaiting approval"}
                {examStatus === "live" && "Approved — live"}
              </span>
            </div>

            <div className={styles.summaryGrid}>
              <div className={styles.summaryCell}>
                <span className={styles.summaryValue}>{mcqCount}</span>
                <span className={styles.summaryLabel}>Multiple choice</span>
              </div>
              <div className={styles.summaryCell}>
                <span className={styles.summaryValue}>{tfCount}</span>
                <span className={styles.summaryLabel}>True / False</span>
              </div>
              <div className={styles.summaryCell}>
                <span className={styles.summaryValue}>{shortCount}</span>
                <span className={styles.summaryLabel}>Short answer</span>
              </div>
              <div className={styles.summaryCell}>
                <span className={styles.summaryValue}>{essayCount}</span>
                <span className={styles.summaryLabel}>Essay</span>
              </div>
            </div>

            {isReady && (
              <div className={styles.actionRow}>
                <Button onClick={handleApprove} disabled={actionLoading}>
                  <CheckCircle2 />
                  {actionLoading ? "Approving..." : "Approve & go live"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSendBack}
                  disabled={actionLoading}
                >
                  <RotateCcw />
                  {actionLoading ? "Sending back..." : "Send back for edits"}
                </Button>
              </div>
            )}

            {isLive && (
              <div className={styles.liveBanner}>
                <CheckCircle2 />
                <span>
                  This exam has been verified and is live for online sitting.
                  {approvedBy && (
                    <>
                      {" "}
                      Verified by <strong>{approvedBy}</strong>
                      {approvedAt &&
                        ` on ${dateFormatter.format(new Date(approvedAt))}`}
                      .
                    </>
                  )}
                </span>
              </div>
            )}

            {examStatus === "draft" && (
              <div className={styles.draftBanner}>
                <Send />
                <span>
                  Waiting for the educator to mark this exam as ready for
                  review.
                </span>
              </div>
            )}
          </Card>

          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Questions */}
          {questions.length > 0 && (
            <div className={styles.questionList}>
              {questions.map((q, i) => (
                <div key={q.id} className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <span className={styles.questionNumber}>Q{i + 1}</span>
                    <span className={styles.typeBadge}>
                      {TYPE_LABELS[q.type]}
                      {q.type === "mcq" &&
                      splitCorrect(q.correct_option).length > 1
                        ? " (multiple answers)"
                        : ""}
                    </span>
                    <span className={styles.points}>
                      {q.max_points} pt{q.max_points !== 1 ? "s" : ""}
                    </span>
                    {isReady && (
                      <div className={styles.questionActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() =>
                            setEditingId(editingId === q.id ? null : q.id)
                          }
                          title="Correct answer"
                        >
                          <Pencil />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className={styles.questionPrompt}>{q.prompt}</p>

                  {(q.type === "mcq" || q.type === "true_false") &&
                    q.options && (
                      <ul className={styles.optionsList}>
                        {q.options.map((opt, idx) => (
                          <li
                            key={idx}
                            className={`${styles.optionItem} ${splitCorrect(q.correct_option).includes(String(idx)) ? styles.correctOption : ""}`}
                          >
                            <span className={styles.optionLetter}>
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            {opt}
                            {splitCorrect(q.correct_option).includes(
                              String(idx),
                            ) && <CheckCircle2 className={styles.checkIcon} />}
                          </li>
                        ))}
                      </ul>
                    )}

                  {q.type === "mcq" &&
                    splitCorrect(q.correct_option).length > 1 && (
                      <p className={styles.essayNote}>
                        Points split evenly across{" "}
                        {splitCorrect(q.correct_option).length} correct answers
                        ({perCorrectPoints(q)} each).
                      </p>
                    )}

                  {q.type === "mcq" && Number(q.negative_pct) > 0 && (
                    <p className={styles.essayNote}>
                      Negative marking: {Number(q.negative_pct)}% of the
                      question&apos;s points deducted per wrong selection.
                    </p>
                  )}

                  {q.type === "short_answer" && q.correct_answer && (
                    <div className={styles.answerBox}>
                      <span className={styles.answerLabel}>
                        Expected answer:
                      </span>
                      <strong>{q.correct_answer}</strong>
                    </div>
                  )}

                  {q.type === "essay" && (
                    <div className={styles.essayNote}>
                      This question will be queued for manual marking after
                      submission.
                    </div>
                  )}

                  {isReady && editingId === q.id && (
                    <CorrectAnswerEditor
                      question={q}
                      onSave={(data) => handleCorrectSave(q, data)}
                      onCancel={() => setEditingId(null)}
                      saving={correcting}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {questions.length === 0 && (
            <Card className={styles.emptyCard}>
              <p>No questions have been added to this exam yet.</p>
            </Card>
          )}
        </div>

        {/* Side-by-side PDF viewer — the original memo */}
        {showMemo && memoUrl && (
          <aside className={styles.pdfPanel}>
            <div className={styles.pdfPanelHeader}>
              <FileText />
              <span>Memo (for verification)</span>
            </div>
            <iframe src={memoUrl} title="Memo" className={styles.pdfFrame} />
          </aside>
        )}
      </div>
    </AppShell>
  );
}

export default ExamReview;
