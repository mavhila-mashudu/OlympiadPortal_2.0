import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import { getCurrentOlympiad } from "../../lib/olympiad";
import styles from "./Archive.module.css";

type Paper = {
  id: string;
  file_url: string | null;
  memo_file_url: string | null;
};

type ArchivedRound = {
  id: string;
  name: string;
  closes_at: string;
  papers: Paper[];
};

const dateFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" });

function Archive() {
  const [rounds, setRounds] = useState<ArchivedRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const olympiad = await getCurrentOlympiad();
        const { rounds: list } = await api.get<{ rounds: ArchivedRound[] }>(
          `/olympiads/${olympiad.id}/archive`,
        );
        if (!cancelled) setRounds(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load archive");
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

  async function handleDownload(paperId: string, type: "paper" | "memo") {
    setDownloading(`${paperId}-${type}`);
    try {
      const { url } = await api.get<{ url: string }>(
        `/papers/${paperId}/download?type=${type}`,
      );
      window.open(url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

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

        {error && <p>{error}</p>}

        <TablePanel minWidth="48rem">
          <thead>
            <tr>
              <Th>Round</Th>
              <Th>Closed</Th>
              <Th>Paper</Th>
              <Th numeric>Download</Th>
            </tr>
          </thead>
          <tbody>
            {!loading && rounds.length === 0 && (
              <tr>
                <td colSpan={4}>No closed rounds yet.</td>
              </tr>
            )}
            {rounds.map((round) => {
              const paper = round.papers[0];
              return (
                <tr key={round.id}>
                  <Td strong muted={false}>
                    {round.name}
                  </Td>
                  <Td>{dateFormatter.format(new Date(round.closes_at))}</Td>
                  <Td>
                    <span className={styles.fileName}>
                      <FileText aria-hidden="true" />
                      {paper?.file_url ? "Paper on file" : "No paper uploaded"}
                    </span>
                  </Td>
                  <Td numeric>
                    <span className={styles.downloads}>
                      <Button
                        aria-label={`Download paper for ${round.name}`}
                        icon={<Download aria-hidden="true" />}
                        size="sm"
                        variant="outline"
                        disabled={!paper?.file_url || downloading === `${paper?.id}-paper`}
                        onClick={() => paper && handleDownload(paper.id, "paper")}
                      >
                        Paper
                      </Button>
                      <Button
                        aria-label={`Download memo for ${round.name}`}
                        icon={<Download aria-hidden="true" />}
                        size="sm"
                        variant="outline"
                        disabled={!paper?.memo_file_url || downloading === `${paper?.id}-memo`}
                        onClick={() => paper && handleDownload(paper.id, "memo")}
                      >
                        Memo
                      </Button>
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TablePanel>
      </div>
    </AppShell>
  );
}

export default Archive;