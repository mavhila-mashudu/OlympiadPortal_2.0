import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardCheck, FileCheck2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { educatorNav } from "../../lib/mockData";
import { AnswerCard, type QueueAnswer } from "../organiser/AnswerCard";
import styles from "../organiser/MarkingQueue.module.css";

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

export default function EducatorMarkingQueue() {
  const { id: roundId } = useParams<{ id: string }>();

  const [submissions, setSubmissions] = useState<QueueSubmission[]>([]);
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!roundId) return;
    try {
      const [queueRes, subRes] = await Promise.allSettled([
        api.get<{ submissions: QueueSubmission[] }>(`/rounds/${roundId}/marking-queue`),
        api.get<{ submissions: SubmissionSummary[] }>(`/rounds/${roundId}/submissions`),
      ]);

      if (queueRes.status === "fulfilled") {
        setSubmissions(queueRes.value.submissions || []);
      } else {
        throw queueRes.reason;
      }

      if (subRes.status === "fulfilled") {
        setSubmissionSummary(subRes.value.submissions || []);
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load marking queue");
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const totalPending = submissions.reduce(
    (sum, sub) => sum + sub.answers.length,
    0,
  );

  const onlineCount = submissionSummary.filter((s) => s.route === "online").length;
  const offlineCount = submissionSummary.filter((s) => s.route === "offline").length;

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation=""
      portalLabel="Educator portal"
    >
      <div className={styles.stack}>
        <div className={styles.pageHeader}>
          <div className={styles.pageActions}>
            <Button
              to={`/educator/rounds/${roundId}`}
              variant="outline"
              size="sm"
              icon={<ArrowLeft aria-hidden="true" />}
            >
              Back to round
            </Button>
          </div>
          <div>
            <h1>Marking queue</h1>
            <p>
              Mark essay and manual answers submitted by learners from your school.
            </p>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {loading ? (
          <p className={styles.loading}>Loading marking queue…</p>
        ) : (
          <>
            <Card className={styles.routeSummary}>
              <div>
                <h2>Your school's submissions</h2>
                <p>Track learner papers and marking progress.</p>
              </div>
              <div className={styles.routeCounts}>
                <span>
                  <strong>{onlineCount}</strong> online
                </span>
                <span>
                  <strong>{offlineCount}</strong> paper
                </span>
                <span>
                  <strong>
                    {submissionSummary.filter((s) => s.is_late).length}
                  </strong>{" "}
                  late
                </span>
              </div>
            </Card>

            {submissions.length === 0 ? (
              <Card className={styles.emptyCard}>
                <FileCheck2 className={styles.emptyIcon} />
                <h2>Nothing to mark</h2>
                <p>
                  All answers for your school have been marked. The organiser will
                  moderate a sample and release the round's final results.
                </p>
              </Card>
            ) : (
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

                    <div className={styles.answerList}>
                      {sub.answers.map((answer) => (
                        <AnswerCard
                          key={answer.id}
                          answer={answer}
                          roundId={roundId!}
                          onMarked={loadQueue}
                        />
                      ))}
                    </div>
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
