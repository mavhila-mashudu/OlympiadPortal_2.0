import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TablePanel, Th, Td } from "../../components/ui/Table";
import { educatorNav } from "../../lib/mockData";
import {
  useEducatorRounds,
  useEducatorOverview,
  formatDate,
} from "../../lib/educatorApi";
import type {
  EducatorOverview,
  EducatorOverviewEntrantRound,
  EducatorOverviewRound,
} from "../../lib/educatorApi";
import {
  getCountdown,
  getRoundNote,
  getSecondaryAction,
  getGlanceStats,
  getOlympiadEntrants,
} from "./dashboardHelpers";
import styles from "./Dashboard.module.css";

function EducatorDashboard() {
  const { data, isLoading, error } = useEducatorRounds();
  const overviewQuery = useEducatorOverview();
  const rounds = data?.rounds ?? [];
  const schoolName = data?.school?.name ?? "Your school";
  const overview = overviewQuery.data;

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation={schoolName}
      portalLabel="Educator portal"
      userInitials=""
      userName=""
    >
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Your rounds</h1>
            <p>Olympiad rounds relevant to {schoolName}.</p>
          </div>
        </header>

        {isLoading && (
          <p className={styles.roundNote}>Loading rounds…</p>
        )}

        {error && (
          <p className={styles.roundNote}>
            Failed to load rounds: {(error as Error).message}
          </p>
        )}

        {!isLoading && rounds.length === 0 && (
          <p className={styles.roundNote}>
            No rounds found. Your school may not be registered for any olympiads yet.
          </p>
        )}

        <ul className={styles.roundGrid}>
          {rounds.map((round) => {
            const secondaryAction = getSecondaryAction(round);
            const isOpenOrUpcoming =
              round.status === "open" || round.status === "upcoming";

            return (
              <li key={round.id}>
                <Card className={styles.roundCard}>
                  <div className={styles.roundTop}>
                    <h2>{round.name}</h2>
                    <StatusBadge status={round.status} />
                  </div>

                  <dl className={styles.dateGrid}>
                    <div>
                      <dt>Opens</dt>
                      <dd>{formatDate(round.opens_at)}</dd>
                    </div>
                    <div>
                      <dt>Closes</dt>
                      <dd>{formatDate(round.closes_at)}</dd>
                    </div>
                  </dl>

                  <div className={styles.roundNote}>
                    {isOpenOrUpcoming ? (
                      <span>
                        {getRoundNote(round)}{" "}
                        <strong className={styles.timer}>
                          {getCountdown(
                            round.status === "open"
                              ? round.closes_at
                              : round.opens_at,
                          )}
                        </strong>
                      </span>
                    ) : (
                      <span>{getRoundNote(round)}</span>
                    )}
                  </div>

                  <div className={styles.cardActions}>
                    <Button
                      size="sm"
                      to={`/educator/rounds/${round.id}`}
                      variant={
                        round.status === "open" ? "primary" : "outline"
                      }
                    >
                      Open round
                    </Button>
                    {secondaryAction ? (
                      <Button
                        size="sm"
                        to={
                          secondaryAction === "View results"
                            ? "/educator/results"
                            : "/educator/entrants"
                        }
                        variant="outline"
                      >
                        {secondaryAction}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>

        {overviewQuery.error && (
          <p className={styles.roundNote}>
            Failed to load school overview:{" "}
            {(overviewQuery.error as Error).message}
          </p>
        )}

        {overview && overview.olympiads.length > 0 && (
          <GlanceSection overview={overview} />
        )}
      </div>
    </AppShell>
  );
}

// One cell of the per-olympiad entrant × round matrix. Scores stay
// hidden until the round's results are released.
function RoundCell({
  entry,
  round,
}: {
  entry: EducatorOverviewEntrantRound | undefined;
  round: EducatorOverviewRound;
}) {
  if (!entry) {
    return <Td>—</Td>;
  }
  if (!round.results_available) {
    return <Td>{entry.submitted ? "Marking…" : "No entry"}</Td>;
  }
  if (entry.score == null) {
    return <Td>No result</Td>;
  }
  return (
    <Td numeric strong muted={false}>
      {entry.score}
      {entry.rank != null ? (
        <span className={styles.rankHint}> #{entry.rank}</span>
      ) : null}
      {entry.qualified ? (
        <span className={styles.qualifiedHint} title="Qualified">
          ✓
        </span>
      ) : null}
    </Td>
  );
}

function GlanceSection({ overview }: { overview: EducatorOverview }) {
  const stats = getGlanceStats(overview);
  const olympiads = overview.olympiads.filter(
    (olympiad) => olympiad.rounds.length > 0,
  );

  return (
    <section className={styles.glance} aria-labelledby="glance-heading">
      <header className={styles.glanceHeader}>
        <div>
          <h2 id="glance-heading">Your school at a glance</h2>
          <p>Every entrant and their results across your olympiads.</p>
        </div>
      </header>

      <div className={styles.statGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{stats.entrantCount}</span>
          <span className={styles.statLabel}>Entrants registered</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{stats.openRounds}</span>
          <span className={styles.statLabel}>Rounds open now</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{stats.resultsOut}</span>
          <span className={styles.statLabel}>Rounds with results out</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statValue}>{stats.qualifiers}</span>
          <span className={styles.statLabel}>Qualifiers so far</span>
        </Card>
      </div>

      {olympiads.map((olympiad) => {
        const olympiadEntrants = getOlympiadEntrants(overview, olympiad.id);

        return (
          <TablePanel
            key={olympiad.id}
            title={olympiad.name}
            minWidth={`${10 + olympiad.rounds.length * 8}rem`}
          >
            <thead>
              <tr>
                <Th>Entrant</Th>
                <Th>Grade</Th>
                {olympiad.rounds.map((round) => (
                  <Th key={round.id} numeric>
                    {round.name}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {olympiadEntrants.length === 0 ? (
                <tr>
                  <td
                    className={styles.matrixEmpty}
                    colSpan={olympiad.rounds.length + 2}
                  >
                    No entrants registered yet.
                  </td>
                </tr>
              ) : (
                olympiadEntrants.map((entrant) => (
                  <tr key={entrant.id}>
                    <Td strong muted={false}>
                      {entrant.full_name}
                    </Td>
                    <Td>{entrant.grade ?? "—"}</Td>
                    {olympiad.rounds.map((round) => (
                      <RoundCell
                        key={round.id}
                        round={round}
                        entry={entrant.rounds.find(
                          (r) => r.round_id === round.id,
                        )}
                      />
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <Td strong muted={false}>
                  School average
                </Td>
                <Td>—</Td>
                {olympiad.rounds.map((round) => (
                  <Td key={round.id} numeric>
                    {round.school_average != null
                      ? round.school_average.toFixed(1)
                      : "—"}
                  </Td>
                ))}
              </tr>
            </tfoot>
          </TablePanel>
        );
      })}
    </section>
  );
}

export default EducatorDashboard;
