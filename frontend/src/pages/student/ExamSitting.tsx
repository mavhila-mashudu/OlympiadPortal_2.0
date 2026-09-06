import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Send,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { studentNav } from "../../lib/mockData";
import styles from "./ExamSitting.module.css";

type QuestionType = "mcq" | "short_answer" | "essay";

type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[] | null;
  max_points: number;
};

type Answer = {
  id: string;
  question_id: string;
  answer_value: string | null;
};

type ExamData = {
  round: {
    id: string;
    name: string;
    opens_at: string;
    closes_at: string;
    state: string;
  };
  questions: Question[];
  total_points: number;
  submission: { id: string; status: string; answers: Answer[] } | null;
};

function useCountdown(closesAt: string, serverNow?: string) {
  const [remaining, setRemaining] = useState("");
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const closes = new Date(closesAt).getTime();

    function tick() {
      const now = Date.now();
      const diff = closes - now;

      if (diff <= 0) {
        setRemaining("Time expired");
        setExpired(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setRemaining(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [closesAt, serverNow]);

  return { remaining, expired };
}

function ExamSitting() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    status: string;
    total_points: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load exam data (questions + check for existing submission)
  const loadExam = useCallback(async () => {
    try {
      const res = await api.get<ExamData>(`/rounds/${roundId}/exam`);
      setExamData(res);

      if (res.submission && res.submission.status === "received") {
        setStarted(true);
        // Populate answers from existing submission
        const map = new Map<string, string>();
        for (const a of res.submission.answers) {
          if (a.answer_value) map.set(a.question_id, a.answer_value);
        }
        setAnswers(map);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load exam");
    }
  }, [roundId]);

  useEffect(() => {
    loadExam().finally(() => setLoading(false));
  }, [loadExam]);

  const { remaining, expired } = useCountdown(examData?.round.closes_at ?? "");

  // Auto-submit when time expires
  useEffect(() => {
    if (expired && started && !submitted) {
      handleSubmit();
    }
  }, [expired]);

  const startExam = async () => {
    setError(null);
    try {
      const res = await api.post<{ submission: any }>(
        `/rounds/${roundId}/exam/start`,
      );
      setStarted(true);
      // Populate empty answers map
      const map = new Map<string, string>();
      for (const a of res.submission.answers) {
        if (a.answer_value) map.set(a.question_id, a.answer_value);
      }
      setAnswers(map);
      // Reload to get submission data
      await loadExam();
    } catch (err: any) {
      setError(err.message || "Failed to start exam");
    }
  };

  // Debounced auto-save
  const saveAnswer = useCallback(
    (questionId: string, value: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(questionId, value);
        return next;
      });

      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await api.patch(`/rounds/${roundId}/exam/answers/${questionId}`, {
            answer_value: value || null,
          });
        } catch {
          // Silently fail — will retry on next change
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [roundId],
  );

  const handleSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{
        message: string;
        status: string;
        total_points: number;
      }>(`/rounds/${roundId}/exam/submit`);
      setSubmitted(true);
      setSubmitResult({ status: res.status, total_points: res.total_points });
    } catch (err: any) {
      setError(err.message || "Failed to submit exam");
    } finally {
      setSubmitting(false);
    }
  };

  const questions = examData?.questions ?? [];
  const currentQ = questions[currentIdx];
  const answeredCount = useMemo(
    () => [...answers.values()].filter((v) => v && v.trim().length > 0).length,
    [answers],
  );

  // Loading state
  if (loading) {
    return (
      <AppShell
        activeRole="student"
        navItems={studentNav}
        organisation=""
        portalLabel="Student portal"
        userInitials=""
        userName=""
      >
        <p className={styles.loading}>Loading exam...</p>
      </AppShell>
    );
  }

  // Error state (no exam data)
  if (!examData) {
    return (
      <AppShell
        activeRole="student"
        navItems={studentNav}
        organisation=""
        portalLabel="Student portal"
        userInitials=""
        userName=""
      >
        <div className={styles.stack}>
          <div className={styles.errorBanner}>
            {error || "Exam not available"}
          </div>
          <Button to="/student" variant="outline">
            <ArrowLeft /> Back to dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  // Submitted confirmation
  if (submitted) {
    return (
      <AppShell
        activeRole="student"
        navItems={studentNav}
        organisation=""
        portalLabel="Student portal"
        userInitials=""
        userName=""
      >
        <div className={styles.stack}>
          <Card className={styles.submittedCard}>
            <CheckCircle2 className={styles.submittedIcon} />
            <h1>Exam submitted</h1>
            <p>Your answers have been recorded successfully.</p>
            {submitResult && (
              <div className={styles.submitSummary}>
                <span>
                  Total points: <strong>{submitResult.total_points}</strong> /{" "}
                  {examData.total_points}
                </span>
                <span className={styles.statusPill}>
                  {submitResult.status === "automarked"
                    ? "Auto-marked"
                    : "Pending manual marking"}
                </span>
              </div>
            )}
            <Button to="/student" variant="primary">
              Back to dashboard
            </Button>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeRole="student"
      navItems={studentNav}
      organisation=""
      portalLabel="Student portal"
      userInitials=""
      userName=""
    >
      <div className={styles.layout}>
        {/* Header with timer */}
        <header className={styles.examHeader}>
          <div className={styles.headerLeft}>
            <h1>{examData.round.name}</h1>
            <p>
              {questions.length} question{questions.length !== 1 ? "s" : ""}{" "}
              &middot; {examData.total_points} points
            </p>
          </div>
          <div className={styles.headerRight}>
            <div
              className={`${styles.timer} ${expired ? styles.timerExpired : ""}`}
            >
              <Clock />
              <span>{remaining}</span>
            </div>
            {saving && (
              <span className={styles.savingIndicator}>Saving...</span>
            )}
          </div>
        </header>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* Pre-start screen */}
        {!started && (
          <Card className={styles.startCard}>
            <h2>Ready to begin?</h2>
            <p>
              Once you start, the timer will begin and you cannot pause the
              exam. Make sure you have a stable connection.
            </p>
            <Button onClick={startExam} disabled={expired}>
              {expired ? "Time expired" : "Start exam"}
            </Button>
          </Card>
        )}

        {/* Exam interface */}
        {started && currentQ && (
          <div className={styles.examBody}>
            {/* Navigator sidebar */}
            <aside className={styles.navigator}>
              <h3>Questions</h3>
              <div className={styles.navGrid}>
                {questions.map((q, i) => {
                  const hasAnswer =
                    answers.has(q.id) &&
                    (answers.get(q.id)?.trim().length ?? 0) > 0;
                  const isCurrent = i === currentIdx;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={`${styles.navBtn} ${isCurrent ? styles.navCurrent : ""} ${hasAnswer ? styles.navAnswered : ""}`}
                      onClick={() => setCurrentIdx(i)}
                      title={`Question ${i + 1}${hasAnswer ? " (answered)" : ""}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className={styles.navLegend}>
                <span className={styles.legendItem}>
                  <span
                    className={`${styles.legendDot} ${styles.legendAnswered}`}
                  />
                  Answered ({answeredCount})
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={`${styles.legendDot} ${styles.legendUnanswered}`}
                  />
                  Unanswered ({questions.length - answeredCount})
                </span>
              </div>
            </aside>

            {/* Question area */}
            <div className={styles.questionArea}>
              <div className={styles.questionHeader}>
                <span className={styles.questionLabel}>
                  Question {currentIdx + 1} of {questions.length}
                </span>
                <span className={styles.typeBadge}>
                  {currentQ.type === "mcq"
                    ? "Multiple choice"
                    : currentQ.type === "short_answer"
                      ? "Short answer"
                      : "Essay"}
                </span>
                <span className={styles.points}>{currentQ.max_points} pts</span>
              </div>

              <p className={styles.prompt}>{currentQ.prompt}</p>

              {/* MCQ */}
              {currentQ.type === "mcq" && currentQ.options && (
                <div className={styles.optionsList}>
                  {currentQ.options.map((opt, idx) => (
                    <label key={idx} className={styles.optionLabel}>
                      <input
                        type="radio"
                        name={`q-${currentQ.id}`}
                        value={String(idx)}
                        checked={answers.get(currentQ.id) === String(idx)}
                        onChange={() => saveAnswer(currentQ.id, String(idx))}
                        className={styles.radio}
                      />
                      <span
                        className={`${styles.optionText} ${answers.get(currentQ.id) === String(idx) ? styles.optionSelected : ""}`}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Short answer */}
              {currentQ.type === "short_answer" && (
                <Input
                  placeholder="Type your answer..."
                  value={answers.get(currentQ.id) ?? ""}
                  onChange={(e) => saveAnswer(currentQ.id, e.target.value)}
                  className={styles.shortInput}
                />
              )}

              {/* Essay */}
              {currentQ.type === "essay" && (
                <Textarea
                  rows={8}
                  placeholder="Write your answer here..."
                  value={answers.get(currentQ.id) ?? ""}
                  onChange={(e) => saveAnswer(currentQ.id, e.target.value)}
                  className={styles.essayInput}
                />
              )}

              {/* Navigation */}
              <div className={styles.questionNav}>
                <Button
                  variant="outline"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx(currentIdx - 1)}
                >
                  <ChevronLeft /> Previous
                </Button>
                {currentIdx < questions.length - 1 ? (
                  <Button
                    variant="outline"
                    onClick={() => setCurrentIdx(currentIdx + 1)}
                  >
                    Next <ChevronRight />
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={submitting}
                  >
                    <Send /> Submit exam
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit confirmation dialog */}
        {showConfirm && (
          <div className={styles.overlay}>
            <div className={styles.confirmDialog}>
              <AlertCircle className={styles.confirmIcon} />
              <h2>Submit your exam?</h2>
              <p>
                You have answered <strong>{answeredCount}</strong> of{" "}
                <strong>{questions.length}</strong> questions.
                {answeredCount < questions.length && (
                  <span className={styles.warning}>
                    {" "}
                    {questions.length - answeredCount} question
                    {questions.length - answeredCount !== 1 ? "s" : ""}{" "}
                    unanswered will be submitted as blank.
                  </span>
                )}
              </p>
              <div className={styles.confirmActions}>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                >
                  Go back
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting..." : "Confirm submit"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default ExamSitting;
