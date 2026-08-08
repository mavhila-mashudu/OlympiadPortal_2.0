import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Select } from "../../components/ui/Select";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { educatorNav, resultRows } from "../../lib/mockData";
import styles from "./Results.module.css";

function Results() {
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
        <PageHeader
          title="Results"
          description="Auto-marked scores for your entrants, available once a round has closed."
        />

        <div className={styles.filterRow}>
          <Select id="round-select" aria-label="Round">
            <option>Round 1 — Qualifier</option>
            <option>Round 2 — Semi-final</option>
          </Select>
          <p>Closed Jul 10, 2026 · School average 80%</p>
        </div>

        <TablePanel minWidth="44rem">
          <thead>
            <tr>
              <Th numeric>Rank</Th>
              <Th>Entrant</Th>
              <Th>Student no.</Th>
              <Th>Grade</Th>
              <Th numeric>Score</Th>
              <Th numeric>Percentage</Th>
            </tr>
          </thead>
          <tbody>
            {resultRows.map((result) => (
              <tr key={result.studentNumber}>
                <Td numeric>{result.rank}</Td>
                <Td strong muted={false}>
                  {result.name}
                </Td>
                <Td>{result.studentNumber}</Td>
                <Td>{result.grade}</Td>
                <Td numeric muted={false}>
                  {result.score}
                </Td>
                <Td numeric strong muted={false}>
                  {result.percentage}
                </Td>
              </tr>
            ))}
          </tbody>
        </TablePanel>
      </div>
    </AppShell>
  );
}

export default Results;
