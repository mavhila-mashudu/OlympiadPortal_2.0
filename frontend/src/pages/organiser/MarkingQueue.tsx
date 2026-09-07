import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Trophy,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { organiserNav } from "../../lib/mockData";
import styles from "./MarkingQueue.module.css";

type QueueAnswer = {
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

type QueueSubmission = {
  id: string;
  received_at: string;
  is_late?: boolean;
  entrants: { id: string; full_name: string; grade: string | null };
  answers: QueueAnswer[];
};

function AnswerCard({
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

function MarkingQueue() {
  const { id: roundId } = useParams<{ id: string }>();

  const [submissions, setSubmissions] = useState<QueueSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const res = await api.get<{ submissions: QueueSubmission[] }>(
        `/rounds/${roundId}/marking-queue`,
      );
      setSubmissions(res.submissions);
    } catch (err: any) {
      setError(err.message || "Failed to load marking queue");
    }
  }, [roundId]);

  useEffect(() => {
    loadQueue().finally(() => setLoading(false));
  }, [loadQueue]);

  const handleMarked = () => {
    loadQueue();
  };

  const handleGenerateResults = async () => {
    setGenerating(true);
    setError(null);
    try {
      await api.post(`/rounds/${roundId}/results`);
      setGenerated(true);
    } catch (err: any) {
      setError(err.message || "Failed to generate results");
    } finally {
      setGenerating(false);
    }
  };

  const totalPending = submissions.reduce(
    (sum, s) => sum + s.answers.length,
    0,
  );

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
        <p className={styles.loading}>Loading marking queue...</p>
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
            <h1>Marking queue</h1>
            <p>
              Essay answers that need human marking. Auto-marked questions
              (multiple choice, short answer) are already scored.
            </p>
          </div>
          <div className={styles.pageActions}>
            <Button variant="outline" to="/organiser">
              <ArrowLeft /> Dashboard
            </Button>
          </div>
        </header>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {submissions.length === 0 && (
          <Card className={styles.emptyCard}>
            {generated ? (
              <>
                <Trophy className={styles.emptyIcon} />
                <h2>Results released</h2>
                <p>
                  All answers are marked and final results with ranks have been
                  generated for this round.
                </p>
              </>
            ) : (
              <>
                <FileCheck2 className={styles.emptyIcon} />
                <h2>Nothing to mark</h2>
                <p>
                  All answers for this round have been marked. You can generate
                  the final results now.
                </p>
                <Button
                  onClick={handleGenerateResults}
                  disabled={generating}
                  icon={<Trophy aria-hidden="true" />}
                >
                  {generating ? "Generating..." : "Generate results"}
                </Button>
              </>
            )}
          </Card>
        )}

        {submissions.length > 0 && (
          <>
            <div className={styles.queueSummary}>
              <ClipboardCheck className={styles.summaryIcon} />
              <span>
                <strong>{totalPending}</strong> answer
                {totalPending !== 1 ? "s" : ""} awaiting marking across{" "}
                <strong>{submissions.length}</strong> submission
                {submissions.length !== 1 ? "s" : ""}
              </span>
            </div>

            {submissions.map((sub) => (
              <Card
                key={sub.id}
                className={styles.submissionCard}
                padded={false}
              >
                <div className={styles.submissionHeader}>
                  <h2>{sub.entrants.full_name}</h2>
                  {sub.is_late && (
                    <span
                      className={styles.lateTag}
                      title="Submitted after the round's closing time"
                    >
                      Late
                    </span>
                  )}
                  {sub.entrants.grade && (
                    <span className={styles.gradeTag}>
                      Grade {sub.entrants.grade}
                    </span>
                  )}
                  <span className={styles.answerCount}>
                    {sub.answers.length} to mark
                  </span>
                </div>
                <div className={styles.submissionBody}>
                  {sub.answers.map((answer) => (
                    <AnswerCard
                      key={answer.id}
                      answer={answer}
                      roundId={roundId ?? ""}
                      onMarked={handleMarked}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default MarkingQueue;
