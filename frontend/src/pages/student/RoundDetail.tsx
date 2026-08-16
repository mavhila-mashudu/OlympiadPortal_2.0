import { Award, Download, FileText } from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { studentNav, studentRounds } from "../../lib/mockData";
import styles from "./RoundDetail.module.css";

function StudentRoundDetail() {
  const { id } = useParams<{ id: string }>();
  const round = studentRounds.find((r) => r.id === id);

  if (!round) {
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
          <p className={styles.notFound}>Round not found.</p>
          <div>
            <Button to="/student" variant="outline">
              Back to dashboard
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const paperAvailable = round.status === "open";
  const showResult = round.status === "closed";

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
            <h1>{round.title}</h1>
            <p>Rosebank High School · Closes {round.closes}</p>
          </div>
          <div className={styles.pageActions}>
            <Button to="/student" variant="outline">
              Back to rounds
            </Button>
          </div>
        </header>

        <div className={styles.statusRow}>
          <StatusBadge status={round.status} />
        </div>

        <Card
          className={styles.sectionCard}
          padded={false}
          aria-labelledby="paper-heading"
        >
          <div className={styles.sectionHeader}>
            <h2 id="paper-heading">Question paper</h2>
          </div>
          <div className={styles.paperBody}>
            <span className={styles.paperFile}>
              <FileText aria-hidden="true" />
              <span className={styles.paperFileName}>
                <span>{round.paperFile}</span>
                <small>{round.paperNote}</small>
              </span>
            </span>
            <Button
              icon={<Download aria-hidden="true" />}
              variant="primary"
              disabled={!paperAvailable}
            >
              Download paper
            </Button>
          </div>
        </Card>

        {showResult ? (
          <Card
            className={styles.sectionCard}
            padded={false}
            aria-labelledby="result-heading"
          >
            <div className={styles.sectionHeader}>
              <h2 id="result-heading">Your result</h2>
            </div>
            <div className={styles.resultBody}>
              {round.result ? (
                <>
                  <dl className={styles.resultGrid}>
                    <div>
                      <dt>Score</dt>
                      <dd>{round.result.score}</dd>
                    </div>
                    <div>
                      <dt>Percentage</dt>
                      <dd>{round.result.percentage}</dd>
                    </div>
                    <div>
                      <dt>Rank in school</dt>
                      <dd>{round.result.rankInSchool}</dd>
                    </div>
                  </dl>
                  {round.result.hasCertificate ? (
                    <div className={styles.certificateBanner}>
                      <span>
                        <Award aria-hidden="true" />
                        You earned a certificate for this round.
                      </span>
                      <Button
                        icon={<Download aria-hidden="true" />}
                        size="sm"
                        variant="outline"
                      >
                        Download certificate
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.noResult}>Results not released yet.</p>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

export default StudentRoundDetail;
