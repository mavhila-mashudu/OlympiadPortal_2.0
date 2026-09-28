import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";

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
    <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console" userInitials="NO" userName="Admin user">
      <PageHeader title={`Round replay${replay ? `: ${replay.round.name}` : ""}`} description="Recorded portal actions and deadline decisions in time order." actions={<Button to="/organiser" variant="outline">Back to rounds</Button>} />
      {error && <Card>{error}</Card>}
      {!replay && !error && <p>Loading replay…</p>}
      {replay && <Card>
        <p>Current state: {replay.round.state}. Entries: {replay.timeline.length}.</p>
        {replay.timeline.length === 0 && <p>No recorded actions for this round yet.</p>}
        <ol>
          {replay.timeline.map((event) => <li key={event.id} style={{ marginBottom: "1rem" }}>
            <strong>{new Date(event.at).toLocaleString()} — {event.kind.replaceAll("_", " ")}</strong>
            <div>Source: {event.origin}</div>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.details, null, 2)}</pre>
          </li>)}
        </ol>
      </Card>}
    </AppShell>
  );
}
