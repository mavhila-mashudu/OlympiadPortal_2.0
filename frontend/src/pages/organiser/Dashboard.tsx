import { FilePlusCorner, Timer } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { organiserNav, rounds, stats } from "../../lib/mockData";
import styles from "./Dashboard.module.css";

function OrganiserDashboard() {
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
            <p>Overview of all olympiad rounds and school participation.</p>
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

        <section className={styles.statsGrid} aria-label="Dashboard summary">
          {stats.map((stat) => {
            const Icon =
              stat.label === "Rounds currently open" ? Timer : stat.icon;

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
                  <th className={styles.numeric}>Schools</th>
                  <th className={styles.numeric}>Submissions</th>
                  <th className={styles.actionColumn}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((round) => (
                  <tr key={round.id}>
                    <td className={styles.roundName}>{round.title}</td>
                    <td>{round.opens}</td>
                    <td>{round.closes}</td>
                    <td>
                      <StatusBadge status={round.status} />
                    </td>
                    <td className={styles.numeric}>{round.schools}</td>
                    <td className={styles.numeric}>{round.submissions}</td>
                    <td className={styles.actionColumn}>
                      <Button
                        size="sm"
                        to={`/organiser/rounds/${round.id}`}
                        variant="outline"
                      >
                        View
                      </Button>
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
