import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import styles from './ApprovalGate.module.css';

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
        <aside aria-label="Registration updates" className={styles.update}>
            {notices.map((notice) => (
                <div key={notice.id}>
                    <strong>{notice.title}</strong>
                    <p>{notice.body}</p>
                </div>
            ))}
        </aside>
    );
}
