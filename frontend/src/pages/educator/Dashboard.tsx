import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { educatorNav, rounds } from "../../lib/mockData";
import styles from "./Dashboard.module.css";

const timers: Record<string, string> = {
  "r-2026-03": "21h 49m 22s",
  "r-2026-04": "2d 23h 49m",
};

function EducatorDashboard() {
  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation="Rosebank High School"
      portalLabel="Educator portal"
      userInitials="TM"
      userName="Thandi Mokoena"
    >
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Your rounds</h1>
            <p>Olympiad rounds relevant to Rosebank High School.</p>
          </div>
        </header>

        <ul className={styles.roundGrid}>
          {rounds.map((round) => (
            <li key={round.id}>
              <Card className={styles.roundCard}>
                <div className={styles.roundTop}>
                  <h2>{round.title}</h2>
                  <StatusBadge status={round.status} />
                </div>

                <dl className={styles.dateGrid}>
                  <div>
                    <dt>Opens</dt>
                    <dd>{round.opens}</dd>
                  </div>
                  <div>
                    <dt>Closes</dt>
                    <dd>{round.closes}</dd>
                  </div>
                </dl>

                <div className={styles.roundNote}>
                  {round.status === "open" || round.status === "upcoming" ? (
                    <span>
                      {round.educatorNote}{" "}
                      <strong className={styles.timer}>
                        {timers[round.id]}
                      </strong>
                    </span>
                  ) : (
                    <span>{round.educatorNote}</span>
                  )}
                </div>

                <div className={styles.cardActions}>
                  <Button
                    size="sm"
                    to={`/educator/rounds/${round.id}`}
                    variant={round.primaryAction ? "primary" : "outline"}
                  >
                    Open round
                  </Button>
                  {round.secondaryAction ? (
                    <Button
                      size="sm"
                      to={
                        round.secondaryAction === "View results"
                          ? "/educator/results"
                          : "/educator/entrants"
                      }
                      variant="outline"
                    >
                      {round.secondaryAction}
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

export default EducatorDashboard;
