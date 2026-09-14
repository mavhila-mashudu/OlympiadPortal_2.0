<<<<<<< Updated upstream
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
=======
import { useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
>>>>>>> Stashed changes
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
<<<<<<< Updated upstream
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
=======
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { educatorNav } from "../../lib/mockData";
import {
  useEducatorRounds,
  useEducatorEntrants,
  useRegisterEntrants,
  type EducatorEntrant,
} from "../../lib/educatorApi";
import styles from "./Entrants.module.css";

function Entrants() {
  const { data: roundsData } = useEducatorRounds();
  const rounds = roundsData?.rounds ?? [];
  const schoolName = roundsData?.school?.name ?? "Your school";

  // Filter to rounds that can accept registrations (not fully closed)
  const registerableRounds = rounds.filter(
    (r) => r.state === "scheduled" || r.state === "open",
  );

  const [selectedRoundId, setSelectedRoundId] = useState(
    registerableRounds[0]?.id ?? "",
  );
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [grade, setGrade] = useState("11");
  const [successMessage, setSuccessMessage] = useState("");

  const { data: entrants, isLoading: entrantsLoading } =
    useEducatorEntrants(selectedRoundId);
  const registerMutation = useRegisterEntrants(selectedRoundId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !selectedRoundId) return;

    try {
      await registerMutation.mutateAsync([
        {
          full_name: fullName.trim(),
          grade,
          external_ref: studentNumber.trim() || undefined,
        },
      ]);
      setFullName("");
      setStudentNumber("");
      setSuccessMessage(
        `${fullName.trim()} has been registered for this round.`,
      );
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation={schoolName}
      portalLabel="Educator portal"
      userInitials=""
      userName=""
    >
      <div className={styles.stack}>
        <PageHeader
          title="Register entrants"
          description="Add students from your school to an upcoming round so their results can be tracked."
        />

        {rounds.length === 0 ? (
          <p className={styles.loading}>
            Loading rounds…
          </p>
        ) : (
          <>
            <div className={styles.roundField}>
              <Label htmlFor="entrant-round">Round</Label>
              <Select
                id="entrant-round"
                value={selectedRoundId}
                onChange={(e) => {
                  setSelectedRoundId(e.target.value);
                  setSuccessMessage("");
                }}
              >
                {registerableRounds.length === 0 ? (
                  <option value="">No rounds accepting registrations</option>
                ) : (
                  registerableRounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                )}
              </Select>
            </div>

            {selectedRoundId && (
              <>
                {successMessage && (
                  <div className={styles.successNote}>
                    <CheckCircle2 aria-hidden="true" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <Card className={styles.formCard}>
                  <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.field}>
                      <Label htmlFor="entrant-name">
                        Full name
                        <span className={styles.required}> *</span>
                      </Label>
                      <Input
                        id="entrant-name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="entrant-number">Student number</Label>
                      <Input
                        id="entrant-number"
                        value={studentNumber}
                        onChange={(e) => setStudentNumber(e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="entrant-grade">Grade</Label>
                      <Select
                        id="entrant-grade"
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                      >
                        <option value="8">Grade 8</option>
                        <option value="9">Grade 9</option>
                        <option value="10">Grade 10</option>
                        <option value="11">Grade 11</option>
                        <option value="12">Grade 12</option>
                      </Select>
                    </div>
                    <Button
                      icon={<Plus aria-hidden="true" />}
                      type="submit"
                      disabled={
                        !fullName.trim() || registerMutation.isPending
                      }
                    >
                      {registerMutation.isPending
                        ? "Registering…"
                        : "Add entrant"}
                    </Button>
                  </form>
                </Card>

                {/* Registered entrants table */}
                {entrantsLoading ? (
                  <p className={styles.loading}>Loading entrants…</p>
                ) : entrants && entrants.length > 0 ? (
                  <TablePanel
                    title={`Registered entrants (${entrants.length})`}
                    minWidth="36rem"
                  >
                    <thead>
                      <tr>
                        <Th>Full name</Th>
                        <Th>Student no.</Th>
                        <Th>Grade</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {entrants.map((ent: EducatorEntrant) => (
                        <tr key={ent.id}>
                          <Td strong muted={false}>
                            {ent.full_name}
                          </Td>
                          <Td>{ent.external_ref ?? "—"}</Td>
                          <Td>{ent.grade ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TablePanel>
                ) : (
                  <Card
                    className={styles.emptyCard}
                    padded={false}
                    aria-labelledby="entrants-heading"
                  >
                    <div className={styles.emptyHeader}>
                      <h2 id="entrants-heading">
                        Registered entrants (0)
                      </h2>
                    </div>
                    <p>No entrants registered for this round yet.</p>
                  </Card>
                )}
              </>
            )}
          </>
        )}
>>>>>>> Stashed changes
      </div>
    </AppShell>
  );
}

export default Entrants;
