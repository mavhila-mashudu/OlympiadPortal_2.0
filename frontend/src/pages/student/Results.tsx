import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { api, downloadCertificate } from "../../lib/api";
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
  // The olympiad's IANA timezone; times are shown in it
  timezone: string;
  closes_at: string;
  resultStatus: "released" | "pending";
  score: string;
  percentage: string;
  rank: number | null;
  hasCertificate: boolean;
  remarkStatus?: "pending" | "reviewed" | null;
};

function StudentResults() {
  const [profile, setProfile] = useState<StudentProfile>({
    userName: "Student",
    userInitials: "ST",
    organisation: "Loading...",
  });
  const [results, setResults] = useState<StudentResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState<Record<string, { status: string; decision: string | null } | null>>({});
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
          const entries = await Promise.all((resData.results || []).filter((r) => r.resultStatus === "released")
            .map(async (r) => [r.id, (await api.get<{ remark: { status: string; decision: string | null } | null }>(`/rounds/${r.id}/my-remark`)).remark] as const));
          if (!cancelled) setRemarks(Object.fromEntries(entries));
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

  async function requestRemark(roundId: string) {
    const reason = window.prompt("Why would you like this result remarked? Please give at least 10 characters.");
    if (reason === null) return;
    try {
      const data = await api.post<{ remark: { status: string; decision: string | null } }>(`/rounds/${roundId}/remark`, { reason });
      setRemarks((current) => ({ ...current, [roundId]: data.remark }));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not request remark"); }
  }

  return (
    <AppShell
      activeRole="student"
      navItems={studentNav}
      organisation={profile.organisation}
      portalLabel="Student portal"
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
              <Th>Remark</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
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
                  colSpan={7}
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
                  <Td>{formatDateOnly(row.closes_at, row.timezone)}</Td>
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
                        onClick={() => downloadCertificate(row.id).catch((err) => setError(err.message))}
                      >
                        Download
                      </Button>
                    ) : (
                      <span className={styles.dash}>&mdash;</span>
                    )}
                  </Td>
                  <Td>{row.resultStatus === "released" ? (remarks[row.id] ? `${remarks[row.id]?.status}${remarks[row.id]?.decision ? `: ${remarks[row.id]?.decision}` : ""}` : <Button size="sm" variant="outline" onClick={() => requestRemark(row.id)}>Request remark</Button>) : "—"}</Td>
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
