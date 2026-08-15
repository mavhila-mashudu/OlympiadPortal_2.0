import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { studentNav, studentRounds, studentStats } from "../../lib/mockData";
import styles from "./Dashboard.module.css";

function StudentDashboard() {
  return (
    <AppShell
      activeRole="student"
      navItems={studentNav}
      organisation="Rosebank High School"
      portalLabel="Student portal"
      userInitials="LN"
      userName="Lerato Nkosi"
    >
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Your olympiad</h1>
            <p>Lerato Nkosi · Rosebank High School</p>
          </div>
        </header>

        <section className={styles.statsGrid} aria-label="Dashboard summary">
          {studentStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card className={styles.statCard} key={stat.label}>
                <div className={styles.statTop}>
                  <p>{stat.label}</p>
                  <Icon aria-hidden="true" />
                </div>
                <p className={styles.statValue}>{stat.value}</p>
                <p className={styles.statHelper}>{stat.helper}</p>
              </Card>
            );
          })}
        </section>

        <ul className={styles.roundGrid}>
          {studentRounds.map((round) => (
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
                  {round.countdown ? (
                    <span>
                      {round.note}{" "}
                      <strong className={styles.timer}>
                        {round.countdown}
                      </strong>
                    </span>
                  ) : (
                    <span>{round.note}</span>
                  )}
                </div>

                <div className={styles.cardActions}>
                  <Button
                    size="sm"
                    to={`/student/rounds/${round.id}`}
                    variant="outline"
                  >
                    Round detail
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

export default StudentDashboard;
