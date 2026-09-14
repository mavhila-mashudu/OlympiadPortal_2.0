import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { educatorNav } from "../../lib/mockData";
import {
  useEducatorRounds,
  formatDate,
  type EducatorRound,
} from "../../lib/educatorApi";
import styles from "./Dashboard.module.css";

function getCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

function getRoundNote(round: EducatorRound): string {
  switch (round.status) {
    case "open":
      return round.submission_count > 0
        ? "Submission received"
        : "Closes in";
    case "upcoming":
      return "Opens in";
    default:
      return round.submission_count > 0
        ? "Submission received"
        : "Closed";
  }
}

function getSecondaryAction(round: EducatorRound): string | null {
  if (round.status === "closed") return "View results";
  if (round.status === "upcoming") return "Register entrants";
  return null;
}

function EducatorDashboard() {
  const { data, isLoading, error } = useEducatorRounds();
  const rounds = data?.rounds ?? [];
  const schoolName = data?.school?.name ?? "Your school";

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
      </div>
    </AppShell>
  );
}

export default EducatorDashboard;
