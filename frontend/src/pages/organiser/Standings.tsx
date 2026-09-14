import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { api } from "../../lib/api";
import { getCurrentOlympiad, type Olympiad } from "../../lib/olympiad";
import { organiserNav } from "../../lib/mockData";
import styles from "./Standings.module.css";

type Round = { id: string; name: string; state: string };
type SchoolStanding = {
  id: string;
  name: string;
  rank: number;
  entrant_count: number;
  total_score: number;
  average_score: number;
  qualified_count: number;
};
type EntrantStanding = {
  id: string;
  name: string;
  grade: string | null;
  school: string;
  score: number;
  rank: number | null;
  qualified: boolean;
};
type Standings = {
  round: { name: string; results_released_at: string | null };
  schools: SchoolStanding[];
  entrants: EntrantStanding[];
};

function Standings() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState("");
  const [standings, setStandings] = useState<Standings | null>(null);
  const [view, setView] = useState<"schools" | "entrants">("schools");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const current = await getCurrentOlympiad();
        setOlympiad(current);
        if (!current?.id) return;
        const data = await api.get<{ rounds: Round[] }>(`/olympiads/${current.id}/rounds`);
        const released = (data.rounds || []).filter((round) => round.state === "results_released");
        setRounds(released);
        setRoundId(released[0]?.id || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load standings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!roundId) {
      setStandings(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.get<Standings>(`/rounds/${roundId}/standings`)
      .then(setStandings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load standings"))
      .finally(() => setLoading(false));
  }, [roundId]);

  return (
    <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console" userInitials="NO" userName="Admin user">
      <div className={styles.stack}>
        <PageHeader title="Standings" description={olympiad ? `Compare released results for ${olympiad.name}.` : "Compare released round results."} />
        {error && <Card className={styles.error}>{error}</Card>}
        <Card className={styles.controls}>
          <label>Released round<Select value={roundId} onChange={(event) => setRoundId(event.target.value)} disabled={rounds.length === 0}><option value="">No released rounds</option>{rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</Select></label>
        </Card>
        {!loading && !standings && !error && <Card className={styles.empty}><Trophy aria-hidden="true" /><h2>No released standings yet</h2><p>Generate and release results for a round before comparing schools and entrants.</p></Card>}
        {standings && <>
          <div className={styles.summary}><strong>{standings.round.name}</strong><span>{standings.entrants.length} entrants</span><span>{standings.schools.length} schools</span></div>
          <div className={styles.tabs} role="tablist" aria-label="Standings view"><button className={view === "schools" ? styles.activeTab : ""} onClick={() => setView("schools")} role="tab" aria-selected={view === "schools"}>By school</button><button className={view === "entrants" ? styles.activeTab : ""} onClick={() => setView("entrants")} role="tab" aria-selected={view === "entrants"}>By entrant</button></div>
          <Card padded={false}><div className={styles.tableScroller}>{view === "schools" ? <table className={styles.table}><thead><tr><th>Rank</th><th>School</th><th>Entrants</th><th>Total score</th><th>Average</th><th>Qualified</th></tr></thead><tbody>{standings.schools.map((school) => <tr key={school.id}><td><strong>#{school.rank}</strong></td><td>{school.name}</td><td>{school.entrant_count}</td><td>{school.total_score}</td><td>{school.average_score}</td><td>{school.qualified_count}</td></tr>)}</tbody></table> : <table className={styles.table}><thead><tr><th>Rank</th><th>Entrant</th><th>School</th><th>Grade</th><th>Score</th><th>Status</th></tr></thead><tbody>{standings.entrants.map((entrant) => <tr key={entrant.id}><td><strong>#{entrant.rank ?? "-"}</strong></td><td>{entrant.name}</td><td>{entrant.school}</td><td>{entrant.grade || "-"}</td><td>{entrant.score}</td><td><span className={entrant.qualified ? styles.qualified : styles.notQualified}>{entrant.qualified ? "Qualified" : "Not qualified"}</span></td></tr>)}</tbody></table>}</div></Card>
        </>}
      </div>
    </AppShell>
  );
}

export default Standings;