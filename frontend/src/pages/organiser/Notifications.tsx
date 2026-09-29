import { useEffect, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { api } from "../../lib/api";
import { getCurrentOlympiad, useSelectedOlympiadId, type Olympiad } from "../../lib/olympiad";
import { DEFAULT_TIMEZONE, formatDateTimeInZone } from "../../lib/time";
import { organiserNav } from "../../lib/mockData";
import styles from "./Notifications.module.css";

type Trigger = "round_opens" | "round_closes" | "results_released" | "missing_submission";
type Recipient = "registered_educators" | "registered_schools" | "qualifying_entrants";
type RuleAction = "notify_recipients" | "alert_organiser";

type NotificationRule = {
  id: string;
  name: string;
  trigger: Trigger;
  offset_minutes: number;
  recipient: Recipient;
  action: RuleAction;
  condition: string | null;
  enabled: boolean;
};

type Round = {
  id: string;
  name: string;
  state: string;
  results_release_at?: string | null;
};

type RuleTestResult = {
  round: { name: string; state: string };
  trigger: { type: Trigger; fires_at: string | null; source_time: string | null; offset_minutes: number };
  condition: { expression: string | null; matched: boolean };
  action: RuleAction;
  recipients: { type: Recipient | "organiser"; count: number };
  would_send: boolean;
  warnings: string[];
};

const triggerLabels: Record<Trigger, string> = {
  round_opens: "Round opens",
  round_closes: "Round closes",
  results_released: "Results released",
  missing_submission: "School has not submitted",
};

const recipientLabels: Record<Recipient | "organiser", string> = {
  registered_educators: "Registered educators",
  registered_schools: "Registered schools",
  qualifying_entrants: "Qualifying entrants",
  organiser: "Organiser",
};

function Notifications() {
  const [olympiad, setOlympiad] = useState<Olympiad | null>(null);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [testingRule, setTestingRule] = useState<NotificationRule | null>(null);
  const [testRoundId, setTestRoundId] = useState("");
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRules(olympiadId: string) {
    const data = await api.get<{ rules: NotificationRule[] }>(
      `/olympiads/${olympiadId}/notification-rules`,
    );
    setRules(data.rules || []);
  }

  async function loadRounds(olympiadId: string) {
    const data = await api.get<{ rounds: Round[] }>(`/olympiads/${olympiadId}/rounds`);
    setRounds(data.rounds || []);
  }

  // The olympiad chosen in the sidebar; switching reloads the page's data
  const selectedOlympiadId = useSelectedOlympiadId();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const current = await getCurrentOlympiad();
        if (!cancelled) setOlympiad(current);
        if (current?.id) {
          await Promise.all([loadRules(current.id), loadRounds(current.id)]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load announcement rules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedOlympiadId]);

  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!olympiad?.id) return;
    setSaving(true);
    setError(null);
    // React clears currentTarget once the handler yields, so keep the element
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.post(`/olympiads/${olympiad.id}/notification-rules`, {
        name: String(form.get("name")),
        trigger: String(form.get("trigger")),
        offset_minutes: Number(form.get("offset_minutes") || 0),
        recipient: String(form.get("recipient")),
        action: String(form.get("action")),
        condition: String(form.get("condition") || "").trim() || null,
      });
      await loadRules(olympiad.id);
      setShowForm(false);
      formElement.reset();
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

  function openTest(rule: NotificationRule) {
    setTestingRule(rule);
    setTestRoundId(rounds[0]?.id || "");
    setTestResult(null);
  }

  async function testRule() {
    if (!olympiad?.id || !testingRule || !testRoundId) return;
    setTesting(true);
    setError(null);
    try {
      const result = await api.post<RuleTestResult>(
        `/olympiads/${olympiad.id}/notification-rules/${testingRule.id}/test`,
        { round_id: testRoundId },
      );
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test announcement rule");
    } finally {
      setTesting(false);
    }
  }

  return (
    <AppShell activeRole="organiser" navItems={organiserNav} organisation="National Olympiad Office" portalLabel="Organiser console">
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
              <h2>New in-app announcement</h2>
              <label>Announcement name<Input name="name" placeholder="Round opening announcement" required /></label>
              <label>Trigger<Select name="trigger" defaultValue="round_opens"><option value="round_opens">Round opens</option><option value="round_closes">Round closes</option><option value="results_released">Results released</option><option value="missing_submission">Missing school submission</option></Select></label>
              <label>Minutes before trigger<Input name="offset_minutes" type="number" min="0" defaultValue="0" /></label>
              <label>Recipients<Select name="recipient" defaultValue="registered_educators"><option value="registered_educators">Registered educators</option><option value="registered_schools">Registered schools</option><option value="qualifying_entrants">Qualifying entrants</option></Select></label>
              <label>Action<Select name="action" defaultValue="notify_recipients"><option value="notify_recipients">Notify selected recipients</option><option value="alert_organiser">Alert organiser</option></Select></label>
              <label>Condition (optional)<Select name="condition" defaultValue=""><option value="">Always</option><option value="Only rounds with submissions">Only rounds with submissions</option><option value="Only rounds without submissions">Only rounds without submissions</option></Select></label>
              <div className={styles.actions}><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save rule"}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
            </form>
          </Card>
        )}

        {testingRule && (
          <Card>
            <div className={styles.testHeader}>
              <div><h2>Test rule: {testingRule.name}</h2><p>Preview only. No announcement will be sent.</p></div>
              <Button variant="outline" onClick={() => setTestingRule(null)}>Close</Button>
            </div>
            <div className={styles.testControls}>
              <label>Round<Select value={testRoundId} onChange={(event) => { setTestRoundId(event.target.value); setTestResult(null); }}><option value="">Select a round</option>{rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</Select></label>
              <Button onClick={testRule} disabled={testing || !testRoundId}>{testing ? "Testing..." : "Run test"}</Button>
            </div>
            {testResult && <div className={testResult.would_send ? styles.testSuccess : styles.testWarning}>
              <strong>{testResult.would_send ? "This rule would send an announcement." : "This rule would not send an announcement."}</strong>
              <p>Recipients: {recipientLabels[testResult.recipients.type]} ({testResult.recipients.count})</p>
              <p>Action: {testResult.action === "alert_organiser" ? "Alert organiser" : "Notify selected recipients"}</p>
              <p>Condition: {testResult.condition.matched ? "matched" : "not matched"}</p>
              <p>Scheduled: {testResult.trigger.fires_at ? formatDateTimeInZone(testResult.trigger.fires_at, olympiad?.timezone ?? DEFAULT_TIMEZONE) : "not scheduled"}</p>
              {testResult.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>}
          </Card>
        )}

        <Card padded={false}>
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Rule</th><th>Trigger</th><th>Recipients</th><th>Timing</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {!loading && rules.length === 0 && <tr><td colSpan={6} className={styles.empty}><Bell aria-hidden="true" /> No announcements configured.</td></tr>}
                {rules.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong>{rule.condition && <small>{rule.condition}</small>}</td><td>{triggerLabels[rule.trigger]}</td><td>{recipientLabels[rule.recipient]}</td><td>{rule.offset_minutes ? `${rule.offset_minutes} min before` : "At trigger"}</td><td>{rule.enabled ? "Enabled" : "Disabled"}</td><td><span className={styles.actions}><Button size="sm" variant="outline" onClick={() => openTest(rule)}>Test</Button><Button size="sm" variant="outline" onClick={() => toggleRule(rule)}>{rule.enabled ? "Disable" : "Enable"}</Button><Button size="sm" variant="outline" icon={<Trash2 aria-hidden="true" />} aria-label={`Delete ${rule.name}`} onClick={() => deleteRule(rule.id)}>Delete</Button></span></td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default Notifications;