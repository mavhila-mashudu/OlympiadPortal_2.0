import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { studentNav, studentResults } from "../../lib/mockData";
import styles from "./Results.module.css";

function StudentResults() {
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
        <PageHeader
          title="Results & certificates"
          description="Your scores for rounds that have closed, and any certificates you have earned."
        />

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
            {studentResults.map((row) => (
              <tr key={row.id}>
                <Td strong muted={false}>
                  <Link
                    to={`/student/rounds/${row.id}`}
                    className={styles.roundLink}
                  >
                    {row.round}
                  </Link>
                </Td>
                <Td>{row.closed}</Td>
                <Td muted={false}>
                  <span
                    className={`${styles.badge} ${
                      row.resultStatus === "released"
                        ? styles.badgePrimary
                        : styles.badgeUpcoming
                    }`}
                  >
                    <span className={styles.badgeDot} aria-hidden="true" />
                    {row.resultStatus === "released"
                      ? "Auto-marked"
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
                    >
                      Download
                    </Button>
                  ) : (
                    <span className={styles.dash}>&mdash;</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TablePanel>
      </div>
    </AppShell>
  );
}

export default StudentResults;
