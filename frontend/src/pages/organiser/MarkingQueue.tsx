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

type ReviewAnswer = { id: string; answer_value: string | null; points_awarded: string; questions: { prompt: string; max_points: string }; submissions: { entrants: { full_name: string } }; marking_reviews: { id: string }[] };
type Remark = { id: string; status: string; reason: string; decision: string | null; entrants: { full_name: string; submissions: { answers: { id: string; answer_value: string | null; points_awarded: string; questions: { prompt: string; max_points: string } }[] }[] } };

type QueueSubmission = {
  id: string;
  received_at: string;
  is_late?: boolean;
  entrants: { id: string; full_name: string; grade: string | null };
  answers: QueueAnswer[];
};

function MarkingQueue() {
  const { id: roundId } = useParams<{ id: string }>();

  const [submissions, setSubmissions] = useState<QueueSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [sample, setSample] = useState<ReviewAnswer[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [action, setAction] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const res = await api.get<{ submissions: QueueSubmission[] }>(
        `/rounds/${roundId}/marking-queue`,
      );
      setSubmissions(res.submissions);
      const [reviewData, remarkData] = await Promise.all([
        api.get<{ sample: ReviewAnswer[] }>(`/rounds/${roundId}/review-sample`),
        api.get<{ remarks: Remark[] }>(`/rounds/${roundId}/remarks`),
      ]);
      setSample(reviewData.sample);
      setRemarks(remarkData.remarks);
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

  async function reviewAnswer(event: React.FormEvent<HTMLFormElement>, answerId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAction(true); setError(null);
    try {
      await api.patch(`/rounds/${roundId}/review-sample/${answerId}`, {
        points_awarded: Number(form.get("points")), comment: String(form.get("comment")),
      });
      await loadQueue();
    } catch (err) { setError(err instanceof Error ? err.message : "Review failed"); }
    finally { setAction(false); }
  }

  async function decideRemark(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAction(true); setError(null);
    try {
      await api.patch(`/rounds/${roundId}/remarks/${id}`, {
        status: String(form.get("status")), decision: String(form.get("decision")),
        answer_id: String(form.get("answer_id")), points_awarded: Number(form.get("points")),
      });
      await loadQueue();
    } catch (err) { setError(err instanceof Error ? err.message : "Remark decision failed"); }
    finally { setAction(false); }
  }

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

        <Card>
          <h2>Moderation sample</h2>
          <p>Review a stable sample of marked answers. A marker cannot review their own answer.</p>
          {sample.length === 0 && <p>No manually marked answers to review.</p>}
          {sample.map((answer) => <form key={answer.id} onSubmit={(e) => reviewAnswer(e, answer.id)} style={{ margin: "1rem 0", borderTop: "1px solid #ccc", paddingTop: "1rem" }}>
            <p><strong>{answer.submissions.entrants.full_name}</strong> - {answer.questions.prompt}</p>
            <p>Answer: {answer.answer_value || "(blank)"} | Mark: {answer.points_awarded}/{answer.questions.max_points} | Reviews: {answer.marking_reviews.length}</p>
            <label>Reviewed points <input name="points" type="number" min="0" max={Number(answer.questions.max_points)} step="any" defaultValue={Number(answer.points_awarded)} required /></label>{" "}
            <label>Review comment <input name="comment" required /></label>{" "}
            <Button type="submit" disabled={action}>Save review</Button>
          </form>)}
        </Card>
        <Card>
          <h2>Student remark requests</h2>
          {remarks.length === 0 && <p>No remark requests yet.</p>}
          {remarks.map((remark) => <form key={remark.id} onSubmit={(e) => decideRemark(e, remark.id)} style={{ margin: "1rem 0", borderTop: "1px solid #ccc", paddingTop: "1rem" }}>
            <p><strong>{remark.entrants.full_name}</strong> - {remark.status}: {remark.reason}</p>
            {remark.status === "pending" && <>
              <label>Decision <select name="status"><option value="rejected">Reject</option><option value="approved">Approve revised mark</option></select></label>{" "}
              <label>Answer <select name="answer_id"><option value="">Select an answer if approving</option>{remark.entrants.submissions.flatMap((sub) => sub.answers).map((answer) => <option key={answer.id} value={answer.id}>{answer.questions.prompt.slice(0, 70)} (currently {answer.points_awarded}/{answer.questions.max_points})</option>)}</select></label>{" "}
              <label>Revised points <input name="points" type="number" min="0" step="any" /></label>{" "}
              <label>Explanation <input name="decision" required minLength={5} /></label>{" "}
              <Button type="submit" disabled={action}>Record decision</Button>
            </>}
            {remark.decision && <p>Decision: {remark.decision}</p>}
          </form>)}
        </Card>
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
