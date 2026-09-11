import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { api } from "../../lib/api";

type OlympiadOption = { id: string; name: string };

type InviteSchoolFormProps = {
  olympiadId?: string;
  olympiads?: OlympiadOption[];
  initialOlympiadId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

type InvitationResponse = {
  code: string;
  emailDelivered: boolean;
};

export function InviteSchoolForm({
  olympiadId: olympiadIdProp,
  olympiads = [],
  initialOlympiadId,
  onSuccess,
  onCancel,
}: InviteSchoolFormProps) {
  const [olympiadId, setOlympiadId] = useState(
    olympiadIdProp || initialOlympiadId || olympiads[0]?.id || "",
  );
  const [schoolName, setSchoolName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!olympiadId) {
      setError("Select an olympiad before inviting a school.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.post<InvitationResponse>("/auth/invite-school", {
        school_name: schoolName.trim(),
        contact_email: contactEmail.trim(),
        olympiad_id: olympiadId,
      });

      setSuccessCode(result.code);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send the school invitation.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (successCode) {
    return (
      <Card padded>
        <h2 style={{ marginTop: 0 }}>School invitation created</h2>
        <p>
          The school is pending acceptance. It will become an approved
          participant after registration is completed.
        </p>
        <p>
          Invitation code: <strong>{successCode}</strong>
        </p>
        <Button onClick={onCancel}>Close</Button>
      </Card>
    );
  }

  return (
    <Card padded>
      <h2 style={{ marginTop: 0 }}>Invite school</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        {olympiads.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="invite-olympiad">Olympiad</label>
            <select
              id="invite-olympiad"
              value={olympiadId}
              onChange={(event) => setOlympiadId(event.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "0.5rem" }}
            >
              {olympiads.map((olympiad) => (
                <option key={olympiad.id} value={olympiad.id}>
                  {olympiad.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="invite-school-name">School name</label>
          <Input
            id="invite-school-name"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            placeholder="e.g. Parktown Boys High"
            required
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="invite-contact-email">Contact email</label>
          <Input
            id="invite-contact-email"
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="principal@school.edu"
            required
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send invitation"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
