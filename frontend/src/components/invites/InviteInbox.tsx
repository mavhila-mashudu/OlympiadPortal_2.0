import { Mail } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { api } from '../../lib/api';
import styles from './InviteInbox.module.css';

export type Invite = {
    id: string;
    role: 'educator' | 'student';
    status: 'pending' | 'accepted' | 'rejected';
    message: string | null;
    createdAt: string;
    olympiad: { id: string; name: string } | null;
    school: { id: string; name: string } | null;
    invitedBy: { id: string; name: string; email: string } | null;
};

type InviteInboxProps = {
    /** Called after an invite is accepted, so the page can reload what it shows. */
    onAccepted?: () => void;
};

/**
 * The invitations addressed to the signed-in user. Invites are delivered
 * in-app rather than by email: accepting one adds the olympiad to this
 * dashboard, rejecting it clears the notification.
 */
export function InviteInbox({ onAccepted }: InviteInboxProps) {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await api.get<{ invites: Invite[] }>('/invites/mine');
            setInvites(data.invites || []);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "We couldn't load your invitations."
            );
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function respond(invite: Invite, accept: boolean) {
        setBusyId(invite.id);
        setError(null);
        try {
            await api.post(
                `/invites/${invite.id}/${accept ? 'accept' : 'reject'}`
            );
            await load();
            if (accept) onAccepted?.();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "We couldn't record your answer. Please try again."
            );
        } finally {
            setBusyId(null);
        }
    }

    const pending = invites.filter((invite) => invite.status === 'pending');

    // Answered invites are kept out of the way; an empty inbox shows nothing at
    // all rather than an empty card on every dashboard.
    if (pending.length === 0 && !error) return null;

    return (
        <Card className={styles.card} padded>
            <div className={styles.header}>
                <Mail aria-hidden="true" size={18} />
                <h2>Invitations ({pending.length})</h2>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <ul className={styles.list}>
                {pending.map((invite) => (
                    <li className={styles.item} key={invite.id}>
                        <div className={styles.details}>
                            <strong>
                                {invite.olympiad?.name || 'An olympiad'}
                            </strong>
                            <span className={styles.meta}>
                                Invited by{' '}
                                {invite.invitedBy?.name || 'an organiser'}
                                {invite.school
                                    ? ` · ${invite.school.name}`
                                    : ''}
                            </span>
                            {invite.message && (
                                <p className={styles.message}>
                                    {invite.message}
                                </p>
                            )}
                            <span className={styles.meta}>
                                {invite.role === 'educator'
                                    ? 'Accepting registers your school for this olympiad.'
                                    : "Accepting enters you into this olympiad's rounds."}
                            </span>
                        </div>
                        <div className={styles.actions}>
                            <Button
                                disabled={busyId === invite.id}
                                onClick={() => respond(invite, true)}
                                type="button"
                            >
                                Accept
                            </Button>
                            <Button
                                disabled={busyId === invite.id}
                                onClick={() => respond(invite, false)}
                                type="button"
                                variant="outline"
                            >
                                Decline
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export default InviteInbox;
