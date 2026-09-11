<<<<<<< HEAD
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { api } from "../../lib/api";

type InviteSchoolFormProps = {
  olympiadId: string;
=======
import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Toast } from '../../components/ui/Toast';

interface InviteSchoolFormProps {
  olympiads: { id: string; name: string }[];
  initialOlympiadId: string;
  onCancel: () => void;
>>>>>>> 4f13afc40b40ec00ba13b06a5dec057149eed48d
  onSuccess?: () => void;
  onCancel?: () => void;
};

<<<<<<< HEAD
export function InviteSchoolForm({
  olympiadId,
  onSuccess,
  onCancel,
}: InviteSchoolFormProps) {
  const [schoolName, setSchoolName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
=======
export function InviteSchoolForm({ olympiads, initialOlympiadId, onCancel, onSuccess }: InviteSchoolFormProps) {
  const [schoolName, setSchoolName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [olympiadId, setOlympiadId] = useState(initialOlympiadId);
>>>>>>> 4f13afc40b40ec00ba13b06a5dec057149eed48d
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
<<<<<<< HEAD
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
=======
      const data: any = await api.post('/auth/invite-school', {
        school_name: schoolName,
        contact_email: contactEmail,
        olympiad_id: olympiadId,
      });

      setStatusMessage({
        type: 'success',
        text: data.emailDelivered
          ? `Invitation code (${data.code}) sent to ${contactEmail}!`
          : `Invitation code (${data.code}) created. SMTP is not configured, so the registration link was logged by the server.`,
      });

      setSchoolName('');
      setContactEmail('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      const errorMessage = err.message?.includes("not found")
        ? "This Olympiad is no longer available. Close this form and try again."
        : "We couldn’t send the school invitation. Please check the details and try again.";
      setStatusMessage({ type: 'error', text: errorMessage });
>>>>>>> 4f13afc40b40ec00ba13b06a5dec057149eed48d
    } finally {
      setLoading(false);
    }
  }

  return (
<<<<<<< HEAD
    <Card padded>
      <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>Invite School</h2>
      {error && (
        <p style={{ color: "red", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {error}
        </p>
      )}
=======
    <div role="dialog" aria-modal="true" aria-labelledby="invite-school-title" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', padding: '1rem', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
    <div style={{ width: 'min(100%, 500px)', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
      <h3 id="invite-school-title" style={{ marginTop: 0, marginBottom: '16px' }}>Invite School & Educator</h3>
>>>>>>> 4f13afc40b40ec00ba13b06a5dec057149eed48d

      {successCode ? (
        <div>
<<<<<<< HEAD
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
=======
          <label htmlFor="olympiad" style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>
            Olympiad *
          </label>
          <select id="olympiad" required value={olympiadId} onChange={(e) => setOlympiadId(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc' }}>
            {olympiads.map((olympiad) => <option key={olympiad.id} value={olympiad.id}>{olympiad.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="schoolName" style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>
            School Name *
          </label>
          <input
            id="schoolName"
            type="text"
            required
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="e.g., Wits High School"
            style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div>
          <label htmlFor="contactEmail" style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>
            Contact Person's Email (Educator) *
          </label>
          <input
            id="contactEmail"
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="e.g., educator@witshigh.ac.za"
            style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        {statusMessage && (
          <Toast type={statusMessage.type} message={statusMessage.text} onDismiss={() => setStatusMessage(null)} />
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onCancel} disabled={loading} style={{ padding: '10px 16px', backgroundColor: '#fff', color: '#1f2937', border: '1px solid #d1d5db', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
          <button
            type="submit"
            disabled={loading}
            style={{
            padding: '10px 16px',
            backgroundColor: '#3182ce',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
          >
            {loading ? 'Sending Invitation...' : 'Send Invitation'}
          </button>
        </div>
      </form>
    </div>
    </div>
>>>>>>> 4f13afc40b40ec00ba13b06a5dec057149eed48d
  );
}
