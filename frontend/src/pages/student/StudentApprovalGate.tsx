import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { logout } from '../../lib/session';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorAlert, LoadingIndicator } from '../../components/ui/Feedback';
import { friendlyErrorMessage } from '../../lib/feedback';

type Entrant = {
    status: 'active' | 'pending' | 'rejected' | 'removed';
    schools: { name: string };
};

// Wraps every student page. A student who signed up is "pending" until their
// school's coordinator approves them; until then they only see this notice.
export default function StudentApprovalGate() {
    const navigate = useNavigate();
    const [entrant, setEntrant] = useState<Entrant | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const { user } = await api.get<{ user: { entrants: Entrant | null } }>(
                '/me'
            );
            setEntrant(user?.entrants ?? null);
        } catch (err) {
            setError(
                friendlyErrorMessage(err, 'Unable to check your school approval.')
            );
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refresh();
    }, []);

    if (loading) {
        return <LoadingIndicator fullPage label="Checking school approval" />;
    }
    if (error) {
        return (
            <main style={{ padding: '3rem' }}>
                <ErrorAlert message={error} onRetry={() => void refresh()} />
            </main>
        );
    }
    // No entrant record or an approved one: nothing to gate
    if (!entrant || entrant.status === 'active') return <Outlet />;

    const rejected = entrant.status === 'rejected';
    return (
        <main style={{ maxWidth: 540, margin: '5rem auto', padding: '1rem' }}>
            <Card>
                <h1>
                    {rejected ? 'Request not approved' : 'Waiting for approval'}
                </h1>
                <p>
                    {entrant.schools?.name || 'Your school'}:{' '}
                    {rejected
                        ? 'Your coordinator did not approve your request. Contact your teacher or school coordinator for help.'
                        : 'Your account has been created. Your school coordinator must approve you before you can see rounds and results.'}
                </p>
                <div
                    style={{
                        display: 'flex',
                        gap: '.75rem',
                        marginTop: '1.25rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <Button onClick={() => void refresh()}>Check again</Button>
                    <Button
                        variant="outline"
                        onClick={async () => {
                            await logout();
                            navigate('/login', { replace: true });
                        }}
                    >
                        Log out
                    </Button>
                </div>
            </Card>
        </main>
    );
}
