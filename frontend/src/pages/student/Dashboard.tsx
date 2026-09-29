import { useCallback, useEffect, useState } from "react";
import { Award, ClipboardList, Download, FileCheckCorner, Pencil } from "lucide-react";
import { InviteInbox } from "../../components/invites/InviteInbox";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorAlert, LoadingIndicator } from "../../components/ui/Feedback";
import { friendlyErrorMessage } from "../../lib/feedback";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import { studentNav } from "../../lib/mockData";
import {
  formatCountdown,
  formatDateTime,
  getStudentProfile,
  type StudentProfile,
} from "../../lib/student";
import styles from "./Dashboard.module.css";

type RoundItem = {
  id: string;
  title: string;
  olympiadTitle: string;
  // The olympiad's IANA timezone; times are shown in it
  timezone: string;
  opens_at: string;
  closes_at: string;
  status: "upcoming" | "open" | "closed";
  paperFile: string | null;
  paperTitle: string | null;
  hasSubmitted: boolean;
  result: {
    score: string;
    percentage: string;
    rankInSchool: number | null;
    hasCertificate: boolean;
  } | null;
};

type DashboardStats = {
  roundsEntered: number;
  resultsAvailable: number;
  certificatesEarned: number;
};

function StudentDashboard() {
  const [profile, setProfile] = useState<StudentProfile>({
    userName: "Student",
    userInitials: "ST",
    organisation: "Loading...",
  });
  const [rounds, setRounds] = useState<RoundItem[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    roundsEntered: 0,
    resultsAvailable: 0,
    certificatesEarned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prof, dashData] = await Promise.all([
        getStudentProfile(),
        api.get<{ rounds: RoundItem[]; stats: DashboardStats }>(
          "/rounds/registered",
        ),
      ]);

      setProfile(prof);
      setRounds(dashData.rounds || []);
      setStats(
        dashData.stats || {
          roundsEntered: 0,
          resultsAvailable: 0,
          certificatesEarned: 0,
        },
      );
    } catch (err) {
      setError(friendlyErrorMessage(err, "We couldn’t load your dashboard. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statCards = [
    {
      label: "Rounds entered",
      value: loading ? "…" : String(stats.roundsEntered),
      helper: "This olympiad year",
      icon: ClipboardList,
    },
    {
      label: "Results available",
      value: loading ? "…" : String(stats.resultsAvailable),
      helper: "Released to you",
      icon: FileCheckCorner,
    },
    {
      label: "Certificates earned",
      value: loading ? "…" : String(stats.certificatesEarned),
      helper: "Qualifying score achievements",
      icon: Award,
    },
  ];

  return (
    <AppShell
      activeRole="student"
      navItems={studentNav}
      organisation={profile.organisation}
      portalLabel="Student portal"


    >
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Your olympiad</h1>
            <p>
              {profile.userName} · {profile.organisation}
            </p>
          </div>
        </header>

        <InviteInbox onAccepted={load} />

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} onRetry={load} />}

        <section className={styles.statsGrid}>
          {statCards.map((stat) => {
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

        {loading ? (
          <LoadingIndicator label="Loading your rounds" />
        ) : rounds.length === 0 ? (
          <Card className={styles.statCard}>
            <p>You have not been registered for any rounds yet.</p>
          </Card>
        ) : (
          <ul className={styles.roundGrid}>
            {rounds.map((round) => {
              const countdown =
                round.status === "upcoming"
                  ? formatCountdown(round.opens_at)
                  : null;

              return (
                <li key={round.id}>
                  <Card className={styles.roundCard}>
                    <div className={styles.roundTop}>
                      <div>
                        <h2>{round.title}</h2>
                        {round.olympiadTitle && (
                          <small>
                            {round.olympiadTitle}
                          </small>
                        )}
                      </div>
                      <StatusBadge status={round.status} />
                    </div>

                    <dl className={styles.dateGrid}>
                      <div>
                        <dt>Opens</dt>
                        <dd>{formatDateTime(round.opens_at, round.timezone)}</dd>
                      </div>
                      <div>
                        <dt>Closes</dt>
                        <dd>{formatDateTime(round.closes_at, round.timezone)}</dd>
                      </div>
                    </dl>

                    <div className={styles.roundNote}>
                      {round.status === "upcoming" ? (
                        <span>
                          Opens in{" "}
                          <strong className={styles.timer}>{countdown}</strong>
                        </span>
                      ) : round.status === "open" ? (
                        <span>
                          {round.hasSubmitted
                            ? "Exam submitted · Awaiting marking"
                            : "Round is open for exam sitting"}
                        </span>
                      ) : round.result ? (
                        <span>
                          Your score: {round.result.score}
                          {round.result.hasCertificate
                            ? " · Certificate earned"
                            : ""}
                        </span>
                      ) : (
                        <span>Results not released yet</span>
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
                      {round.status === "open" && !round.hasSubmitted ? (
                        <Button
                          icon={<Pencil aria-hidden="true" />}
                          size="sm"
                          to={`/student/rounds/${round.id}/exam`}
                          variant="primary"
                        >
                          Sit exam online
                        </Button>
                      ) : null}
                      {round.status === "closed" ? (
                        <Button
                          size="sm"
                          to="/student/results"
                          variant="primary"
                        >
                          View results
                        </Button>
                      ) : null}
                      {round.status === "upcoming" ? (
                        <Button
                          icon={<Download aria-hidden="true" />}
                          size="sm"
                          variant="primary"
                          disabled
                        >
                          Paper not yet available
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

export default StudentDashboard;
