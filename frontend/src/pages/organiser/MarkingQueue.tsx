import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  FileCheck2,
  Trophy,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { organiserNav } from "../../lib/mockData";
import { AnswerCard, type QueueAnswer } from "./AnswerCard";
import styles from "./MarkingQueue.module.css";

type QueueSubmission = {
  id: string;
  received_at: string;
  is_late?: boolean;
  entrants: { id: string; full_name: string; grade: string | null };
  answers: QueueAnswer[];
};

type SubmissionSummary = {
  id: string;
  route: "online" | "offline";
  is_late?: boolean;
};

function MarkingQueue() {
  const { id: roundId } = useParams<{ id: string }>();

  const [submissions, setSubmissions] = useState<QueueSubmission[]>([]);
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const [queue, all] = await Promise.all([
        api.get<{ submissions: QueueSubmission[] }>(
          `/rounds/${roundId}/marking-queue`,
        ),
        api.get<{ submissions: SubmissionSummary[] }>(
          `/rounds/${roundId}/submissions`,
        ),
      ]);
      setSubmissions(queue.submissions);
      setSubmissionSummary(all.submissions);
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
  const onlineCount = submissionSummary.filter((submission) => submission.route === "online").length;
  const offlineCount = submissionSummary.filter((submission) => submission.route === "offline").length;

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

        <Card className={styles.routeSummary}>
          <div>
            <h2>One paper, two sitting routes</h2>
            <p>Online and paper submissions use this round&apos;s official paper and are marked together.</p>
          </div>
          <div className={styles.routeCounts}>
            <span><strong>{onlineCount}</strong> online</span>
            <span><strong>{offlineCount}</strong> paper</span>
            <span><strong>{submissionSummary.filter((submission) => submission.is_late).length}</strong> late</span>
          </div>
        </Card>

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
