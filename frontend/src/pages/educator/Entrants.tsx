import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { api } from "../../lib/api";
import { educatorNav } from "../../lib/mockData";
import { Toast } from "../../components/ui/Toast";
import styles from "./Entrants.module.css";

type Olympiad = { id: string; name: string };
type Invitation = { id: string; email: string | null; olympiadName: string; status: "pending" | "accepted" | "expired" };

function Entrants() {
  const [olympiads, setOlympiads] = useState<Olympiad[]>([]);
  const [olympiadId, setOlympiadId] = useState("");
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [educatorEmail, setEducatorEmail] = useState("");
  const [invitingEducator, setInvitingEducator] = useState(false);

  async function load() {
    const [olympiadData, invitationData, meData] = await Promise.all([
      api.get<{ olympiads: Olympiad[] }>("/auth/educator-olympiads"),
      api.get<{ invitations: Invitation[] }>("/auth/student-invitations"),
      api.get<{ user: { school_memberships: { role: string }[] } }>("/auth/me"),
    ]);
    setOlympiads(olympiadData.olympiads);
    setOlympiadId((current) => current || olympiadData.olympiads[0]?.id || "");
    setInvitations(invitationData.invitations);
    setIsCoordinator(meData.user.school_memberships.some((membership) => membership.role === "coordinator"));
  }

  async function handleEducatorInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    setInvitingEducator(true);
    try {
      const result = await api.post<{ emailDelivered: boolean }>("/auth/invite-educator", { email: educatorEmail, olympiad_id: olympiadId });
      setEducatorEmail("");
      setToast({ type: "success", message: result.emailDelivered ? "Educator invitation sent successfully." : "Educator invitation created. Email delivery is unavailable; check the server email settings." });
    } catch {
      setToast({ type: "error", message: "We couldn’t invite that educator. Check the email and Olympiad, then try again." });
    } finally {
      setInvitingEducator(false);
    }
  }

  useEffect(() => {
    load().catch(() => setToast({ type: "error", message: "We couldn’t load your student invitations. Please refresh the page." }));
  }, []);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    setSending(true);
    try {
      const result = await api.post<{ code: string; emailDelivered: boolean }>("/auth/invite-student", {
        email,
        olympiad_id: olympiadId,
      });
      setEmail("");
      setToast({ type: "success", message: result.emailDelivered
        ? "Student invitation sent successfully."
        : `Invitation code ${result.code} was created, but email delivery is unavailable. Check the server email settings.` });
      await load();
    } catch (err) {
      setToast({ type: "error", message: "We couldn’t send the student invitation. Check the email and Olympiad, then try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell activeRole="educator" navItems={educatorNav} organisation="Rosebank High School" portalLabel="Educator portal" userInitials="TM" userName="Thandi Mokoena">
      <div className={styles.stack}>
        <PageHeader title="Invite students" description="Email student registration codes for your school's olympiads." />

        <Card className={styles.formCard}>
          <form className={styles.form} onSubmit={handleInvite}>
            <div className={styles.field}>
              <Label htmlFor="student-email">Student email<span className={styles.required}> *</span></Label>
              <Input id="student-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" required />
            </div>
            <div className={styles.field}>
              <Label htmlFor="student-olympiad">Olympiad</Label>
              <Select id="student-olympiad" value={olympiadId} onChange={(event) => setOlympiadId(event.target.value)} required disabled={!olympiads.length}>
                {olympiads.length === 0 && <option value="">No olympiads available</option>}
                {olympiads.map((olympiad) => <option key={olympiad.id} value={olympiad.id}>{olympiad.name}</option>)}
              </Select>
            </div>
            <Button icon={<Plus aria-hidden="true" />} type="submit" disabled={sending || !olympiadId}>
              {sending ? "Sending..." : "Send invitation"}
            </Button>
          </form>
        </Card>

        {isCoordinator && (
          <Card className={styles.formCard}>
            <h2 className={styles.sectionTitle}>Invite an educator</h2>
            <form className={styles.form} onSubmit={handleEducatorInvite}>
              <div className={styles.field}>
                <Label htmlFor="educator-email">Educator email</Label>
                <Input id="educator-email" type="email" value={educatorEmail} onChange={(event) => setEducatorEmail(event.target.value)} placeholder="colleague@school.edu" required />
              </div>
              <div className={styles.field}>
                <Label htmlFor="educator-olympiad">Olympiad</Label>
                <Select id="educator-olympiad" value={olympiadId} onChange={(event) => setOlympiadId(event.target.value)} required disabled={!olympiads.length}>
                  {olympiads.map((olympiad) => <option key={olympiad.id} value={olympiad.id}>{olympiad.name}</option>)}
                </Select>
              </div>
              <Button type="submit" disabled={invitingEducator || !olympiadId}>{invitingEducator ? "Sending..." : "Invite educator"}</Button>
            </form>
          </Card>
        )}

        <Card className={styles.emptyCard} padded={false} aria-labelledby="entrants-heading">
          <div className={styles.emptyHeader}>
            <h2 id="entrants-heading">Student invitations ({invitations.length})</h2>
          </div>
          {invitations.length === 0 ? (
            <p>No student invitations sent yet.</p>
          ) : (
            <ul className={styles.invitations}>
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <span>{invitation.email || "Student"} · {invitation.olympiadName}</span>
                  <strong className={styles[`status${invitation.status[0].toUpperCase()}${invitation.status.slice(1)}`]}>{invitation.status}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}
      </div>
    </AppShell>
  );
}

export default Entrants;
