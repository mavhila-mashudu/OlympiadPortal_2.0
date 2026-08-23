import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { FileInput } from "../../components/ui/FileInput";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Textarea } from "../../components/ui/Textarea";
import { organiserNav } from "../../lib/mockData";
import { api } from "../../lib/api";
import { getCurrentOlympiad } from "../../lib/olympiad";
import styles from "./CreateRound.module.css";

type Round = { id: string };

function CreateRound() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setSubmitting(true);

              const formData = new FormData(event.currentTarget);
              const name = formData.get("roundName") as string;
              const notes = (formData.get("notes") as string) || undefined;
              const opensAtLocal = formData.get("opensAt") as string;
              const closesAtLocal = formData.get("closesAt") as string;
              const paperFile = formData.get("paper") as File | null;
              const memoFile = formData.get("memo") as File | null;

              try {
                const olympiad = await getCurrentOlympiad();

                const { round } = await api.post<{ round: Round }>(
                  `/olympiads/${olympiad.id}/rounds`,
                  {
                    name,
                    notes,
                    opens_at: new Date(opensAtLocal).toISOString(),
                    closes_at: new Date(closesAtLocal).toISOString(),
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

                navigate("/organiser");
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
                <Input id="opens-at" name="opensAt" required type="datetime-local" />
              </div>
              <div className={styles.field}>
                <Label htmlFor="closes-at">
                  Closes at<span className={styles.required}> *</span>
                </Label>
                <Input id="closes-at" name="closesAt" required type="datetime-local" />
              </div>
            </div>

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

            <div className={styles.actions}>
              <Button disabled={submitting} type="submit">
                {submitting ? "Creating…" : "Create round"}
              </Button>
              <Button to="/organiser" variant="outline">
                Back to dashboard
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

export default CreateRound;