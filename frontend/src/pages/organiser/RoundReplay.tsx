import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorAlert, LoadingIndicator } from "../../components/ui/Feedback";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import styles from "./RoundReplay.module.css";

type ReplayEvent = {
  id: string;
  at: string;
  kind: string;
  origin: string;
  details: Record<string, unknown>;
};
type Replay = {
  round: { name: string; state: string; opens_at: string; closes_at: string };
  timeline: ReplayEvent[];
};

export default function RoundReplay() {
  const { id } = useParams();
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    api.get<Replay>(`/rounds/${id}/replay`)
      .then((result) => { if (active) setReplay(result); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Could not load replay"); });
    return () => { active = false; };
  }, [id]);
  return (
    <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console">
      <div className={styles.stack}>
        <PageHeader title={`Round replay${replay ? `: ${replay.round.name}` : ""}`} description="Recorded portal actions and deadline decisions in time order." actions={<Button to="/organiser" variant="outline">Back to rounds</Button>} />
        {error && <ErrorAlert message={error} />}
        {!replay && !error && <LoadingIndicator label="Loading replay" />}
        {replay && <Card>
          <div className={styles.summary}>
            <span>Current state: <strong>{replay.round.state.replaceAll("_", " ")}</strong></span>
            <span>Entries: <strong>{replay.timeline.length}</strong></span>
          </div>
          {replay.timeline.length === 0 ? (
            <p className={styles.empty}>No recorded actions for this round yet.</p>
          ) : (
            <ol className={styles.timeline}>
              {replay.timeline.map((event) => <li className={styles.event} key={event.id}>
                <div className={styles.eventHeader}>
                  <strong className={styles.eventKind}>{event.kind.replaceAll("_", " ")}</strong>
                  <time className={styles.eventTime} dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                </div>
                <span className={styles.eventOrigin}>Source: {event.origin}</span>
                <pre className={styles.details}>{JSON.stringify(event.details, null, 2)}</pre>
              </li>)}
            </ol>
          )}
        </Card>}
      </div>
    </AppShell>
  );
}
