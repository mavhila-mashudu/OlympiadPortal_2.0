import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorAlert, LoadingIndicator } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Select } from '../../components/ui/Select';
import { api } from '../../lib/api';
import { friendlyErrorMessage } from '../../lib/feedback';
import styles from './InviteEducators.module.css';

type Invitation = {
    id: string;
    email: string;
    role: 'coordinator' | 'educator' | null;
    accountType: 'educator' | 'student';
    status: 'pending' | 'used' | 'revoked' | 'expired';
    createdAt: string;
    expiresAt: string;
    school: { id: string; name: string } | null;
};

type School = { id: string; name: string };

type SendResult = {
    invitation: Invitation;
    emailSent: boolean;
    code?: string;
    signupUrl?: string;
};

const STATUS_LABEL: Record<Invitation['status'], string> = {
    pending: 'Waiting',
    used: 'Joined',
    revoked: 'Cancelled',
    expired: 'Expired',
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

// Organisers select a school for educator invitations. Active educators of
// either school role invite educators or students only to their own school.
export default function InviteEducators({
    mode,
}: {
    mode: 'organiser' | 'educator';
}) {
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [schools, setSchools] = useState<School[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    // Shown only when the email could not be delivered, so it can be passed on by hand
    const [manual, setManual] = useState<{ code: string; url: string } | null>(
        null
    );
    const [email, setEmail] = useState('');
    const [accountType, setAccountType] = useState<'educator' | 'student'>('educator');
    const [schoolId, setSchoolId] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await api.get<{ invitations: Invitation[] }>(
                '/school-invitations'
            );
            setInvitations(data.invitations);
        } catch (err) {
            setError(
                friendlyErrorMessage(err, 'Unable to load invitations.')
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (mode !== 'organiser') return;
        api.get<{ schools: School[] }>('/auth/schools')
            .then((data) => setSchools(data.schools || []))
            .catch(() =>
                setError('We couldn’t load the list of schools.')
            );
    }, [mode]);

    async function send(event: FormEvent) {
        event.preventDefault();
        setSending(true);
        setError(null);
        setNotice(null);
        setManual(null);
        try {
            const result = await api.post<SendResult>('/school-invitations', {
                email: email.trim(),
                account_type: mode === 'organiser' ? 'educator' : accountType,
                school_id: mode === 'organiser' ? schoolId : undefined,
            });
            if (result.emailSent) {
                setNotice(`Invitation sent to ${result.invitation.email}.`);
            } else if (result.code && result.signupUrl) {
                setNotice(
                    `The invitation for ${result.invitation.email} was created, but the email could not be sent. Pass the code and link on yourself:`
                );
                setManual({ code: result.code, url: result.signupUrl });
            }
            setEmail('');
            await load();
        } catch (err) {
            setError(
                friendlyErrorMessage(err, 'Unable to send the invitation.')
            );
        } finally {
            setSending(false);
        }
    }

    async function revoke(invitation: Invitation) {
        setBusyId(invitation.id);
        setError(null);
        try {
            await api.delete(`/school-invitations/${invitation.id}`);
            await load();
        } catch (err) {
            setError(
                friendlyErrorMessage(err, 'Unable to cancel the invitation.')
            );
        } finally {
            setBusyId(null);
        }
    }

    return (
        <Card>
            <div className={styles.section}>
                <header>
                    <h2>{mode === 'organiser' ? 'Invite an educator' : 'Invite educators or students'}</h2>
                    <p>
                        They get an email with a code and a signup link.
                        Signing up with that email address and the code gives
                        access straight away. Anyone can still sign up without
                        a code and wait for approval.
                    </p>
                </header>

                {error && (
                    <ErrorAlert
                        message={error}
                        onDismiss={() => setError(null)}
                    />
                )}

                <form className={styles.form} onSubmit={send}>
                    {mode === 'educator' && (
                        <div className={styles.field}>
                            <Label htmlFor="invite-account-type">Invite</Label>
                            <Select id="invite-account-type" value={accountType}
                                onChange={(event) => setAccountType(event.target.value as 'educator' | 'student')}>
                                <option value="educator">Educator</option>
                                <option value="student">Student</option>
                            </Select>
                        </div>
                    )}
                    {mode === 'organiser' && (
                        <div className={styles.field}>
                            <Label htmlFor="invite-school">School</Label>
                            <Select
                                id="invite-school"
                                required
                                value={schoolId}
                                onChange={(event) =>
                                    setSchoolId(event.target.value)
                                }
                            >
                                <option value="">Select a school…</option>
                                {schools.map((school) => (
                                    <option key={school.id} value={school.id}>
                                        {school.name}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}
                    <div className={styles.field}>
                        <Label htmlFor="invite-email">Email address</Label>
                        <Input
                            id="invite-email"
                            placeholder="educator@school.co.za"
                            required
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </div>
                    <Button disabled={sending} type="submit">
                        {sending ? 'Sending…' : 'Send invitation'}
                    </Button>
                </form>

                {notice && <p role="status">{notice}</p>}
                {manual && (
                    <div className={styles.manual}>
                        <p>
                            Code: <strong>{manual.code}</strong>
                        </p>
                        <p>
                            Link: <code>{manual.url}</code>
                        </p>
                    </div>
                )}

                <h3>Invitations sent</h3>
                {loading ? (
                    <LoadingIndicator label="Loading invitations" />
                ) : invitations.length === 0 ? (
                    <p>No invitations sent yet.</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    {mode === 'organiser' && <th>School</th>}
                                    <th>Status</th>
                                    <th>Sent</th>
                                    <th>Expires</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {invitations.map((invitation) => (
                                    <tr key={invitation.id}>
                                        <td>
                                            {invitation.email}
                                            <small> · {invitation.accountType}</small>
                                            {invitation.role === 'coordinator' && (
                                                <small> · as coordinator</small>
                                            )}
                                        </td>
                                        {mode === 'organiser' && (
                                            <td>{invitation.school?.name}</td>
                                        )}
                                        <td>{STATUS_LABEL[invitation.status]}</td>
                                        <td>{formatDate(invitation.createdAt)}</td>
                                        <td>
                                            {invitation.status === 'pending'
                                                ? formatDate(invitation.expiresAt)
                                                : '—'}
                                        </td>
                                        <td>
                                            {invitation.status === 'pending' && (
                                                <Button
                                                    disabled={busyId !== null}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        void revoke(invitation)
                                                    }
                                                >
                                                    Cancel
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Card>
    );
}
