import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Send,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { studentNav } from "../../lib/mockData";
import styles from "./ExamSitting.module.css";

type QuestionType = "mcq" | "true_false" | "short_answer" | "essay";

type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[] | null;
  max_points: number;
  multi_select?: boolean;
  negative_pct?: number | null;
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
  server_time?: string;
  submission: { id: string; status: string; answers: Answer[] } | null;
};

function useCountdown(closesAt: string, offsetMs = 0) {
  const [remaining, setRemaining] = useState("");
  const [expired, setExpired] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  useEffect(() => {
    const closes = new Date(closesAt).getTime();

    function tick() {
      // Apply the server-clock offset so a skewed
      // local clock can't extend or shorten the exam
      const now = Date.now() + offsetMs;
      const diff = closes - now;

      if (diff <= 0) {
        setRemaining("Time expired");
        setExpired(true);
        setUrgent(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      // Final five minutes — the timer turns red
      setUrgent(diff <= 5 * 60 * 1000);
      setRemaining(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [closesAt, offsetMs]);

  return { remaining, expired, urgent };
}

// ── Offline resilience ──────────────────────────────
// Answers persist to localStorage so a refresh or
// network drop never loses work.  The dirty list
// tracks answers whose last save failed — they are
// replayed on reconnect and before submitting.
type StoredAnswers = { answers: Record<string, string>; dirty: string[] };

const readStored = (key: string): StoredAnswers => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { answers: {}, dirty: [] };
    const parsed = JSON.parse(raw);
    return {
      answers: parsed.answers ?? {},
      dirty: Array.isArray(parsed.dirty) ? parsed.dirty : [],
    };
  } catch {
    return { answers: {}, dirty: [] };
  }
};

const writeStored = (key: string, state: StoredAnswers) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Quota exceeded / private mode — degrade gracefully
  }
};

function ExamSitting() {
  const { id: roundId } = useParams<{ id: string }>();

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const answersRef = useRef<Map<string, string>>(new Map());
  const dirtyRef = useRef<Set<string>>(new Set());
  const [serverOffset, setServerOffset] = useState(0);
  const [offline, setOffline] = useState(false);
  const [submitQueued, setSubmitQueued] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    status: string;
    total_points: number;
    is_late?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [dirtyCount, setDirtyCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // A final submit that failed while offline is retried
  // through this ref so reconnect handlers always use the
  // freshest state
  const submitRetryRef = useRef<(() => void) | undefined>(undefined);
  const submitQueuedRef = useRef(false);

  useEffect(() => {
    submitQueuedRef.current = submitQueued;
  }, [submitQueued]);

  // Load exam data (questions + check for existing submission)
  const loadExam = useCallback(async () => {
    try {
      const res = await api.get<ExamData>(`/rounds/${roundId}/exam`);
      setExamData(res);

      // Offset between the server clock and this device
      if (res.server_time) {
        setServerOffset(new Date(res.server_time).getTime() - Date.now());
      }

      if (res.submission && res.submission.status === "received") {
        setStarted(true);
        // Populate answers from existing submission
        const map = new Map<string, string>();
        for (const a of res.submission.answers) {
          if (a.answer_value) map.set(a.question_id, a.answer_value);
        }
        // Overlay locally stored answers whose last save
        // failed — they are newer than what the server has
        const stored = readStored(`exam-answers-${roundId}`);
        for (const qid of stored.dirty) {
          if (stored.answers[qid] !== undefined) {
            map.set(qid, stored.answers[qid]);
          }
        }
        answersRef.current = map;
        setAnswers(map);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load exam");
    }
  }, [roundId]);

  useEffect(() => {
    loadExam().finally(() => setLoading(false));
  }, [loadExam]);

  // Flags are a local navigation aid (never sent to the
  // server) but persist across refreshes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`exam-flags-${roundId}`);
      if (raw) setFlagged(new Set(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, [roundId]);

  const toggleFlag = (questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      try {
        localStorage.setItem(
          `exam-flags-${roundId}`,
          JSON.stringify([...next]),
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { remaining, expired, urgent } = useCountdown(
    examData?.round.closes_at ?? "",
    serverOffset,
  );

  // Auto-submit when time expires
  useEffect(() => {
    if (expired && started && !submitted) {
      handleSubmit();
    }
  }, [expired]);

  const startExam = async () => {
    setError(null);
    try {
      await api.post(`/rounds/${roundId}/exam/start`);
      setStarted(true);
      // loadExam populates the answers map (incl. any
      // locally stored dirty answers from an earlier
      // sitting attempt)
      await loadExam();
    } catch (err: any) {
      setError(err.message || "Failed to start exam");
    }
  };

  // Persist the full answer state + dirty list locally
  const persistLocal = useCallback(() => {
    writeStored(`exam-answers-${roundId}`, {
      answers: Object.fromEntries(answersRef.current),
      dirty: [...dirtyRef.current],
    });
  }, [roundId]);

  // Push a single answer to the server; failures are
  // remembered in the dirty set for replay
  const pushAnswer = useCallback(
    async (questionId: string) => {
      const value = answersRef.current.get(questionId);
      setSaveState("saving");
      try {
        await api.patch(`/rounds/${roundId}/exam/answers/${questionId}`, {
          answer_value: value || null,
        });
        dirtyRef.current.delete(questionId);
        setSaveState("saved");
      } catch {
        dirtyRef.current.add(questionId);
        setSaveState("idle");
      } finally {
        setDirtyCount(dirtyRef.current.size);
        persistLocal();
      }
    },
    [roundId, persistLocal],
  );

  // Replay only the answers that failed to save
  const flushPending = useCallback(async () => {
    const qids = [...dirtyRef.current];
    await Promise.allSettled(qids.map((qid) => pushAnswer(qid)));
  }, [pushAnswer]);

  // Push every current answer (used right before submit
  // so nothing is lost to a pending debounce or a drop)
  const pushAll = useCallback(async () => {
    const qids = [...answersRef.current.keys()];
    await Promise.allSettled(qids.map((qid) => pushAnswer(qid)));
  }, [pushAnswer]);

  // Debounced auto-save
  const saveAnswer = useCallback(
    (questionId: string, value: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      answersRef.current = new Map(answersRef.current).set(questionId, value);
      setAnswers(answersRef.current);
      persistLocal();

      saveTimerRef.current = setTimeout(() => {
        pushAnswer(questionId);
      }, 800);
    },
    [persistLocal, pushAnswer],
  );

  // Replay failed saves when the connection returns
  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      if (started && !submitted) {
        flushPending();
        // A final submit that failed offline retries
        // immediately on reconnect
        if (submitQueuedRef.current) submitRetryRef.current?.();
      }
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [started, submitted, flushPending]);

  // Periodic connectivity ping — the browser's online/offline
  // events only fire on interface changes; this also detects
  // loss of actual server reachability
  useEffect(() => {
    if (!started || submitted) return;
    const ping = async () => {
      let ok = false;
      try {
        await api.get("/health");
        ok = true;
      } catch {
        ok = false;
      }
      if (ok) {
        setOffline(false);
        flushPending();
        if (submitQueuedRef.current) submitRetryRef.current?.();
      } else {
        setOffline(true);
      }
    };
    const t = setInterval(ping, 30000);
    return () => clearInterval(t);
  }, [started, submitted, flushPending]);

  // Background retry for a final submit that failed due to
  // network loss — re-attempts every 15s while a connection
  // appears available
  useEffect(() => {
    if (!submitQueued || submitted) return;
    const t = setInterval(() => {
      if (!offline) submitRetryRef.current?.();
    }, 15000);
    return () => clearInterval(t);
  }, [submitQueued, submitted, offline]);

  const handleSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setError(null);
    try {
      // Flush every answer before finalising — includes
      // anything still inside the debounce window or
      // the dirty set from an earlier network drop
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await pushAll();

      const res = await api.post<{
        message: string;
        status: string;
        total_points: number;
        is_late?: boolean;
      }>(`/rounds/${roundId}/exam/submit`);
      setSubmitted(true);
      setSubmitQueued(false);
      setSubmitResult({
        status: res.status,
        total_points: res.total_points,
        is_late: res.is_late,
      });
      // Local caches no longer needed
      try {
        localStorage.removeItem(`exam-answers-${roundId}`);
        localStorage.removeItem(`exam-flags-${roundId}`);
      } catch {
        // ignore
      }
    } catch (err: any) {
      if (err instanceof TypeError) {
        // Network failure — the final submit is queued and
        // retried automatically once the connection returns
        setSubmitQueued(true);
      } else {
        setError(err.message || "Failed to submit exam");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Kept current so reconnect handlers and the retry
  // interval always re-attempt with fresh state
  submitRetryRef.current = handleSubmit;

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
            {submitResult?.is_late && (
              <p className={styles.lateNote}>
                Your submission arrived after the closing time and has been
                flagged for the organiser to review.
              </p>
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
              className={`${styles.timer} ${expired ? styles.timerExpired : urgent ? styles.timerUrgent : ""}`}
            >
              <Clock />
              <span>{remaining}</span>
            </div>
            {started && (
              <span
                className={`${styles.saveStatus} ${dirtyCount > 0 && saveState !== "saving" ? styles.savePending : ""}`}
              >
                {saveState === "saving"
                  ? "Saving..."
                  : dirtyCount > 0
                    ? `${dirtyCount} answer${dirtyCount !== 1 ? "s" : ""} saved locally`
                    : saveState === "saved"
                      ? "All answers saved"
                      : ""}
              </span>
            )}
          </div>
        </header>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {offline && started && (
          <div className={styles.offlineBanner}>
            You are offline — your answers are saved locally and will sync when
            the connection returns.
          </div>
        )}

        {submitQueued && !submitted && (
          <div className={styles.offlineBanner}>
            Your answers are saved locally. The exam will be submitted
            automatically when your connection returns.
          </div>
        )}

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
                  const isFlagged = flagged.has(q.id);
                  const isCurrent = i === currentIdx;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={`${styles.navBtn} ${hasAnswer ? styles.navAnswered : ""} ${isFlagged ? styles.navFlagged : ""} ${isCurrent ? styles.navCurrent : ""}`}
                      onClick={() => setCurrentIdx(i)}
                      title={`Question ${i + 1}${hasAnswer ? " (answered)" : ""}${isFlagged ? " (flagged for review)" : ""}`}
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
                <span className={styles.legendItem}>
                  <span
                    className={`${styles.legendDot} ${styles.legendFlagged}`}
                  />
                  Flagged ({flagged.size})
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
                    ? currentQ.multi_select
                      ? "Multiple answer"
                      : "Multiple choice"
                    : currentQ.type === "true_false"
                      ? "True / False"
                      : currentQ.type === "short_answer"
                        ? "Short answer"
                        : "Essay"}
                </span>
                <button
                  type="button"
                  className={`${styles.flagBtn} ${flagged.has(currentQ.id) ? styles.flagBtnActive : ""}`}
                  onClick={() => toggleFlag(currentQ.id)}
                  title={
                    flagged.has(currentQ.id) ? "Remove flag" : "Flag for review"
                  }
                >
                  <Flag />
                  {flagged.has(currentQ.id) ? "Flagged" : "Flag"}
                </button>
                <span className={styles.points}>{currentQ.max_points} pts</span>
              </div>

              <p className={styles.prompt}>{currentQ.prompt}</p>

              {/* MCQ guidance */}
              {currentQ.type === "mcq" &&
                (currentQ.multi_select ||
                  Number(currentQ.negative_pct) > 0) && (
                  <div className={styles.mcqHints}>
                    {currentQ.multi_select && (
                      <p>Select all answers that apply.</p>
                    )}
                    {Number(currentQ.negative_pct) > 0 && (
                      <p className={styles.negativeHint}>
                        Each wrongly selected option deducts{" "}
                        {Number(currentQ.negative_pct)}% of this question&apos;s
                        points.
                      </p>
                    )}
                  </div>
                )}

              {/* Choice questions — checkboxes when multiple answers apply */}
              {(currentQ.type === "mcq" || currentQ.type === "true_false") &&
                currentQ.options && (
                  <div className={styles.optionsList}>
                    {currentQ.options.map((opt, idx) => {
                      const multi =
                        currentQ.type === "mcq"
                          ? (currentQ.multi_select ?? false)
                          : false;
                      const selectedList = (answers.get(currentQ.id) ?? "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const isChecked = selectedList.includes(String(idx));

                      const handleSelect = () => {
                        if (!multi) {
                          saveAnswer(currentQ.id, String(idx));
                          return;
                        }
                        const next = isChecked
                          ? selectedList.filter((s) => s !== String(idx))
                          : [...selectedList, String(idx)];
                        saveAnswer(currentQ.id, next.join(","));
                      };

                      return (
                        <label key={idx} className={styles.optionLabel}>
                          <input
                            type={multi ? "checkbox" : "radio"}
                            name={`q-${currentQ.id}`}
                            checked={isChecked}
                            onChange={handleSelect}
                            className={styles.radio}
                          />
                          <span
                            className={`${styles.optionText} ${isChecked ? styles.optionSelected : ""}`}
                          >
                            {String.fromCharCode(65 + idx)}. {opt}
                          </span>
                        </label>
                      );
                    })}
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
