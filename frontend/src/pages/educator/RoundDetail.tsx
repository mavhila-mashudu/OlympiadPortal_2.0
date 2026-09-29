import { useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Lock,
  Pencil,
  Upload,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { educatorNav } from "../../lib/mockData";
import {
  useEducatorRoundDetail,
  usePastPapers,
  useEducatorEntrants,
  useEducatorResults,
  useSubmitResults,
  downloadPaperFile,
  formatDate,
  formatDateShort,
  type EducatorRoundSubmission,
  type SubmissionReceipt,
} from "../../lib/educatorApi";
import styles from "./RoundDetail.module.css";

function EducatorRoundDetail() {
  const { id: roundId } = useParams<{ id: string }>();
  const { data: round, isLoading, error } = useEducatorRoundDetail(roundId!);
  const { data: pastPapers } = usePastPapers(roundId!);
  const { data: entrants } = useEducatorEntrants(roundId!);

  // Submission state (B12, B13)
  const [selectedEntrantId, setSelectedEntrantId] = useState("");
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const submitMutation = useSubmitResults(roundId!);

  // Results (B15) — only fetch once released; the backend refuses
  // results for any other state
  const resultsEnabled = round?.state === "results_released";
  const { data: resultsData } = useEducatorResults(
    resultsEnabled ? roundId! : "",
  );

  if (isLoading) {
    return (
      <AppShell
        activeRole="educator"
        navItems={educatorNav}
        organisation=""
        portalLabel="Educator portal"
      >
        <p className={styles.loading}>Loading round details…</p>
      </AppShell>
    );
  }

  if (error || !round) {
    return (
      <AppShell
        activeRole="educator"
        navItems={educatorNav}
        organisation=""
        portalLabel="Educator portal"
      >
        <div className={styles.stack}>
          <p className={styles.error}>
            {error
              ? `Failed to load: ${(error as Error).message}`
              : "Round not found."}
          </p>
          <div>
            <Button to="/educator" variant="outline">
              Back to dashboard
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Timing rules ──────────────────────────────────────
  // B7: Papers cannot be downloaded before the round opens.
  const canDownloadPaper =
    round.state === "open" ||
    round.state === "closed" ||
    round.state === "marking" ||
    round.state === "results_released";

  // B8: Results cannot be submitted after the round closes.
  const canSubmitResults = round.state === "open";

  // A learner who opened the exam online but hasn't submitted it can still
  // have paper results captured while the round is open; those replace the
  // unfinished attempt (A9). Once the round closes, the attempt is marked.
  const unfinishedOnline = (s: EducatorRoundSubmission) =>
    canSubmitResults && s.route === "online" && s.status === "received";
  const finished = round.submissions.filter((s) => !unfinishedOnline(s));
  const startedOnline = round.submissions.filter(unfinishedOnline);

  // Learners who already have results in, and those still to submit
  const submittedIds = new Set(finished.map((s) => s.entrant.id));
  const remainingEntrants = (entrants ?? []).filter(
    (ent) => !submittedIds.has(ent.id),
  );

  // B15: Results are only visible once released.
  const showResults =
    round.state === "results_released" &&
    resultsData?.results &&
    resultsData.results.length > 0;

  const handleDownloadPaper = async () => {
    try {
      await downloadPaperFile(roundId!, "paper");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntrantId) return;

    try {
      const result = await submitMutation.mutateAsync({
        entrant_id: selectedEntrantId,
        route: "offline",
        answers: [], // Educator submits without per-question answers (bulk upload)
      });
      setReceipt(result);
      setSelectedEntrantId("");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation={round.school.name}
      portalLabel="Educator portal"
    >
      <div className={styles.stack}>
        <header className={styles.pageHeader}>
          <div>
            <h1>{round.name}</h1>
            <p>
              {round.school.name} · Opens {formatDate(round.opens_at, round.timezone)} ·
              Closes {formatDate(round.closes_at, round.timezone)}
            </p>
          </div>
          <div className={styles.pageActions}>
            <Button
              to={`/educator/rounds/${round.id}/exam`}
              variant="primary"
              icon={<Pencil aria-hidden="true" />}
            >
              Build exam
            </Button>
            <Button to="/educator" variant="outline">
              Back to rounds
            </Button>
          </div>
        </header>

        <div className={styles.statusRow}>
          <StatusBadge status={round.status} />
        </div>

        {/*
          B17: Single place to find papers, submit results, and collect results.
        */}

        {/* ── Question paper (B7, B11) ────────────────────────── */}
        <Card
          className={styles.sectionCard}
          padded={false}
          aria-labelledby="paper-heading"
        >
          <div className={styles.sectionHeader}>
            <h2 id="paper-heading">Question paper</h2>
          </div>
          <div className={styles.paperBody}>
            <div className={styles.paperFiles}>
              {round.paper ? (
                <span className={styles.paperFile}>
                  <FileText aria-hidden="true" />
                  <span className={styles.paperFileName}>
                    <span>{round.paper.title}</span>
                    <small>Question paper</small>
                  </span>
                </span>
              ) : (
                <span className={styles.paperFile}>
                  <FileText aria-hidden="true" />
                  <span className={styles.paperFileName}>
                    <span>No paper uploaded</span>
                    <small>Contact the organiser</small>
                  </span>
                </span>
              )}
            </div>
            <div className={styles.paperActions}>
              <Button
                icon={<Download aria-hidden="true" />}
                variant="primary"
                disabled={!canDownloadPaper || !round.paper?.has_paper}
                onClick={handleDownloadPaper}
              >
                Download paper
              </Button>
            </div>
          </div>
          {!canDownloadPaper && (
            <p className={styles.sectionNote}>
              Paper will be available once the round opens.
            </p>
          )}
        </Card>

        {/* ── Past papers (B11) ───────────────────────────────── */}
        {pastPapers && pastPapers.length > 0 && (
          <Card
            className={styles.sectionCard}
            padded={false}
            aria-labelledby="past-papers-heading"
          >
            <div className={styles.sectionHeader}>
              <h2 id="past-papers-heading">Released past papers</h2>
            </div>
            <div className={styles.pastPaperSection}>
              <div className={styles.pastPaperList}>
                {pastPapers.map((pp) => (
                  <div key={pp.id} className={styles.pastPaperItem}>
                    <div className={styles.pastPaperInfo}>
                      <Archive aria-hidden="true" />
                      <div>
                        <span className={styles.pastPaperName}>
                          {pp.title}
                        </span>
                        <span className={styles.pastPaperRound}>
                          {pp.round_name} · Closed{" "}
                          {formatDateShort(pp.closed_at, pp.timezone)}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Download aria-hidden="true" />}
                      onClick={async () => {
                        try {
                          await downloadPaperFile(pp.round_id, "paper");
                        } catch (err) {
                          alert((err as Error).message);
                        }
                      }}
                    >
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* ── Submit results (B8, B12, B13) ───────────────────── */}
        <Card
          className={styles.sectionCard}
          padded={false}
          aria-labelledby="submit-heading"
        >
          <div className={styles.sectionHeader}>
            <h2 id="submit-heading">Submit results</h2>
          </div>
          <div className={styles.submitBody}>
            {/* B13: Show receipt after successful submission */}
            {receipt && (
              <div className={styles.receipt}>
                <div className={styles.receiptHeader}>
                  <CheckCircle2 aria-hidden="true" />
                  Submission confirmed
                </div>
                <div className={styles.receiptDetails}>
                  <span>
                    <strong>Submission ID:</strong> {receipt.submission.id}
                  </span>
                  <span>
                    <strong>Received at:</strong>{" "}
                    {formatDate(receipt.submission.received_at, round.timezone)}
                  </span>
                  <span>
                    <strong>Status:</strong> {receipt.submission.status}
                    {receipt.autoMarked ? " (auto-marked)" : ""}
                  </span>
                  <span>
                    <strong>Points awarded:</strong> {receipt.totalPoints}
                  </span>
                </div>
              </div>
            )}

            {canSubmitResults && entrants && entrants.length > 0 && remainingEntrants.length === 0 ? (
              <div className={`${styles.noticeBanner} ${styles.noticeOk}`}>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  Results have been submitted for all {entrants.length}{" "}
                  registered {entrants.length === 1 ? "entrant" : "entrants"}.
                </span>
              </div>
            ) : canSubmitResults ? (
              <form className={styles.submitForm} onSubmit={handleSubmit}>
                {entrants && entrants.length > 0 ? (
                  <div className={styles.entrantSelect}>
                    <Label htmlFor="entrant-select">Select entrant</Label>
                    <Select
                      id="entrant-select"
                      value={selectedEntrantId}
                      onChange={(e) => setSelectedEntrantId(e.target.value)}
                      required
                    >
                      <option value="">Choose an entrant…</option>
                      {remainingEntrants.map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.full_name}
                          {ent.grade ? ` (Grade ${ent.grade})` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <p className={styles.sectionNote}>
                    No entrants registered yet.{" "}
                    <a href="/educator/entrants">Register entrants</a> first.
                  </p>
                )}
                {startedOnline.length > 0 && (
                  <p className={styles.sectionNote}>
                    Started online but not submitted:{" "}
                    {startedOnline.map((s) => s.entrant.full_name).join(", ")}.
                    If they finish on paper, capture their answers here; that
                    replaces the unfinished online attempt.
                  </p>
                )}
                <Button
                  icon={<Upload aria-hidden="true" />}
                  type="submit"
                  disabled={!selectedEntrantId || submitMutation.isPending}
                >
                  {submitMutation.isPending
                    ? "Submitting…"
                    : "Submit results"}
                </Button>
              </form>
            ) : (
              <div
                className={`${styles.noticeBanner} ${styles.noticeBlocked}`}
              >
                <AlertCircle aria-hidden="true" />
                <span>
                  {round.state === "scheduled"
                    ? "Submissions open when the round opens."
                    : "The submission window has closed."}
                </span>
              </div>
            )}

            {finished.length > 0 && (
              <div>
                <h3 className={styles.submittedHeading}>
                  Submitted ({finished.length}
                  {entrants && entrants.length > 0 ? ` of ${entrants.length}` : ""})
                </h3>
                <ul className={styles.submittedList}>
                  {finished.map((s) => (
                    <li key={s.id} className={styles.submittedItem}>
                      <span className={styles.pastPaperName}>
                        {s.entrant.full_name}
                      </span>
                      <span className={styles.pastPaperRound}>
                        {s.route === "online" ? "Sat online" : "Captured"} ·{" "}
                        {formatDate(s.received_at, round.timezone)} · {s.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        {/* ── Collected results (B15) ─────────────────────────── */}
        {showResults ? (
          <TablePanel title="Collected results" minWidth="44rem">
            <thead>
              <tr>
                <Th numeric>Rank</Th>
                <Th>Entrant</Th>
                <Th>Student no.</Th>
                <Th>Grade</Th>
                <Th numeric>Score</Th>
                <Th>Qualified</Th>
              </tr>
            </thead>
            <tbody>
              {resultsData!.results.map((r) => (
                <tr key={r.id}>
                  <Td numeric>{r.rank ?? "—"}</Td>
                  <Td strong muted={false}>
                    {r.entrant.full_name}
                  </Td>
                  <Td>{r.entrant.external_ref ?? "—"}</Td>
                  <Td>{r.entrant.grade ?? "—"}</Td>
                  <Td numeric muted={false}>
                    {Number(r.total_points)}
                  </Td>
                  <Td>{r.qualified ? "Yes" : "No"}</Td>
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
              {round.state === "scheduled" || round.state === "open" ? (
                <>
                  <Lock aria-hidden="true" />
                  <p>
                    Results will be available once the round closes and
                    scores are released.
                  </p>
                </>
              ) : (
                <>
                  <ClipboardList aria-hidden="true" />
                  <p>
                    {round.state === "closed" || round.state === "marking"
                      ? "Results are being processed. Check back soon."
                      : "No results available for your entrants."}
                  </p>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default EducatorRoundDetail;
