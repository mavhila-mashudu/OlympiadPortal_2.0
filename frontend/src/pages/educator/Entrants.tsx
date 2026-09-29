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
// Students sign up on their own; an invitation is an in-app request to join
// one of this school's olympiads, which the student accepts or declines.
type Olympiad = { id: string; name: string };
type Candidate = { id: string; name: string; email: string };
type Invitation = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  olympiad: { id: string; name: string } | null;
  invitee: { id: string; name: string; email: string } | null;
};

function Entrants() {
  // ── Olympiad / rounds data ─────────────────────────────────
  const { data: roundsData } = useEducatorRounds();
  const schoolName = roundsData?.school?.name ?? "Your school";

  // ── Invitation state ─────────────────────────────────────
  const [olympiads, setOlympiads] = useState<Olympiad[]>([]);
  const [olympiadId, setOlympiadId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [inviteeId, setInviteeId] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [sending, setSending] = useState(false);

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
      const [olympiadData, invitationData] = await Promise.all([
        api.get<{ olympiads: Olympiad[] }>("/auth/educator-olympiads"),
        api.get<{ invites: Invitation[] }>("/invites/sent"),
      ]);
      setOlympiads(olympiadData.olympiads);
      setOlympiadId(
        (current) => current || olympiadData.olympiads[0]?.id || "",
      );
      setInvitations(invitationData.invites);
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

  // Only students of this school who have not been invited to the selected
  // olympiad yet can be picked.
  useEffect(() => {
    if (!olympiadId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;

    api
      .get<{ candidates: Candidate[] }>(
        `/invites/candidates?olympiad_id=${olympiadId}`,
      )
      .then((data) => {
        if (!cancelled) {
          setCandidates(data.candidates || []);
          setInviteeId("");
        }
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [olympiadId]);

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
      await api.post("/invites", {
        olympiad_id: olympiadId,
        invitee_id: inviteeId,
        message: inviteMessage.trim() || undefined,
      });
      const invited = candidates.find((c) => c.id === inviteeId);
      setInviteeId("");
      setInviteMessage("");
      setCandidates((current) => current.filter((c) => c.id !== invited?.id));
      setToast({
        type: "success",
        message: `${invited?.name || "The student"} will see this invitation on their dashboard.`,
      });
      await loadInvitations();
    } catch (err) {
      setToast({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "We couldn't send the invitation. Please try again.",
      });
    } finally {
      setSending(false);
    }
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <AppShell
      activeRole="educator"
      navItems={educatorNav}
      organisation={schoolName}
      portalLabel="Educator portal"


    >
      <div className={styles.stack}>
        <PageHeader
          title="Entrants & invitations"
          description="Invite students who already have an account, or add entrants yourself. Progression to later rounds is automatic based on results."
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

        {/* ── Section 1: Invite students to this olympiad ──── */}
        <Card className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Invite students</h2>
          <p className={styles.loading}>
            Students at {schoolName} sign up on their own. Invite one here and the
            request appears on their dashboard; accepting enters them into this
            olympiad.
          </p>
          <form className={styles.form} onSubmit={handleStudentInvite}>
            <div className={styles.field}>
              <Label htmlFor="student-invitee">
                Student
                <span className={styles.required}> *</span>
              </Label>
              <Select
                id="student-invitee"
                value={inviteeId}
                onChange={(e) => setInviteeId(e.target.value)}
                required
                disabled={!olympiadId || candidates.length === 0}
              >
                <option value="">
                  {candidates.length === 0
                    ? "No students left to invite"
                    : "Select a student…"}
                </option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.email})
                  </option>
                ))}
              </Select>
            </div>
            <div className={styles.field}>
              <Label htmlFor="invite-note">Message (optional)</Label>
              <Input
                id="invite-note"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Anything they should know before accepting"
                maxLength={500}
              />
            </div>
            <Button
              icon={<Plus aria-hidden="true" />}
              type="submit"
              disabled={sending || !olympiadId || !inviteeId}
            >
              {sending ? "Sending..." : "Send invitation"}
            </Button>
          </form>
        </Card>

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
                    {inv.invitee?.name || "Student"} ·{" "}
                    {inv.olympiad?.name || "Olympiad"}
                  </span>
                  <strong
                    className={
                      styles[
                        `status${inv.status[0].toUpperCase()}${inv.status.slice(1)}`
                      ]
                    }
                  >
                    {inv.status === "rejected" ? "declined" : inv.status}
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
