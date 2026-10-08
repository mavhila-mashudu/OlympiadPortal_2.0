import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { FileInput } from "../../components/ui/FileInput";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Textarea } from "../../components/ui/Textarea";
import { api } from "../../lib/api";
import { organiserNav } from "../../lib/mockData";
import { DEFAULT_TIMEZONE, isoToZonedInput, timeZoneLabel, zonedInputToIso } from "../../lib/time";
import styles from "./CreateRound.module.css";

type Round = {
  name: string;
  state: string;
  opens_at: string;
  closes_at: string;
  notes: string | null;
  qualifying_threshold: number | string | null;
  papers: { id: string; file_url: string | null; memo_file_url: string | null }[];
  olympiads: { timezone?: string };
};

export default function RoundPapers() {
  const { id } = useParams<{ id: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    api.get<{ round: Round }>(`/rounds/${id}`)
      .then(({ round }) => { if (active) setRound(round); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load round"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !round || saving) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const paper = values.get("paper") as File | null;
    const memo = values.get("memo") as File | null;
    const hasFiles = Boolean(paper?.size || memo?.size);
    setError(null);
    setSuccess(null);
    setWarnings([]);
    setSaving(true);
    try {
      const result = await api.patch<{ warnings?: string[] }>(`/rounds/${id}`, {
        name: String(values.get("name") ?? "").trim(),
        opens_at: zonedInputToIso(String(values.get("opensAt")), timeZone),
        closes_at: zonedInputToIso(String(values.get("closesAt")), timeZone),
        qualifying_threshold: values.get("threshold") ? Number(values.get("threshold")) : null,
        notes: String(values.get("notes") ?? ""),
      });
      setWarnings(result.warnings ?? []);
      if (hasFiles) {
        const files = new FormData();
        if (paper?.size) files.append("paper", paper);
        if (memo?.size) files.append("memo", memo);
        try {
          await api.post(`/rounds/${id}/papers`, files);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          throw new Error(`Round details were saved, but the files were not: ${message}`);
        }
      }
      const { round: updated } = await api.get<{ round: Round }>(`/rounds/${id}`);
      setRound(updated);
      form.reset();
      setSuccess("Round saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save round");
    } finally {
      setSaving(false);
    }
  }

  const current = round?.papers[0];
  const timeZone = round?.olympiads?.timezone ?? DEFAULT_TIMEZONE;
  return (
    <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console">
      <div className={styles.stack}>
        <PageHeader title={round ? `Edit round: ${round.name}` : "Edit round"} description="Change the schedule, instructions, paper and memo before the round opens." actions={<Button to="/organiser" variant="outline">Back to rounds</Button>} />
        <Card className={styles.formCard}>
          {loading && <p>Loading round...</p>}
          {round && round.state !== "scheduled" && <p>This round has already opened. Its details and files can no longer be changed.</p>}
          {round?.state === "scheduled" && <form key={`${round.name}-${round.opens_at}-${round.closes_at}-${round.notes}-${round.qualifying_threshold}`} className={styles.form} onSubmit={save}>
            <div className={styles.field}><Label htmlFor="edit-round-name">Round name</Label><Input id="edit-round-name" name="name" defaultValue={round.name} required /></div>
            <div className={styles.field}><Label htmlFor="edit-round-threshold">Qualifying threshold (%)</Label><Input id="edit-round-threshold" name="threshold" type="number" min="0" max="100" step="any" defaultValue={round.qualifying_threshold ?? ""} /></div>
            <div className={styles.field}><Label htmlFor="edit-round-notes">Instructions for educators</Label><Textarea id="edit-round-notes" name="notes" rows={3} defaultValue={round.notes ?? ""} /></div>
            <div className={styles.dateGrid}>
              <div className={styles.field}><Label htmlFor="edit-round-opens">Opens at ({timeZoneLabel(timeZone)})</Label><Input id="edit-round-opens" name="opensAt" type="datetime-local" defaultValue={isoToZonedInput(round.opens_at, timeZone)} required /></div>
              <div className={styles.field}><Label htmlFor="edit-round-closes">Closes at ({timeZoneLabel(timeZone)})</Label><Input id="edit-round-closes" name="closesAt" type="datetime-local" defaultValue={isoToZonedInput(round.closes_at, timeZone)} required /></div>
            </div>
            <p>Paper: {current?.file_url ? "Uploaded" : "Not uploaded"}; memo: {current?.memo_file_url ? "Uploaded" : "Not uploaded"}</p>
            <p className={styles.hint}>Select a file only when adding or replacing it. The other file stays unchanged. Maximum 20 MB per file.</p>
            <div className={styles.field}><Label htmlFor="edit-round-paper">Paper PDF</Label><FileInput id="edit-round-paper" name="paper" accept="application/pdf,.pdf" /></div>
            <div className={styles.field}><Label htmlFor="edit-round-memo">Memo PDF</Label><FileInput id="edit-round-memo" name="memo" accept="application/pdf,.pdf" /></div>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          </form>}
          {error && <p role="alert">{error}</p>}
          {success && <p role="status">{success}</p>}
          {warnings.length > 0 && <div role="status"><p>Public holiday warnings:</p><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
        </Card>
      </div>
    </AppShell>
  );
}
