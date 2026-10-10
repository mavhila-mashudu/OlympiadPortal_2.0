import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorAlert, LoadingIndicator } from '../../components/ui/Feedback';
import { Select } from '../../components/ui/Select';
import InviteEducators from './InviteEducators';
import { api } from '../../lib/api';
import { friendlyErrorMessage } from '../../lib/feedback';
import { educatorNav, organiserNav } from '../../lib/mockData';
import styles from './MembershipRequests.module.css';

type Candidate = {
    id: string;
    full_name: string;
    grade: string | null;
    external_ref: string | null;
};

type Membership = {
    id: string;
    // Educator requests are school memberships; student requests are entrants
    kind?: 'educator' | 'student';
    // Entrants an educator already listed under this student's name
    candidates?: Candidate[];
    role: string;
    status: string;
    created_at: string;
    users: { full_name: string; email: string };
    schools: { name: string };
};

export default function MembershipRequests({ mode }: { mode: 'organiser' | 'educator' }) {
    const [requests, setRequests] = useState<Membership[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    // For each student request, the listed record the coordinator chose ('' = none)
    const [links, setLinks] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(async () => {
        setError(null);
        try {
            const { requests: pending } = await api.get<{requests: Membership[]}>('/memberships/requests');
            setRequests(pending);
            // One listed student with this name is the likely match, so it starts
            // selected; with several, the coordinator has to choose.
            setLinks(Object.fromEntries(pending
                .filter((r) => r.kind === 'student')
                .map((r) => [r.id, r.candidates?.length === 1 ? r.candidates[0].id : ''])));
        } catch (err) {
            setError(friendlyErrorMessage(err, 'Unable to load membership requests.'));
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    async function decide(request: Membership, decision: 'approve' | 'reject') {
        const id = request.id;
        setBusy(id);
        setError(null);
        try {
            const path = request.kind === 'student' ? 'student-requests' : 'requests';
            await api.patch(`/memberships/${path}/${id}`, {
                decision,
                link_entrant_id: request.kind === 'student' && decision === 'approve'
                    ? links[id] || null : undefined,
            });
            await load();
        } catch (err) {
            setError(friendlyErrorMessage(err, 'Unable to update this membership.'));
        } finally { setBusy(null); }
    }

    return <AppShell activeRole={mode} navItems={mode === 'organiser' ? organiserNav : educatorNav}
        organisation={mode === 'organiser' ? 'Olympiad Office' : 'Your school'}
        portalLabel={mode === 'organiser' ? 'Organiser console' : 'Educator portal'}>
        <div className={styles.stack}>
            <header><h1>{mode === 'organiser' ? 'Educator approvals' : 'School members'}</h1>
                <p>{mode === 'organiser' ? 'Verify the first coordinator of each school.' : 'Review educators and students requesting to join your school.'}</p>
            </header>
            {mode === 'organiser' && <InviteEducators mode={mode} />}
            {error && <ErrorAlert message={error} onRetry={() => void load()} />}
            {loading ? <LoadingIndicator label="Loading membership requests" /> : requests.length === 0 ?
                <Card><p>No pending requests.</p></Card> : requests.map((request) =>
                    <Card key={request.id}>
                        <div className={styles.request}>
                            <div><h2>{request.users.full_name}</h2>
                                <p>{request.users.email}</p>
                                <p>{request.schools.name} · {request.kind === 'student' ? 'Student request' : request.role === 'coordinator' ? 'First school coordinator request' : 'Educator request'}</p>
                                {request.kind === 'student' && !!request.candidates?.length &&
                                    <div className={styles.link}>
                                        <label htmlFor={`link-${request.id}`}>A student with this name is already on your school’s list. Is this the same person?</label>
                                        <Select id={`link-${request.id}`} value={links[request.id] ?? ''}
                                            onChange={(event) => setLinks((current) => ({ ...current, [request.id]: event.target.value }))}>
                                            <option value="">No, a different student (add as new)</option>
                                            {request.candidates.map((candidate) =>
                                                <option key={candidate.id} value={candidate.id}>
                                                    Yes: {candidate.full_name}{candidate.grade ? ` · Grade ${candidate.grade}` : ''}{candidate.external_ref ? ` · ${candidate.external_ref}` : ''}
                                                </option>)}
                                        </Select>
                                    </div>}
                            </div>
                            <div className={styles.actions}>
                                <Button disabled={busy !== null} onClick={() => void decide(request, 'approve')}>Approve</Button>
                                <Button disabled={busy !== null} variant="outline" onClick={() => void decide(request, 'reject')}>Reject</Button>
                            </div>
                        </div>
                    </Card>
                )}
        </div>
    </AppShell>;
}
