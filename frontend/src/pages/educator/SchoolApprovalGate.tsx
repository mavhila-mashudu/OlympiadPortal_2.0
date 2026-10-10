import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../../lib/session';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorAlert, LoadingIndicator } from '../../components/ui/Feedback';
import { friendlyErrorMessage } from '../../lib/feedback';
import EducatorDashboard from './Dashboard';

type Membership = { status: 'active' | 'pending' | 'rejected' | 'removed'; schools: { name: string } };
export default function SchoolApprovalGate() {
    const navigate = useNavigate();
    const [membership, setMembership] = useState<Membership | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const { user } = await api.get<{ user: { school_memberships: Membership[] } }>('/auth/me');
            const memberships = user?.school_memberships;
            if (!Array.isArray(memberships)) {
                throw new Error('School membership information is unavailable.');
            }
            setMembership(memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null);
        } catch (err) {
            setError(friendlyErrorMessage(err, 'Unable to check your school membership.'));
        } finally { setLoading(false); }
    }
    useEffect(() => { void refresh(); }, []);
    if (loading) return <LoadingIndicator fullPage label="Checking school membership" />;
    if (error) return <main style={{ padding: '3rem' }}><ErrorAlert message={error} onRetry={() => void refresh()} /></main>;
    if (membership?.status === 'active') return <EducatorDashboard />;
    return <main style={{ maxWidth: 540, margin: '5rem auto', padding: '1rem' }}>
        <Card><h1>{membership?.status === 'rejected' ? 'School membership not approved' : 'School approval pending'}</h1>
            <p>{membership?.schools?.name || 'Your school'}: {membership?.status === 'rejected' ? 'Your request was rejected. Contact the Olympiad organiser or a school coordinator for assistance.' : 'Your account has been created. An authorised organiser or school coordinator must approve your school membership before you can access school information.'}</p>
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <Button onClick={() => void refresh()}>Check again</Button>
                <Button variant="outline" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>Log out</Button>
            </div>
        </Card>
    </main>;
}
