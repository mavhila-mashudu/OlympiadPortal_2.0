import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Select } from "../../components/ui/Select";
import { TablePanel, Td, Th } from "../../components/ui/Table";
import { Toast } from "../../components/ui/Toast";
import { api } from "../../lib/api";
import { educatorNav } from "../../lib/mockData";
import {
  useEducatorRounds,
  useOlympiadEntrants,
  useRegisterEntrantsForOlympiad,
  useOlympiadProgressionInfo,
  type OlympiadEntrant,
} from "../../lib/educatorApi";
import styles from "./Entrants.module.css";

// ── Invitation types ────────────────────────────────────────
type Olympiad = { id: string; name: string };
type Invitation = {
  id: string;
  email: string | null;
  olympiadName: string;
  status: "pending" | "accepted" | "expired";
};

function Entrants() {
  // ── Olympiad / rounds data ─────────────────────────────────
  const { data: roundsData } = useEducatorRounds();
  const schoolName = roundsData?.school?.name ?? "Your school";

  // ── Invitation state ─────────────────────────────────────
  const [olympiads, setOlympiads] = useState<Olympiad[]>([]);
  const [olympiadId, setOlympiadId] = useState("");
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [educatorEmail, setEducatorEmail] = useState("");
  const [invitingEducator, setInvitingEducator] = useState(false);

  // ── Olympiad-level registration state ──────────────────────
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [grade, setGrade] = useState("11");
  const [successMessage, setSuccessMessage] = useState("");

  const { data: olympiadEntrants, isLoading: entrantsLoading } =
    useOlympiadEntrants(olympiadId);
  const registerMutation = useRegisterEntrantsForOlympiad(olympiadId);
  const { data: progression } = useOlympiadProgressionInfo(olympiadId);

  async function loadInvitations() {
    try {
      const [olympiadData, invitationData, meData] = await Promise.all([
        api.get<{ olympiads: Olympiad[] }>("/auth/educator-olympiads"),
        api.get<{ invitations: Invitation[] }>("/auth/student-invitations"),
        api.get<{
          user: { school_memberships: { role: string }[] };
        }>("/auth/me"),
      ]);
      setOlympiads(olympiadData.olympiads);
      setOlympiadId(
        (current) => current || olympiadData.olympiads[0]?.id || "",
      );
      setInvitations(invitationData.invitations);
      setIsCoordinator(
        meData.user.school_memberships.some(
          (m) => m.role === "coordinator",
        ),
      );
    } catch {
      setToast({
        type: "error",
        message:
          "We couldn't load your invitations. Please refresh the page.",
      });
    }
  }

  useEffect(() => {
    loadInvitations();
  }, []);

  // ── Handlers ─────────────────────────────────────────────

  const handleRegisterEntrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !olympiadId) return;

    try {
      const result = await registerMutation.mutateAsync([
        {
          full_name: fullName.trim(),
          grade,
          external_ref: studentNumber.trim() || undefined,
        },
      ]);
      const rounds = result.entrants[0]?.rounds ?? [];
      setFullName("");
      setStudentNumber("");
      // Closed rounds, and rounds needing a pass they don't have, are skipped
      setSuccessMessage(
        rounds.length > 0
          ? `${fullName.trim()} has been registered for ${rounds.map((r) => r.name).join(", ")}.`
          : `${fullName.trim()} was saved, but isn't eligible for any open round yet.`,
      );
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      setToast({
        type: "error",
        message: (err as Error).message,
      });
    }
  };

  async function handleStudentInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    setSending(true);
    try {
      const result = await api.post<{
        code: string;
        emailDelivered: boolean;
      }>("/auth/invite-student", {
        email,
        olympiad_id: olympiadId,
      });
      setEmail("");
      setToast({
        type: "success",
        message: result.emailDelivered
          ? "Student invitation sent successfully."
          : `Invitation code ${result.code} was created, but email delivery is unavailable. Check the server email settings.`,
      });
      await loadInvitations();
    } catch {
      setToast({
        type: "error",
        message:
          "We couldn't send the student invitation. Check the email and Olympiad, then try again.",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleEducatorInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    setInvitingEducator(true);
    try {
      const result = await api.post<{ emailDelivered: boolean }>(
        "/auth/invite-educator",
        { email: educatorEmail, olympiad_id: olympiadId },
      );
      setEducatorEmail("");
      setToast({
        type: "success",
        message: result.emailDelivered
          ? "Educator invitation sent successfully."
          : "Educator invitation created. Email delivery is unavailable; check the server email settings.",
      });
    } catch {
      setToast({
        type: "error",
        message:
          "We couldn't invite that educator. Check the email and Olympiad, then try again.",
      });
    } finally {
      setInvitingEducator(false);
    }
  }

  // ── Render ───────────────────────────────────────────────

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
          title="Entrants & invitations"
          description="Invite students to create accounts, or register them for an olympiad. Progression to later rounds is automatic based on results."
        />

        {/* ── Shared olympiad selector ──────────────────────── */}
        <div className={styles.roundField}>
          <Label htmlFor="shared-olympiad">Olympiad</Label>
          <Select
            id="shared-olympiad"
            value={olympiadId}
            onChange={(e) => {
              setOlympiadId(e.target.value);
              setSuccessMessage("");
            }}
            required
            disabled={!olympiads.length}
          >
            {olympiads.length === 0 && (
              <option value="">No olympiads available</option>
            )}
            {olympiads.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>

        {/* ── Section 1: Invite students (creates accounts) ─── */}
        <Card className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Invite students</h2>
          <p className={styles.loading}>
            Send invitation codes so students can register, log in, and access
            their own dashboards.
          </p>
          <form className={styles.form} onSubmit={handleStudentInvite}>
            <div className={styles.field}>
              <Label htmlFor="student-email">
                Student email
                <span className={styles.required}> *</span>
              </Label>
              <Input
                id="student-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                required
              />
            </div>
            <Button
              icon={<Plus aria-hidden="true" />}
              type="submit"
              disabled={sending || !olympiadId}
            >
              {sending ? "Sending..." : "Send invitation"}
            </Button>
          </form>
        </Card>

        {/* ── Invite educator (coordinators only) ───────────── */}
        {isCoordinator && (
          <Card className={styles.formCard}>
            <h2 className={styles.sectionTitle}>Invite an educator</h2>
            <form className={styles.form} onSubmit={handleEducatorInvite}>
              <div className={styles.field}>
                <Label htmlFor="educator-email">Educator email</Label>
                <Input
                  id="educator-email"
                  type="email"
                  value={educatorEmail}
                  onChange={(e) => setEducatorEmail(e.target.value)}
                  placeholder="colleague@school.edu"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={invitingEducator || !olympiadId}
              >
                {invitingEducator ? "Sending..." : "Invite educator"}
              </Button>
            </form>
          </Card>
        )}

        {/* ── Invitation status list ────────────────────────── */}
        <Card
          className={styles.emptyCard}
          padded={false}
          aria-labelledby="invitations-heading"
        >
          <div className={styles.emptyHeader}>
            <h2 id="invitations-heading">
              Student invitations ({invitations.length})
            </h2>
          </div>
          {invitations.length === 0 ? (
            <p>No student invitations sent yet.</p>
          ) : (
            <ul className={styles.invitations}>
              {invitations.map((inv) => (
                <li key={inv.id}>
                  <span>
                    {inv.email || "Student"} · {inv.olympiadName}
                  </span>
                  <strong
                    className={
                      styles[
                        `status${inv.status[0].toUpperCase()}${inv.status.slice(1)}`
                      ]
                    }
                  >
                    {inv.status}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Section 2: Register for olympiad ──────────────── */}
        {olympiadId && (
          <>
            {/* Progression info — show if any rounds require qualification */}
            {progression?.rounds.some((r) => r.requiresQualification) && (
              <div
                className={styles.successNote}
                style={{
                  backgroundColor: "#fef3c7",
                  borderColor: "#f59e0b",
                }}
              >
                <span>
                  Some rounds in this olympiad require entrants to have
                  qualified from a previous round. Students who haven't
                  qualified will only be registered for earlier rounds — they
                  will be auto-enrolled in later rounds once they qualify.
                </span>
              </div>
            )}

            {successMessage && (
              <div className={styles.successNote}>
                <CheckCircle2 aria-hidden="true" />
                <span>{successMessage}</span>
              </div>
            )}

            <Card className={styles.formCard}>
              <h2 className={styles.sectionTitle}>
                Register entrant for olympiad
              </h2>
              <form
                className={styles.form}
                onSubmit={handleRegisterEntrant}
              >
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
                  <Label htmlFor="entrant-number">
                    Student number
                  </Label>
                  <Input
                    id="entrant-number"
                    value={studentNumber}
                    onChange={(e) =>
                      setStudentNumber(e.target.value)
                    }
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
            ) : olympiadEntrants && olympiadEntrants.length > 0 ? (
              <TablePanel
                title={`Registered entrants (${olympiadEntrants.length})`}
                minWidth="36rem"
              >
                <thead>
                  <tr>
                    <Th>Full name</Th>
                    <Th>Student no.</Th>
                    <Th>Grade</Th>
                    <Th>Rounds</Th>
                  </tr>
                </thead>
                <tbody>
                  {olympiadEntrants.map((ent: OlympiadEntrant) => (
                    <tr key={ent.id}>
                      <Td strong muted={false}>
                        {ent.full_name}
                      </Td>
                      <Td>{ent.external_ref ?? "—"}</Td>
                      <Td>{ent.grade ?? "—"}</Td>
                      <Td>
                        {ent.rounds.length > 0
                          ? ent.rounds.map((r) => r.name).join(", ")
                          : "—"}
                      </Td>
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
                <p>
                  No entrants registered for this olympiad yet.
                </p>
              </Card>
            )}
          </>
        )}
      </div>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </AppShell>
  );
}

export default Entrants;
