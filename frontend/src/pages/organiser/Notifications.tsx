import { useEffect, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { api } from "../../lib/api";
import { getCurrentOlympiad, type Olympiad } from "../../lib/olympiad";
import { organiserNav } from "../../lib/mockData";
import styles from "./Notifications.module.css";

type Trigger = "round_opens" | "round_closes" | "results_released";
type Recipient = "registered_educators" | "registered_schools" | "qualifying_entrants";

type NotificationRule = {
  id: string;
  name: string;
  trigger: Trigger;
  offset_minutes: number;
  recipient: Recipient;
  condition: string | null;
  enabled: boolean;
};

const triggerLabels: Record<Trigger, string> = {
  round_opens: "Round opens",
  round_closes: "Round closes",
  results_released: "Results released",
};

const recipientLabels: Record<Recipient, string> = {
  registered_educators: "Registered educators",
  registered_schools: "Registered schools",
  qualifying_entrants: "Qualifying entrants",
};

function Notifications() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRules(olympiadId: string) {
    const data = await api.get<{ rules: NotificationRule[] }>(
      `/olympiads/${olympiadId}/notification-rules`,
    );
    setRules(data.rules || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const current = await getCurrentOlympiad();
        if (!cancelled) setOlympiad(current);
        if (current?.id) await loadRules(current.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load announcement rules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!olympiad?.id) return;
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.post(`/olympiads/${olympiad.id}/notification-rules`, {
        name: String(form.get("name")),
        trigger: String(form.get("trigger")),
        offset_minutes: Number(form.get("offset_minutes") || 0),
        recipient: String(form.get("recipient")),
        condition: String(form.get("condition") || "").trim() || null,
      });
      await loadRules(olympiad.id);
      setShowForm(false);
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create announcement rule");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: NotificationRule) {
    if (!olympiad?.id) return;
    try {
      await api.patch(`/olympiads/${olympiad.id}/notification-rules/${rule.id}`, {
        enabled: !rule.enabled,
      });
      await loadRules(olympiad.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update announcement rule");
    }
  }

  async function deleteRule(ruleId: string) {
    if (!olympiad?.id || !window.confirm("Delete this notification rule?")) return;
    try {
      await api.delete(`/olympiads/${olympiad.id}/notification-rules/${ruleId}`);
      await loadRules(olympiad.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete announcement rule");
    }
  }

  return (
    <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console" userInitials="NO" userName="Admin user">
      <div className={styles.stack}>
        <PageHeader
          title="Send announcement"
          description={olympiad ? `Send announcements for ${olympiad.name}.` : "Send organiser announcements."}
          actions={<Button icon={<Plus aria-hidden="true" />} onClick={() => setShowForm(true)}>Send announcement</Button>}
        />
        {error && <Card className={styles.error}>{error}</Card>}

        {showForm && (
          <Card>
            <form className={styles.form} onSubmit={createRule}>
              <h2>New announcement</h2>
              <label>Announcement name<Input name="name" placeholder="Round opening announcement" required /></label>
              <label>Trigger<Select name="trigger" defaultValue="round_opens"><option value="round_opens">Round opens</option><option value="round_closes">Round closes</option><option value="results_released">Results released</option></Select></label>
              <label>Minutes before trigger<Input name="offset_minutes" type="number" min="0" defaultValue="0" /></label>
              <label>Recipients<Select name="recipient" defaultValue="registered_educators"><option value="registered_educators">Registered educators</option><option value="registered_schools">Registered schools</option><option value="qualifying_entrants">Qualifying entrants</option></Select></label>
              <label>Condition (optional)<Input name="condition" placeholder="Only rounds with submissions" /></label>
              <div className={styles.actions}><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save rule"}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
            </form>
          </Card>
        )}

        <Card padded={false}>
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Rule</th><th>Trigger</th><th>Recipients</th><th>Timing</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {!loading && rules.length === 0 && <tr><td colSpan={6} className={styles.empty}><Bell aria-hidden="true" /> No announcements configured.</td></tr>}
                {rules.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong>{rule.condition && <small>{rule.condition}</small>}</td><td>{triggerLabels[rule.trigger]}</td><td>{recipientLabels[rule.recipient]}</td><td>{rule.offset_minutes ? `${rule.offset_minutes} min before` : "At trigger"}</td><td>{rule.enabled ? "Enabled" : "Disabled"}</td><td><span className={styles.actions}><Button size="sm" variant="outline" onClick={() => toggleRule(rule)}>{rule.enabled ? "Disable" : "Enable"}</Button><Button size="sm" variant="outline" icon={<Trash2 aria-hidden="true" />} aria-label={`Delete ${rule.name}`} onClick={() => deleteRule(rule.id)}>Delete</Button></span></td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default Notifications;