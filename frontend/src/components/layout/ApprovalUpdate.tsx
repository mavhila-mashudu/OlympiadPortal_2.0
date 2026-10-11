import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Notice = { id: string; dedupe_key?: string; title: string; body: string };

// Pending/rejected users do not mount AppShell. They can still read their own
// approval outcome, via the same authenticated, user-scoped notifications API.
export function ApprovalUpdate() {
    const [notices, setNotices] = useState<Notice[]>([]);
    useEffect(() => {
        let active = true;
        api.get<{ notifications: Notice[] }>('/me/notifications', { background: true })
            .then(({ notifications }) => {
                if (active) setNotices(notifications.filter((n) =>
                    n.dedupe_key?.startsWith('account:approval:')
                ).slice(0, 1));
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);
    if (!notices.length) return null;
    return (
        <aside aria-label="Registration updates" style={{
            marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '0.75rem',
            background: 'var(--muted)', color: 'var(--foreground)',
        }}>
            {notices.map((notice) => (
                <div key={notice.id}>
                    <strong>{notice.title}</strong>
                    <p style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>{notice.body}</p>
                </div>
            ))}
        </aside>
    );
}
