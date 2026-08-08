import { Download, FileText } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { archiveEntries, organiserNav } from "../../lib/mockData";
import styles from "./Archive.module.css";

function Archive() {
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
        <PageHeader
          title="Paper archive"
          description="Question papers and memos from rounds that have closed."
        />

        <TablePanel minWidth="48rem">
          <thead>
            <tr>
              <Th>Round</Th>
              <Th>Closed</Th>
              <Th>Paper</Th>
              <Th>Memo</Th>
              <Th numeric>Download</Th>
            </tr>
          </thead>
          <tbody>
            {archiveEntries.map((entry) => (
              <tr key={entry.id}>
                <Td strong muted={false}>
                  {entry.round}
                </Td>
                <Td>{entry.closed}</Td>
                <Td>
                  <span className={styles.fileName}>
                    <FileText aria-hidden="true" />
                    {entry.paper}
                  </span>
                </Td>
                <Td>{entry.memo}</Td>
                <Td numeric>
                  <span className={styles.downloads}>
                    <Button
                      aria-label={`Download paper for ${entry.round}`}
                      icon={<Download aria-hidden="true" />}
                      size="sm"
                      variant="outline"
                    >
                      Paper
                    </Button>
                    <Button
                      aria-label={`Download memo for ${entry.round}`}
                      icon={<Download aria-hidden="true" />}
                      size="sm"
                      variant="outline"
                    >
                      Memo
                    </Button>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablePanel>
      </div>
    </AppShell>
  );
}

export default Archive;
