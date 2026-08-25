import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { api } from "../../lib/api";

type InviteSchoolFormProps = {
  olympiadId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function InviteSchoolForm({
  olympiadId,
  onSuccess,
  onCancel,
}: InviteSchoolFormProps) {
  const [schoolName, setSchoolName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolName || !contactEmail) {
      setError("Please fill in both the school name and contact email.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{
        success: boolean;
        invitationCode: string;
      }>(`/olympiads/${olympiadId}/invite-school`, {
        schoolName,
        contactEmail,
      });

      setSuccessCode(res.invitationCode);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send invitation code."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padded>
      <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>Invite School</h2>
      {error && (
        <p style={{ color: "red", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {successCode ? (
        <div>
          <p style={{ color: "green", fontWeight: 600 }}>
            Invitation sent successfully!
          </p>
          <p style={{ marginBottom: "1.5rem" }}>
            Invitation Code: <strong>{successCode}</strong>
          </p>
          <Button onClick={onCancel}>Close</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="schoolName"
              style={{ display: "block", marginBottom: "0.25rem" }}
            >
              School Name
            </label>
            <input
              id="schoolName"
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. Parktown Boys High"
              required
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="contactEmail"
              style={{ display: "block", marginBottom: "0.25rem" }}
            >
              Principal / Contact Email
            </label>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="e.g. principal@parktown.co.za"
              required
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}