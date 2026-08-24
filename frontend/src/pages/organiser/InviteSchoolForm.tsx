import React, { useState } from 'react';
import { api } from '../../lib/api';

interface InviteSchoolFormProps {
  olympiadId: string;
  onSuccess?: () => void;
}

export function InviteSchoolForm({ olympiadId, onSuccess }: InviteSchoolFormProps) {
  const [schoolName, setSchoolName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    try {
      const data: any = await api.post(`/olympiads/${olympiadId}/invite-school`, {
        schoolName,
        contactEmail,
      });

      setStatusMessage({
        type: 'success',
        text: `Invitation code (${data.invitationCode}) sent to ${contactEmail}!`,
      });

      setSchoolName('');
      setContactEmail('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to send invitation.';
      setStatusMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', maxWidth: '500px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Invite School & Educator</h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: statusMessage.type === 'success' ? '#e6fffa' : '#fff5f5',
              color: statusMessage.type === 'success' ? '#234e52' : '#9b2c2c',
              border: `1px solid ${statusMessage.type === 'success' ? '#b2f5ea' : '#feb2b2'}`,
            }}
          >
            {statusMessage.text}
          </div>
        )}

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
      </form>
    </div>
  );
}