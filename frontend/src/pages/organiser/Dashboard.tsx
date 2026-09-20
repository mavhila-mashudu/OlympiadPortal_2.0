import {
  Building2,
  ClipboardCheck,
  FileCheckCorner,
  FilePlusCorner,
  ShieldCheck,
  Timer,
  Trophy,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import { getCurrentOlympiad, type Olympiad } from "../../lib/olympiad";
import { toBadgeStatus, type RoundState } from "./roundStatus";
import styles from "./Dashboard.module.css";

type Round = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  notes?: string;
  qualifying_threshold?: number | null;
  state: RoundState;
  exam_status?: "draft" | "ready" | "live";
  _count: { submissions?: number; entrant_registrations?: number };
};

type EditRoundForm = {
  name: string;
  opensAt: string;
  closesAt: string;
  qualifyingThreshold: string;
  notes: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Formats an ISO datetime string to "YYYY-MM-DDTHH:mm" for datetime-local inputs (UTC).
function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

// Converts a datetime-local value to a UTC ISO string, preserving the date.
function toUTCISO(localValue: string): string {
  const [date, time] = localValue.split("T");
  return `${date}T${time || "00:00"}:00.000Z`;
}

function OrganiserDashboard() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditRoundForm>({
    name: "",
    opensAt: "",
    closesAt: "",
    qualifyingThreshold: "",
    notes: "",
  });
  const [editWarnings, setEditWarnings] = useState<string[]>([]);
  const [deletingRoundId, setDeletingRoundId] = useState<string | null>(null);

  async function loadRounds(olympiadId: string) {
    const { rounds: roundList } = await api.get<{ rounds: Round[] }>(
      `/olympiads/${olympiadId}/rounds`,
    );
    setRounds(roundList || []);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const current = await getCurrentOlympiad();
        if (!cancelled) {
          setOlympiad(current);
        }

        if (current?.id) {
          const { rounds: roundList } = await api.get<{ rounds: Round[] }>(
            `/olympiads/${current.id}/rounds`,
          );
          if (!cancelled) {
            setRounds(roundList || []);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard",
          );
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

  async function handleUpdateRound(roundId: string) {
    if (!editForm.name.trim()) return;
    setError(null);
    setEditWarnings([]);
    try {
      const { warnings } = await api.patch<{
        round: Round;
        warnings?: string[];
      }>(`/rounds/${roundId}`, {
        name: editForm.name.trim(),
        opens_at: toUTCISO(editForm.opensAt),
        closes_at: toUTCISO(editForm.closesAt),
        qualifying_threshold: editForm.qualifyingThreshold
          ? Number(editForm.qualifyingThreshold)
          : null,
        notes: editForm.notes || undefined,
      });
      if (warnings && warnings.length > 0) {
        setEditWarnings(warnings);
      } else {
        setEditingRound(null);
      }
      if (olympiad) await loadRounds(olympiad.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update round");
    }
  }

  function startEditingRound(round: Round) {
    setEditingRound(round.id);
    setEditWarnings([]);
    setEditForm({
      name: round.name,
      opensAt: toDatetimeLocal(round.opens_at),
      closesAt: toDatetimeLocal(round.closes_at),
      qualifyingThreshold: round.qualifying_threshold != null ? String(round.qualifying_threshold) : "",
      notes: round.notes ?? "",
    });
  }

  async function handleDeleteRound(roundId: string) {
    setError(null);
    try {
      await api.delete(`/rounds/${roundId}`);
      setDeletingRoundId(null);
      if (olympiad) await loadRounds(olympiad.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete round");
    }
  }

  const submissionsTotal = rounds.reduce(
    (sum, round) => sum + (round._count?.submissions ?? 0),
    0,
  );
  const openCount = rounds.filter((round) => round.state === "open").length;
  const awaitingReview = rounds.filter(
    (round) => round.exam_status === "ready",
  ).length;
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
    {
      label: "Exams awaiting review",
      value: String(awaitingReview),
      helper: "Digitized by educators — verify to go live",
      icon: ShieldCheck,
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

        {!loading && !olympiad && (
          <Card className={styles.tableCard} style={{ textAlign: "center", padding: "3rem 2rem" }}>
            <Trophy aria-hidden="true" size={48} style={{ margin: "0 auto 1rem", color: "#9ca3af" }} />
            <h2 style={{ marginBottom: "0.5rem" }}>No olympiads yet</h2>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Create your first olympiad to start adding rounds and inviting schools.
            </p>
            <Button icon={<Trophy aria-hidden="true" />} to="/organiser/olympiads">
              Create olympiad
            </Button>
          </Card>
        )}

        {olympiad && (
        <>

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
            <h2 id="rounds-heading">
              {olympiad ? `${olympiad.name} — Rounds` : "Rounds"}
            </h2>
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
                    <td colSpan={6}>
                      {olympiad
                        ? `No rounds created yet for ${olympiad.name}.`
                        : "No rounds yet — create the first one."}
                    </td>
                  </tr>
                )}
                {rounds.map((round) => (
                  <Fragment key={round.id}>
                    <tr>
                      <td className={styles.roundName}>
                        {round.name}
                        {round.exam_status === "ready" && (
                          <span
                            className={styles.examReadyTag}
                            title="The educator has finished digitizing this exam — verify it before it can go live"
                          >
                            Exam ready for review
                          </span>
                        )}
                      </td>
                      <td>{dateFormatter.format(new Date(round.opens_at))}</td>
                      <td>{dateFormatter.format(new Date(round.closes_at))}</td>
                      <td>
                        <StatusBadge status={toBadgeStatus(round.state)} />
                      </td>
                      <td className={styles.numeric}>
                        {round._count?.submissions ?? 0}
                      </td>
                      <td className={styles.actionColumn}>
                        <Button
                          size="sm"
                          variant="outline"
                          to={`/organiser/rounds/${round.id}/review`}
                          icon={<ShieldCheck aria-hidden="true" />}
                        >
                          Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          to={`/organiser/rounds/${round.id}/marking`}
                          icon={<ClipboardCheck aria-hidden="true" />}
                        >
                          Marking
                        </Button>
                        {round.state === "scheduled" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditingRound(round)}
                            >
                              {editingRound === round.id ? "Editing…" : "Edit"}
                            </Button>
                            {deletingRoundId === round.id ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleDeleteRound(round.id)}
                                  style={{ color: "#fff", background: "#dc2626" }}
                                >
                                  Yes, delete
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeletingRoundId(null)}
                                >
                                  No
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeletingRoundId(round.id)}
                                style={{ color: "#dc2626" }}
                              >
                                Delete
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === round.id}
                              onClick={() => handleSetState(round.id, "open")}
                            >
                              {updatingId === round.id
                                ? "Opening..."
                                : "Open round"}
                            </Button>
                          </>
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
                    {editingRound === round.id && (
                      <tr key={`${round.id}-edit`}>
                        <td colSpan={6} className={styles.editPanel}>
                          <div className={styles.editPanelInner}>
                            <p className={styles.editPanelTitle}>Edit round</p>

                            <div className={styles.editGrid}>
                              <label className={styles.editField}>
                                <span>Round name</span>
                                <input
                                  type="text"
                                  value={editForm.name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                  className={styles.editInput}
                                />
                              </label>

                              <label className={styles.editField}>
                                <span>Opens at</span>
                                <input
                                  type="datetime-local"
                                  value={editForm.opensAt}
                                  onChange={(e) => setEditForm((f) => ({ ...f, opensAt: e.target.value }))}
                                  className={styles.editInput}
                                />
                              </label>

                              <label className={styles.editField}>
                                <span>Closes at</span>
                                <input
                                  type="datetime-local"
                                  value={editForm.closesAt}
                                  onChange={(e) => setEditForm((f) => ({ ...f, closesAt: e.target.value }))}
                                  className={styles.editInput}
                                />
                              </label>

                              <label className={styles.editField}>
                                <span>Qualifying threshold</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editForm.qualifyingThreshold}
                                  onChange={(e) => setEditForm((f) => ({ ...f, qualifyingThreshold: e.target.value }))}
                                  placeholder="e.g. 60"
                                  className={styles.editInput}
                                />
                              </label>
                            </div>

                            <label className={styles.editField}>
                              <span>Notes for educators</span>
                              <textarea
                                value={editForm.notes}
                                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                                rows={2}
                                placeholder="Optional instructions shown to educators"
                                className={styles.editInput}
                              />
                            </label>

                            {editWarnings.length > 0 && (
                              <div className={styles.editWarnings}>
                                <p>Public holiday clashes:</p>
                                <ul>
                                  {editWarnings.map((w) => (
                                    <li key={w}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className={styles.editActions}>
                              {editWarnings.length > 0 ? (
                                <Button
                                  size="sm"
                                  onClick={() => { setEditingRound(null); setEditWarnings([]); }}
                                >
                                  Done
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateRound(round.id)}
                                  >
                                    Save changes
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingRound(null)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </>
        )}
      </div>
    </AppShell>
  );
}

export default OrganiserDashboard;
