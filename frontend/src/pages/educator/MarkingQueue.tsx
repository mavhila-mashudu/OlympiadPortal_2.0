import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardCheck, FileCheck2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { api, getToken } from "../../lib/api";
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

type ReviewAnswer = {
  id: string;
  answer_value: string | null;
  points_awarded: string;
  marked_by?: string | null;
  users?: { id: string; email: string; full_name?: string | null; role?: string } | null;
  questions: { prompt: string; max_points: string };
  submissions: { entrants: { full_name: string } };
  marking_reviews: { id: string }[];
};

function getUserIdFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

export default function EducatorMarkingQueue() {
  const { id: roundId } = useParams<{ id: string }>();

  const [submissions, setSubmissions] = useState<QueueSubmission[]>([]);
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary[]>([]);
  const [sample, setSample] = useState<ReviewAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [moderationMessage, setModerationMessage] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  const currentUserId = getUserIdFromToken();

  const loadQueue = useCallback(async () => {
    if (!roundId) return;
    try {
      const [queueRes, subRes, sampleRes] = await Promise.allSettled([
        api.get<{ submissions: QueueSubmission[] }>(`/rounds/${roundId}/marking-queue`),
        api.get<{ submissions: SubmissionSummary[] }>(`/rounds/${roundId}/submissions`),
        api.get<{ sample: ReviewAnswer[] }>(`/rounds/${roundId}/review-sample`),
      ]);

      if (queueRes.status === "fulfilled") {
        setSubmissions(queueRes.value.submissions || []);
      } else {
        throw queueRes.reason;
      }

      if (subRes.status === "fulfilled") {
        setSubmissionSummary(subRes.value.submissions || []);
      }

      if (sampleRes.status === "fulfilled") {
        setSample(sampleRes.value.sample || []);
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

  const reviewAnswer = async (e: React.FormEvent<HTMLFormElement>, answerId: string) => {
    e.preventDefault();
    setModerating(true);
    setModerationError(null);
    setModerationMessage(null);
    const form = e.currentTarget;
    const points = Number((form.elements.namedItem("points") as HTMLInputElement).value);
    const comment = (form.elements.namedItem("comment") as HTMLInputElement).value;
    try {
      await api.patch(`/rounds/${roundId}/review-sample/${answerId}`, {
        points_awarded: points,
        comment,
      });
      setModerationMessage("Review saved and results recalculated");
      await loadQueue();
    } catch (err: any) {
      setModerationError(err?.message || "Failed to save review");
    } finally {
      setModerating(false);
    }
  };

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
              Mark essay and manual answers submitted by learners from your school, and moderate sampled answers across the round.
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
                  All answers for your school have been marked. You can review the
                  moderation sample below.
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

            {/* Moderation sample card */}
            <Card>
              <h2>Moderation sample</h2>
              <p>
                Review a stable sample of marked answers across the round to ensure marking consistency.
                A marker cannot moderate their own marking.
              </p>

              {moderationMessage && (
                <div className={styles.queueSummary} style={{ margin: "1rem 0" }}>
                  <span>{moderationMessage}</span>
                </div>
              )}
              {moderationError && (
                <div className={styles.errorBanner} style={{ margin: "1rem 0" }}>
                  {moderationError}
                </div>
              )}

              {sample.length === 0 ? (
                <p>No manually marked answers to review.</p>
              ) : (
                sample.map((answer) => {
                  const isSelfMarked = Boolean(
                    currentUserId &&
                      (answer.marked_by === currentUserId ||
                        answer.users?.id === currentUserId)
                  );
                  const markerLabel =
                    answer.users?.full_name ||
                    answer.users?.email ||
                    (isSelfMarked ? "You" : null);

                  return (
                    <form
                      key={answer.id}
                      onSubmit={(e) => reviewAnswer(e, answer.id)}
                      style={{
                        margin: "1rem 0",
                        borderTop: "1px solid #ccc",
                        paddingTop: "1rem",
                      }}
                    >
                      <p>
                        <strong>{answer.submissions.entrants.full_name}</strong> -{" "}
                        {answer.questions.prompt}
                      </p>
                      <p>
                        Answer: {answer.answer_value || "(blank)"} | Mark:{" "}
                        {answer.points_awarded}/{answer.questions.max_points} | Reviews:{" "}
                        {answer.marking_reviews.length}
                        {markerLabel ? ` | Marker: ${markerLabel}` : ""}
                      </p>
                      {isSelfMarked ? (
                        <p
                          style={{
                            color: "var(--muted-foreground, #666)",
                            fontStyle: "italic",
                            fontSize: "0.875rem",
                          }}
                        >
                          You marked this answer. A marker cannot moderate their own
                          marking.
                        </p>
                      ) : (
                        <>
                          <label>
                            Reviewed points{" "}
                            <input
                              name="points"
                              type="number"
                              min="0"
                              max={Number(answer.questions.max_points)}
                              step="any"
                              defaultValue={Number(answer.points_awarded)}
                              required
                            />
                          </label>{" "}
                          <label>
                            Review comment <input name="comment" required />
                          </label>{" "}
                          <Button type="submit" disabled={moderating}>
                            Save review
                          </Button>
                        </>
                      )}
                    </form>
                  );
                })
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
