import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { organiserNav } from "../../lib/mockData";
import styles from "./ExamReview.module.css";

type QuestionType = "mcq" | "short_answer" | "essay";

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
  short_answer: "Short answer",
  essay: "Essay / long answer",
};

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

function ExamReview() {
  const { id: roundId } = useParams<{ id: string }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [examStatus, setExamStatus] = useState<string>("draft");
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [qRes, sRes] = await Promise.all([
        api.get<{ questions: any[] }>(`/rounds/${roundId}/questions`),
        api.get<{ exam_status: string; question_count: number }>(
          `/rounds/${roundId}/exam-status`,
        ),
      ]);
      setQuestions(qRes.questions);
      setExamStatus(sRes.exam_status);
      setQuestionCount(sRes.question_count);
    } catch {
      setQuestions([]);
      setExamStatus("draft");
    }
  }, [roundId]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/exam-status`, { status: "live" });
      setExamStatus("live");
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
    } catch (err: any) {
      setError(err.message || "Failed to send back");
    } finally {
      setActionLoading(false);
    }
  };

  const totalPoints = questions.reduce((sum, q) => sum + q.max_points, 0);
  const mcqCount = questions.filter((q) => q.type === "mcq").length;
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
                &middot; {totalPoints} total point{totalPoints !== 1 ? "s" : ""}
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
              </span>
            </div>
          )}

          {examStatus === "draft" && (
            <div className={styles.draftBanner}>
              <Send />
              <span>
                Waiting for the educator to mark this exam as ready for review.
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
                </div>

                <p className={styles.questionPrompt}>{q.prompt}</p>

                {q.type === "mcq" && q.options && (
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
                      {splitCorrect(q.correct_option).length} correct answers (
                      {perCorrectPoints(q)} each).
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
                    <span className={styles.answerLabel}>Expected answer:</span>
                    <strong>{q.correct_answer}</strong>
                  </div>
                )}

                {q.type === "essay" && (
                  <div className={styles.essayNote}>
                    This question will be queued for manual marking after
                    submission.
                  </div>
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
    </AppShell>
  );
}

export default ExamReview;
