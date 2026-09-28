import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { api } from "../../lib/api";
import styles from "./InviteEducatorForm.module.css";

type OlympiadOption = { id: string; name: string };

type Candidate = {
  id: string;
  name: string;
  email: string;
  school: { id: string; name: string } | null;
};

type InviteEducatorFormProps = {
  olympiadId?: string;
  olympiads?: OlympiadOption[];
  initialOlympiadId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

/** Shows the invite form centred over a dimmed page; Escape closes it. */
export function InviteEducatorDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <div aria-label="Invite an educator" aria-modal="true" className={styles.dialog} role="dialog">
        {children}
      </div>
    </div>
  );
}

/**
 * Invites an educator who is already on the platform. The invitation appears
 * on their dashboard; when they accept, their school joins the olympiad.
 */
export function InviteEducatorForm({
  olympiadId: olympiadIdProp,
  olympiads = [],
  initialOlympiadId,
  onSuccess,
  onCancel,
}: InviteEducatorFormProps) {
  const [olympiadId, setOlympiadId] = useState(
    olympiadIdProp || initialOlympiadId || olympiads[0]?.id || "",
  );
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [inviteeId, setInviteeId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!olympiadId) return;
    let cancelled = false;

    setLoadingCandidates(true);
    setInviteeId("");
    api
      .get<{ candidates: Candidate[] }>(`/invites/candidates?olympiad_id=${olympiadId}`)
      .then((data) => {
        if (!cancelled) setCandidates(data.candidates || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load educators.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCandidates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [olympiadId]);

  const term = search.trim().toLowerCase();
  const visible = term
    ? candidates.filter((candidate) =>
        [candidate.name, candidate.email, candidate.school?.name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : candidates;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!olympiadId) {
      setError("Select an olympiad before sending an invitation.");
      return;
    }
    if (!inviteeId) {
      setError("Choose the educator you want to invite.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/invites", {
        olympiad_id: olympiadId,
        invitee_id: inviteeId,
        message: message.trim() || undefined,
      });

      setSentTo(candidates.find((candidate) => candidate.id === inviteeId)?.name || "the educator");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the invitation.");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <Card padded>
        <h2 className={styles.heading}>Invitation sent</h2>
        <p className={styles.subtitle}>
          {sentTo} will see this invitation on their dashboard. Their school joins the
          olympiad as soon as they accept it.
        </p>
        <div className={styles.actions}>
          <Button onClick={onCancel}>Close</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card padded>
      <h2 className={styles.heading}>Invite an educator</h2>
      <p className={styles.subtitle}>
        Educators sign up on their own. Pick one below to invite their school to this
        olympiad.
      </p>
      {error && <p className={styles.error}>{error}</p>}

      <form onSubmit={handleSubmit}>
        {olympiads.length > 0 && (
          <div className={styles.field}>
            <label htmlFor="invite-olympiad">Olympiad</label>
            <select
              className={styles.control}
              id="invite-olympiad"
              value={olympiadId}
              onChange={(event) => setOlympiadId(event.target.value)}
              required
            >
              {olympiads.map((olympiad) => (
                <option key={olympiad.id} value={olympiad.id}>
                  {olympiad.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="invite-search">Find an educator</label>
          <input
            className={styles.control}
            id="invite-search"
            type="search"
            placeholder="Search by name, email or school"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="invite-educator">Educator</label>
          <select
            className={styles.control}
            id="invite-educator"
            value={inviteeId}
            onChange={(event) => setInviteeId(event.target.value)}
            required
            size={Math.min(Math.max(visible.length, 2), 6)}
          >
            {visible.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} — {candidate.school?.name || "No school"} ({candidate.email})
              </option>
            ))}
          </select>
          {loadingCandidates && <small className={styles.hint}>Loading educators…</small>}
          {!loadingCandidates && visible.length === 0 && (
            <small className={styles.hint}>
              {candidates.length === 0
                ? "Every educator on the platform has already been invited to this olympiad."
                : "No educator matches that search."}
            </small>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="invite-message">Message (optional)</label>
          <textarea
            className={styles.control}
            id="invite-message"
            rows={3}
            maxLength={500}
            placeholder="Anything the educator should know before accepting"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>

        <div className={styles.actions}>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={loading || !inviteeId}>
            {loading ? "Sending..." : "Send invitation"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default InviteEducatorForm;
