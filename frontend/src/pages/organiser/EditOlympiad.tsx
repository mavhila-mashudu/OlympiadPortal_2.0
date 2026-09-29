import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { api } from "../../lib/api";
import { clearCurrentOlympiadCache } from "../../lib/olympiad";
import { organiserNav } from "../../lib/mockData";
import styles from "./CreateRound.module.css";

type Olympiad = { id: string; name: string; timezone: string };

export default function EditOlympiad() {
  const { id } = useParams<{ id: string }>();
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    api.get<{ olympiad: Olympiad }>(`/olympiads/${id}`)
      .then(({ olympiad }) => { if (active) setOlympiad(olympiad); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load olympiad"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || saving) return;
    const values = new FormData(event.currentTarget);
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const { olympiad: updated } = await api.patch<{ olympiad: Olympiad }>(`/olympiads/${id}`, {
        name: String(values.get("name") ?? "").trim(),
        timezone: String(values.get("timezone") ?? "").trim(),
      });
      clearCurrentOlympiadCache();
      setOlympiad(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save olympiad");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console">
    <div className={styles.stack}>
      <PageHeader title={olympiad ? `Edit olympiad: ${olympiad.name}` : "Edit olympiad"} description="Update the olympiad name and timezone." actions={<Button to="/organiser/olympiads" variant="outline">Back to olympiads</Button>} />
      <Card className={styles.formCard}>
        {loading && <p>Loading olympiad...</p>}
        {olympiad && <form key={`${olympiad.name}-${olympiad.timezone}`} className={styles.form} onSubmit={save}>
          <div className={styles.field}><Label htmlFor="edit-olympiad-name">Olympiad name</Label><Input id="edit-olympiad-name" name="name" defaultValue={olympiad.name} required /></div>
          <div className={styles.field}><Label htmlFor="edit-olympiad-timezone">Timezone</Label><Input id="edit-olympiad-timezone" name="timezone" defaultValue={olympiad.timezone} required /><p className={styles.hint}>Use an IANA timezone, such as Africa/Johannesburg.</p></div>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </form>}
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">Olympiad saved successfully.</p>}
      </Card>
    </div>
  </AppShell>;
}
