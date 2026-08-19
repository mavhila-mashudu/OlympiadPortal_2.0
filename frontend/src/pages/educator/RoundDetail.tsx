import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Upload,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { FileInput } from "../../components/ui/FileInput";
import { Label } from "../../components/ui/Label";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { educatorNav, educatorRoundDetails } from "../../lib/mockData";
import styles from "./RoundDetail.module.css";

function EducatorRoundDetail() {
  const { id } = useParams<{ id: string }>();
  const round = educatorRoundDetails.find((r) => r.id === id);
  const [hasSubmitted, setHasSubmitted] = useState(round?.hasSubmitted ?? false);

  if (!round) {
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
          <p className={styles.notFound}>Round not found.</p>
          <div>
            <Button to="/educator" variant="outline">
              Back to dashboard
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // Timing rules enforced for this round:
  //
  // 2. Papers cannot be downloaded before the round opens — no early access.
  //    Download is only allowed once the round has opened (open or closed).
  const canDownloadPaper = round.status === "open" || round.status === "closed";

  // 3. Results cannot be submitted after the round closes — the deadline is
  //    meaningful. Submission is only allowed while the round is open.
  const canSubmitResults = round.status === "open";

  // Collected results are available once the round has closed and entrant
  // scores have been recorded.
  const hasResults =
    round.status === "closed" && round.entrantResults.length > 0;

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
        <header className={styles.pageHeader}>
          <div>
            <h1>{round.title}</h1>
            <p>
              {round.school} · Opens {round.opens} · Closes {round.closes}
            </p>
          </div>
          <div className={styles.pageActions}>
            <Button to="/educator" variant="outline">
              Back to rounds
            </Button>
          </div>
        </header>

        <div className={styles.statusRow}>
          <StatusBadge status={round.status} />
        </div>

        {/*
          1. Single place to find papers, submit results, and collect
          results — no separate tools or shared folders needed.
        */}

        {/* Question paper & memo */}
        <Card
          className={styles.sectionCard}
          padded={false}
          aria-labelledby="paper-heading"
        >
          <div className={styles.sectionHeader}>
            <h2 id="paper-heading">Question paper &amp; memo</h2>
          </div>
          <div className={styles.paperBody}>
            <div className={styles.paperFiles}>
              <span className={styles.paperFile}>
                <FileText aria-hidden="true" />
                <span className={styles.paperFileName}>
                  <span>{round.paperFile}</span>
                  <small>Question paper</small>
                </span>
              </span>
              <span className={styles.paperFile}>
                <FileText aria-hidden="true" />
                <span className={styles.paperFileName}>
                  <span>{round.memoFile}</span>
                  <small>Memo / solutions</small>
                </span>
              </span>
            </div>
            <div className={styles.paperActions}>
              <Button
                icon={<Download aria-hidden="true" />}
                variant="primary"
                disabled={!canDownloadPaper}
              >
                Download paper
              </Button>
              <Button
                icon={<Download aria-hidden="true" />}
                variant="outline"
                disabled={!canDownloadPaper}
              >
                Download memo
              </Button>
            </div>
          </div>
          <p className={styles.sectionNote}>{round.paperNote}</p>
        </Card>

        {/* Submit results */}
        <Card
          className={styles.sectionCard}
          padded={false}
          aria-labelledby="submit-heading"
        >
          <div className={styles.sectionHeader}>
            <h2 id="submit-heading">Submit results</h2>
          </div>
          <div className={styles.submitBody}>
            {hasSubmitted ? (
              <div className={`${styles.noticeBanner} ${styles.noticeOk}`}>
                <CheckCircle2 aria-hidden="true" />
                <span>{round.submissionNote}</span>
              </div>
            ) : canSubmitResults ? (
              <form
                className={styles.submitForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  setHasSubmitted(true);
                }}
              >
                <div className={styles.field}>
                  <Label htmlFor="results-file">Upload results file</Label>
                  <FileInput id="results-file" accept=".csv,.xlsx,.pdf" />
                </div>
                <Button icon={<Upload aria-hidden="true" />} type="submit">
                  Submit results
                </Button>
              </form>
            ) : (
              <div
                className={`${styles.noticeBanner} ${styles.noticeBlocked}`}
              >
                <AlertCircle aria-hidden="true" />
                <span>{round.submissionNote}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Collected results */}
        {hasResults ? (
          <TablePanel title="Collected results" minWidth="44rem">
            <thead>
              <tr>
                <Th>Entrant</Th>
                <Th>Student no.</Th>
                <Th>Grade</Th>
                <Th numeric>Score</Th>
                <Th numeric>Percentage</Th>
              </tr>
            </thead>
            <tbody>
              {round.entrantResults.map((entrant) => (
                <tr key={entrant.studentNumber}>
                  <Td strong muted={false}>
                    {entrant.name}
                  </Td>
                  <Td>{entrant.studentNumber}</Td>
                  <Td>{entrant.grade}</Td>
                  <Td numeric muted={false}>
                    {entrant.score}
                  </Td>
                  <Td numeric strong muted={false}>
                    {entrant.percentage}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TablePanel>
        ) : (
          <Card
            className={styles.sectionCard}
            padded={false}
            aria-labelledby="results-heading"
          >
            <div className={styles.sectionHeader}>
              <h2 id="results-heading">Collected results</h2>
            </div>
            <div className={styles.emptyResults}>
              <ClipboardList aria-hidden="true" />
              <p>{round.resultsNote}</p>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default EducatorRoundDetail;
