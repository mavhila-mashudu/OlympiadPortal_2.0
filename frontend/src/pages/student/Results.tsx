import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { api } from "../../lib/api";
import { studentNav } from "../../lib/mockData";
import {
  formatDateOnly,
  getStudentProfile,
  type StudentProfile,
} from "../../lib/student";
import styles from "./Results.module.css";

type StudentResultItem = {
  id: string;
  round: string;
  olympiadTitle: string;
  closes_at: string;
  resultStatus: "released" | "pending";
  score: string;
  percentage: string;
  rank: number | null;
  hasCertificate: boolean;
};

function StudentResults() {
  const [profile, setProfile] = useState<StudentProfile>({
    userName: "Student",
    userInitials: "ST",
    organisation: "Loading...",
  });
  const [results, setResults] = useState<StudentResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [prof, resData] = await Promise.all([
          getStudentProfile(),
          api.get<{ results: StudentResultItem[] }>("/rounds/my-results"),
        ]);

        if (!cancelled) {
          setProfile(prof);
          setResults(resData.results || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load results",
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

  return (
    <AppShell
      activeRole="student"
      navItems={studentNav}
      organisation={profile.organisation}
      portalLabel="Student portal"
      userInitials={profile.userInitials}
      userName={profile.userName}
    >
      <div className={styles.stack}>
        <PageHeader
          title="Results & certificates"
          description="Your scores for rounds that have closed, and any certificates you have earned."
        />

        {error && (
          <Card>
            <p>{error}</p>
          </Card>
        )}

        <TablePanel minWidth="48rem">
          <thead>
            <tr>
              <Th>Round</Th>
              <Th>Closed</Th>
              <Th>Status</Th>
              <Th numeric>Score</Th>
              <Th numeric>Percentage</Th>
              <Th numeric>Certificate</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                  }}
                >
                  Loading results…
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                  }}
                >
                  No closed rounds or released results found.
                </td>
              </tr>
            ) : (
              results.map((row) => (
                <tr key={row.id}>
                  <Td strong muted={false}>
                    <Link
                      to={`/student/rounds/${row.id}`}
                      className={styles.roundLink}
                    >
                      {row.round}
                    </Link>
                  </Td>
                  <Td>{formatDateOnly(row.closes_at)}</Td>
                  <Td muted={false}>
                    <span
                      className={`${styles.badge} ${row.resultStatus === "released"
                        ? styles.badgePrimary
                        : styles.badgeUpcoming
                        }`}
                    >
                      <span className={styles.badgeDot} aria-hidden="true" />
                      {row.resultStatus === "released"
                        ? "Marked"
                        : "Pending"}
                    </span>
                  </Td>
                  <Td numeric muted={false}>
                    {row.score}
                  </Td>
                  <Td numeric strong muted={false}>
                    {row.percentage}
                  </Td>
                  <Td numeric muted={false}>
                    {row.hasCertificate ? (
                      <Button
                        icon={<Download aria-hidden="true" />}
                        size="sm"
                        variant="outline"
                        disabled
                      >
                        Download
                      </Button>
                    ) : (
                      <span className={styles.dash}>&mdash;</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TablePanel>
      </div>
    </AppShell>
  );
}

export default StudentResults;
