import { Building2, FileCheckCorner, FilePlusCorner, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import type { RoundStatus } from "../../lib/mockData";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import { getCurrentOlympiad, type Olympiad } from "../../lib/olympiad";
import styles from "./Dashboard.module.css";

type Round = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  state: "scheduled" | "open" | "closed" | "marking" | "results_released";
  _count: { submissions: number; entrant_registrations: number };
};

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toBadgeStatus(state: Round["state"]): RoundStatus {
  if (state === "open") return "open";
  if (state === "scheduled") return "upcoming";
  return "closed";
}

function OrganiserDashboard() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadRounds(olympiadId: string) {
    const { rounds: roundList } = await api.get<{ rounds: Round[] }>(
      `/olympiads/${olympiadId}/rounds`,
    );
    setRounds(roundList);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const current = await getCurrentOlympiad();
        const { rounds: roundList } = await api.get<{ rounds: Round[] }>(
          `/olympiads/${current.id}/rounds`,
        );
        if (!cancelled) {
          setOlympiad(current);
          setRounds(roundList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSetState(roundId: string, state: string) {
    if (!olympiad) return;
    setUpdatingId(roundId);
    setError(null);
    try {
      await api.patch(`/rounds/${roundId}/state`, { state });
      await loadRounds(olympiad.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update round");
    } finally {
      setUpdatingId(null);
    }
  }

  const submissionsTotal = rounds.reduce(
    (sum, round) => sum + round._count.submissions,
    0,
  );
  const openCount = rounds.filter((round) => round.state === "open").length;
  const schoolsCount = olympiad?._count?.school_registrations ?? 0;

  const stats = [
    {
      label: "Schools registered",
      value: String(schoolsCount),
      helper: "Across this olympiad",
      icon: Building2,
    },
    {
      label: "Submissions received",
      value: String(submissionsTotal),
      helper: "All rounds to date",
      icon: FileCheckCorner,
    },
    {
      label: "Rounds currently open",
      value: String(openCount),
      helper: "Accepting submissions",
      icon: Timer,
    },
  ];

  return (
    <AppShell
      activeRole="organiser"
      navItems={organiserNav}
      organisation="National Olympiad Office"
      portalLabel="Organiser console"
      userInitials="NO"
      userName="Admin user"
    >
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Organiser dashboard</h1>
            <p>
              {olympiad
                ? `Overview of ${olympiad.name} rounds and school participation.`
                : "Overview of all olympiad rounds and school participation."}
            </p>
          </div>
          <div className={styles.actions}>
            <Button
              icon={<FilePlusCorner aria-hidden="true" />}
              to="/organiser/rounds/new"
            >
              Create round
            </Button>
          </div>
        </header>

        {error && <Card className={styles.tableCard}>{error}</Card>}

        <section className={styles.statsGrid} aria-label="Dashboard summary">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card className={styles.statCard} key={stat.label}>
                <div className={styles.statTop}>
                  <p>{stat.label}</p>
                  <Icon aria-hidden="true" />
                </div>
                <p className={styles.statValue}>{loading ? "…" : stat.value}</p>
                <p className={styles.statHelper}>{stat.helper}</p>
              </Card>
            );
          })}
        </section>

        <Card
          className={styles.tableCard}
          padded={false}
          aria-labelledby="rounds-heading"
        >
          <div className={styles.tableHeader}>
            <h2 id="rounds-heading">Rounds</h2>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.roundsTable}>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Opens</th>
                  <th>Closes</th>
                  <th>Status</th>
                  <th className={styles.numeric}>Submissions</th>
                  <th className={styles.actionColumn}>Action</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rounds.length === 0 && (
                  <tr>
                    <td colSpan={6}>No rounds yet — create the first one.</td>
                  </tr>
                )}
                {rounds.map((round) => (
                  <tr key={round.id}>
                    <td className={styles.roundName}>{round.name}</td>
                    <td>{dateFormatter.format(new Date(round.opens_at))}</td>
                    <td>{dateFormatter.format(new Date(round.closes_at))}</td>
                    <td>
                      <StatusBadge status={toBadgeStatus(round.state)} />
                    </td>
                    <td className={styles.numeric}>
                      {round._count.submissions}
                    </td>
                    <td className={styles.actionColumn}>
                      {round.state === "scheduled" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === round.id}
                          onClick={() => handleSetState(round.id, "open")}
                        >
                          {updatingId === round.id ? "Opening…" : "Open round"}
                        </Button>
                      )}
                      {round.state === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === round.id}
                          onClick={() => handleSetState(round.id, "closed")}
                        >
                          {updatingId === round.id ? "Closing…" : "Close round"}
                        </Button>
                      )}
                      {(round.state === "closed" ||
                        round.state === "marking" ||
                        round.state === "results_released") && (
                        <Button size="sm" variant="outline" disabled>
                          Closed
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default OrganiserDashboard;