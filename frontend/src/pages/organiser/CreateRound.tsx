import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { FileInput } from "../../components/ui/FileInput";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import { DEFAULT_TIMEZONE, timeZoneLabel, zonedInputToIso } from "../../lib/time";
import styles from "./CreateRound.module.css";

type Round = { id: string };

function CreateRound() {
  const navigate = useNavigate();
  const [olympiads, setOlympiads] = useState<any[]>([]);
  const [selectedOlympiadId, setSelectedOlympiadId] = useState("");
  const [loadingOlympiads, setLoadingOlympiads] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [created, setCreated] = useState(false);
  // Warnings shown BEFORE creation — user must confirm to proceed.
  const [pendingWarnings, setPendingWarnings] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  // Times are typed in the chosen olympiad's own timezone
  const timeZone =
    olympiads.find((o) => o.id === selectedOlympiadId)?.timezone ?? DEFAULT_TIMEZONE;

  useEffect(() => {
    async function loadOlympiads() {
      try {
        const data = await api.get<{ olympiads: any[] }>("/olympiads");
        setOlympiads(data.olympiads || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load olympiads",
        );
      } finally {
        setLoadingOlympiads(false);
      }
    }

    loadOlympiads();
  }, []);

  return (
    <AppShell
      activeRole="organiser"
      navItems={organiserNav}
      organisation="National Olympiad Office"
      portalLabel="Organiser console"


    >
      <div className={styles.stack}>
        <PageHeader
          title="Create a round"
          description="Define the schedule and upload the paper and memo for a new round."
          actions={
            <Button to="/organiser" variant="outline">
              Cancel
            </Button>
          }
        />

        <Card className={styles.formCard}>
          <form
            ref={formRef}
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setSubmitting(true);

              const formData = new FormData(event.currentTarget);
              const name = formData.get("roundName") as string;
              const notes = (formData.get("notes") as string) || undefined;
              const opensAt = zonedInputToIso(formData.get("opensAt") as string, timeZone);
              const closesAt = zonedInputToIso(formData.get("closesAt") as string, timeZone);
              const qualifyingThreshold = formData.get("qualifyingThreshold") as string;
              const paperFile = formData.get("paper") as File | null;
              const memoFile = formData.get("memo") as File | null;

              try {
                if (!selectedOlympiadId) {
                  throw new Error("Select an olympiad before creating the round");
                }

                // Step 1: check for holiday clashes BEFORE creating
                if (!confirmedRef.current) {
                  const { warnings: preWarnings } = await api.post<{ warnings: string[] }>(
                    "/rounds/check-dates",
                    {
                      opens_at: opensAt,
                      closes_at: closesAt,
                      // Holidays are checked on the olympiad's calendar
                      olympiad_id: selectedOlympiadId,
                    },
                  );
                  if (preWarnings && preWarnings.length > 0) {
                    setPendingWarnings(preWarnings);
                    setSubmitting(false);
                    return; // stop — wait for user to confirm
                  }
                }
                confirmedRef.current = false;

                // Step 2: create the round
                const { round, warnings: apiWarnings } = await api.post<{ round: Round; warnings?: string[] }>(
                  `/olympiads/${selectedOlympiadId}/rounds`,
                  {
                    name,
                    notes,
                    opens_at: opensAt,
                    closes_at: closesAt,
                    qualifying_threshold: qualifyingThreshold
                      ? Number(qualifyingThreshold)
                      : null,
                  },
                );

                const hasPaper = paperFile && paperFile.size > 0;
                const hasMemo = memoFile && memoFile.size > 0;

                if (hasPaper || hasMemo) {
                  const papersForm = new FormData();
                  if (hasPaper) papersForm.append("paper", paperFile as File);
                  if (hasMemo) papersForm.append("memo", memoFile as File);
                  await api.post(`/rounds/${round.id}/papers`, papersForm);
                }

                if (apiWarnings && apiWarnings.length > 0) {
                  setWarnings(apiWarnings);
                  setCreated(true);
                } else {
                  navigate("/organiser");
                }
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Failed to create round",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div className={styles.field}>
              <Label htmlFor="round-olympiad">
                Olympiad<span className={styles.required}> *</span>
              </Label>
              <Select
                id="round-olympiad"
                name="olympiadId"
                value={selectedOlympiadId}
                onChange={(event) => setSelectedOlympiadId(event.target.value)}
                required
                disabled={loadingOlympiads || olympiads.length === 0}
              >
                <option value="">
                  {loadingOlympiads ? "Loading olympiads..." : "Select an olympiad"}
                </option>
                {olympiads.map((olympiad) => (
                  <option key={olympiad.id} value={olympiad.id}>
                    {olympiad.name}
                  </option>
                ))}
              </Select>
              {!loadingOlympiads && olympiads.length === 0 && (
                <p className={styles.hint}>
                  No olympiads found.{" "}
                  <Link to="/organiser/olympiads" style={{ textDecoration: "underline" }}>
                    Create one first
                  </Link>{" "}
                  before creating a round.
                </p>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="round-name">
                Round name<span className={styles.required}> *</span>
              </Label>
              <Input
                id="round-name"
                name="roundName"
                placeholder="Round 5 — Regional"
                required
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="qualifying-threshold">
                Qualifying threshold
              </Label>
              <Input
                id="qualifying-threshold"
                name="qualifyingThreshold"
                min="0"
                placeholder="e.g. 60"
                step="any"
                type="number"
              />
              <p className={styles.hint}>
                Entrants scoring at least this many points qualify. Leave blank
                if this round has no threshold.
              </p>
            </div>

            <div className={styles.field}>
              <Label htmlFor="round-notes">Instructions for educators</Label>
              <Textarea
                id="round-notes"
                name="notes"
                placeholder="Any notes shown to educators alongside the paper."
                rows={3}
              />
            </div>

            <div className={styles.dateGrid}>
              <div className={styles.field}>
                <Label htmlFor="opens-at">
                  Opens at<span className={styles.required}> *</span>
                </Label>
                <Input
                  id="opens-at"
                  name="opensAt"
                  required
                  type="datetime-local"
                  onChange={() => {
                    setPendingWarnings([]);
                  }}
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="closes-at">
                  Closes at<span className={styles.required}> *</span>
                </Label>
                <Input
                  id="closes-at"
                  name="closesAt"
                  required
                  type="datetime-local"
                  onChange={() => {
                    setPendingWarnings([]);
                  }}
                />
              </div>
            </div>
            <p className={styles.hint}>
              Times are in the olympiad&apos;s timezone ({timeZoneLabel(timeZone)}), and every school
              sees them in the same timezone.
            </p>

            <div className={styles.field}>
              <Label htmlFor="paper-file">Paper file</Label>
              <FileInput
                accept=".pdf,.doc,.docx,.csv,.xlsx"
                aria-describedby="paper-file-hint"
                id="paper-file"
                name="paper"
              />
              <p id="paper-file-hint" className={styles.hint}>
                PDF released to schools when the round opens.
              </p>
            </div>

            <div className={styles.field}>
              <Label htmlFor="memo-file">Memo file</Label>
              <FileInput
                accept=".pdf,.doc,.docx,.csv,.xlsx"
                aria-describedby="memo-file-hint"
                id="memo-file"
                name="memo"
              />
              <p id="memo-file-hint" className={styles.hint}>
                Used for auto-marking. Can be added later.
              </p>
            </div>

            {error && <p className={styles.hint}>{error}</p>}

            {pendingWarnings.length > 0 && !created && (
              <div className={styles.confirmPanel}>
                <p className={styles.confirmTitle}>Public holiday clashes detected</p>
                <ul className={styles.warningList}>
                  {pendingWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p className={styles.confirmHint}>
                  You can still create the round, or go back and change the dates.
                </p>
                <div className={styles.confirmActions}>
                  <Button
                    type="button"
                    onClick={() => {
                      confirmedRef.current = true;
                      setPendingWarnings([]);
                      formRef.current?.requestSubmit();
                    }}
                  >
                    Create anyway
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPendingWarnings([]);
                    }}
                  >
                    Change dates
                  </Button>
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <Button
                disabled={submitting || loadingOlympiads || olympiads.length === 0}
                type="submit"
              >
                {submitting ? "Creating…" : "Create round"}
              </Button>
              <Button to="/organiser" variant="outline">
                Back to dashboard
              </Button>
            </div>
          </form>
        </Card>

        {created && warnings.length > 0 && (
          <Card className={styles.warningBanner}>
            <p className={styles.warningTitle}>Round created</p>
            <p className={styles.warningSubtitle}>
              The following public holiday clashes were detected:
            </p>
            <ul className={styles.warningList}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <Button onClick={() => navigate("/organiser")}>
              Go to dashboard
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default CreateRound;