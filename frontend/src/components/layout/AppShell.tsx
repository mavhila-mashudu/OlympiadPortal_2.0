import {
    Bell,
    GraduationCap,
    LogOut,
    Menu,
    Trash2,
    Trophy,
    type LucideIcon,
} from 'lucide-react';
import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useCurrentUser } from '../../lib/currentUser';
import {
    getOlympiads,
    pickCurrentOlympiad,
    selectOlympiad,
    useOlympiadsVersion,
    type Olympiad,
} from '../../lib/olympiad';
import { endLocalSession, logout } from '../../lib/session';
import type { NavItem } from '../../lib/mockData';
import { Button } from '../ui/Button';
import { ErrorAlert } from '../ui/Feedback';
import { friendlyErrorMessage } from '../../lib/feedback';
import styles from './AppShell.module.css';

type Role = 'organiser' | 'educator' | 'student';

type AppShellProps = {
    activeRole: Role;
    children: React.ReactNode;
    navItems: NavItem[];
    // Shown under "Olympiad Portal": the educator's or student's school.
    // Organisers see their olympiad switcher instead.
    organisation: string;
    portalLabel: string;
};

const ROLE_NAMES: Record<Role, string> = {
    organiser: 'Organiser',
    educator: 'Educator',
    student: 'Student',
};

// Whether the sidebar is collapsed to icons is a preference of this device
const COLLAPSED_KEY = 'op_sidebar_collapsed';
const readCollapsed = () => {
    try {
        return localStorage.getItem(COLLAPSED_KEY) === 'true';
    } catch {
        return false;
    }
};

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
    return <Icon aria-hidden="true" />;
}

// The olympiad an organiser is working on. Every organiser page shows the
// one chosen here, and reloads when it changes.
function OlympiadSwitcher() {
    const version = useOlympiadsVersion();
    const [olympiads, setOlympiads] = useState<Olympiad[]>([]);

    useEffect(() => {
        let active = true;
        getOlympiads()
            .then((list) => {
                if (active) setOlympiads(list);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [version]);

    const current = pickCurrentOlympiad(olympiads);
    if (!current) return null;
    return (
        <label className={styles.switcher}>
            <span>Current olympiad</span>
            <select
                value={current.id}
                onChange={(event) => selectOlympiad(event.target.value)}
            >
                {olympiads.map((olympiad) => (
                    <option key={olympiad.id} value={olympiad.id}>
                        {olympiad.name}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function AppShell({
    activeRole,
    children,
    navItems,
    organisation,
    portalLabel,
}: AppShellProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const user = useCurrentUser();
    const roleName = ROLE_NAMES[activeRole];
    const [isCoordinator, setIsCoordinator] = useState(false);
    useEffect(() => {
        if (activeRole !== 'educator') return;
        let active = true;
        api.get<{ user: { school_memberships: { role: string; status: string }[] } }>('/auth/me', { background: true })
            .then(({ user }) => {
                if (active) setIsCoordinator(user.school_memberships.some(
                    (m) => m.role === 'coordinator' && m.status === 'active'
                ));
            })
            .catch(() => { if (active) setIsCoordinator(false); });
        return () => { active = false; };
    }, [activeRole]);

    const [collapsed, setCollapsed] = useState(readCollapsed);
    const toggleCollapsed = () => {
        setCollapsed((was) => {
            try {
                localStorage.setItem(COLLAPSED_KEY, String(!was));
            } catch {
                // Storage unavailable: the choice lasts for this page only
            }
            return !was;
        });
    };

    // On small screens the sidebar opens over the page, and closes on navigating
    const [mobileOpen, setMobileOpen] = useState(false);
    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);
    // Read the context directly so the shell also renders without a provider
    const queryClient = useContext(QueryClientContext);

    const [notifications, setNotifications] = useState<
        { id: string; title: string; body: string; read_at: string | null }[]
    >([]);
    const [showNotifications, setShowNotifications] = useState(false);
    useEffect(() => {
        let active = true;
        const refresh = () =>
            api
                .get<{ notifications: typeof notifications }>('/notifications')
                .then((data) => {
                    if (active) setNotifications(data.notifications);
                })
                .catch(() => {});
        refresh();
        const timer = setInterval(refresh, 60_000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [loggingOut, setLoggingOut] = useState(false);

    // Deleting the account removes the login from Supabase, so the server has
    // already ended the session; this device just forgets it
    const handleDeleteAccount = async () => {
        setDeleting(true);
        setDeleteError(null);
        try {
            await api.delete('/auth/account');
            await endLocalSession();
            queryClient?.clear();
            navigate('/login', { replace: true });
        } catch (err) {
            setDeleteError(
                friendlyErrorMessage(
                    err,
                    'We couldn’t delete your account. Please try again.'
                )
            );
            setDeleting(false);
        }
    };

    // The server ends the session before the page is left; the login page then
    // replaces this one, and the pages behind it need a session to show
    const handleLogout = async () => {
        setLoggingOut(true);
        await logout();
        // Drop cached API data so the next user starts clean
        queryClient?.clear();
        navigate('/login', { replace: true });
    };

    return (
        <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
            <aside
                className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`}
                id="app-sidebar"
            >
                <div className={styles.sidebarInner}>
                    {/* The logo shows or hides the labels; when hidden, only icons remain */}
                    <button
                        aria-controls="app-sidebar"
                        aria-expanded={!collapsed}
                        aria-label={
                            collapsed ? 'Expand sidebar' : 'Collapse sidebar'
                        }
                        className={styles.brand}
                        onClick={toggleCollapsed}
                        title={
                            collapsed ? 'Expand sidebar' : 'Collapse sidebar'
                        }
                        type="button"
                    >
                        <span className={styles.brandMark}>
                            <Trophy aria-hidden="true" />
                        </span>
                        <span
                            className={`${styles.brandText} ${styles.expandedOnly}`}
                        >
                            <span>Olympiad Portal</span>
                            {activeRole !== 'organiser' && organisation && (
                                <small>{organisation}</small>
                            )}
                        </span>
                    </button>

                    <div className={styles.expandedOnly}>
                        <p className={styles.roleLabel}>{roleName} portal</p>
                        {activeRole === 'organiser' && <OlympiadSwitcher />}
                    </div>

                    <nav className={styles.nav} aria-label="Main">
                        {navItems.filter((item) => item.to !== '/educator/members' || isCoordinator).map((item) => (
                            <NavLink
                                end={
                                    item.to === '/organiser' ||
                                    item.to === '/educator' ||
                                    item.to === '/student'
                                }
                                className={({ isActive }) =>
                                    `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                                }
                                key={item.label}
                                title={collapsed ? item.label : undefined}
                                to={item.to}
                            >
                                <NavIcon icon={item.icon} />
                                <span className={styles.label}>
                                    {item.label}
                                </span>
                            </NavLink>
                        ))}
                    </nav>

                    <div className={styles.account}>
                        {/* The role signed in as, then the person's name */}
                        <div
                            className={styles.accountIdentity}
                            title={
                                collapsed
                                    ? [roleName, user?.name]
                                          .filter(Boolean)
                                          .join(' · ')
                                    : undefined
                            }
                        >
                            <span aria-hidden="true" className={styles.avatar}>
                                {user?.initials || roleName[0]}
                            </span>
                            <span
                                className={`${styles.accountText} ${styles.label}`}
                            >
                                <span>{roleName}</span>
                                {user && <small>{user.name}</small>}
                            </span>
                        </div>
                        <Button
                            className={styles.accountButton}
                            disabled={loggingOut}
                            fullWidth
                            icon={<LogOut aria-hidden="true" />}
                            justify="start"
                            onClick={handleLogout}
                            title={collapsed ? 'Log out' : undefined}
                            variant="outline"
                        >
                            <span className={styles.label}>
                                {loggingOut ? 'Logging out…' : 'Log out'}
                            </span>
                        </Button>
                        <Button
                            className={styles.accountButton}
                            fullWidth
                            icon={<Trash2 aria-hidden="true" />}
                            justify="start"
                            onClick={() => {
                                setDeleteError(null);
                                setConfirmingDelete(true);
                            }}
                            title={collapsed ? 'Delete account' : undefined}
                            variant="ghost"
                        >
                            <span className={styles.label}>Delete account</span>
                        </Button>
                    </div>
                </div>
            </aside>

            {mobileOpen && (
                <button
                    aria-label="Close navigation menu"
                    className={styles.mobileBackdrop}
                    onClick={() => setMobileOpen(false)}
                    type="button"
                />
            )}

            {confirmingDelete && (
                <div className={styles.overlay}>
                    <div
                        aria-labelledby="delete-account-heading"
                        aria-modal="true"
                        className={styles.confirmDialog}
                        role="dialog"
                    >
                        <h2 id="delete-account-heading">
                            Delete your account?
                        </h2>
                        <p>
                            This removes your login and your access to the
                            portal. It can’t be undone.
                        </p>
                        {deleteError && (
                            <ErrorAlert
                                message={deleteError}
                                onDismiss={() => setDeleteError(null)}
                            />
                        )}
                        <div className={styles.confirmActions}>
                            <Button
                                disabled={deleting}
                                onClick={() => setConfirmingDelete(false)}
                                variant="outline"
                            >
                                Keep my account
                            </Button>
                            <Button
                                disabled={deleting}
                                onClick={handleDeleteAccount}
                            >
                                {deleting ? 'Deleting...' : 'Delete account'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <header className={styles.mobileHeader}>
                <Button
                    aria-controls="app-sidebar"
                    aria-expanded={mobileOpen}
                    aria-label="Open navigation menu"
                    icon={<Menu aria-hidden="true" />}
                    onClick={() => setMobileOpen(true)}
                    size="icon"
                    variant="outline"
                >
                    <span className="sr-only">Open navigation menu</span>
                </Button>
                <span className={styles.mobileTitle}>
                    <GraduationCap aria-hidden="true" />
                    {portalLabel}
                </span>
            </header>

            <div className={styles.contentFrame}>
                <div style={{ padding: '0.75rem 1.5rem' }}>
                    <Button
                        variant="outline"
                        icon={<Bell aria-hidden="true" />}
                        onClick={() => setShowNotifications(!showNotifications)}
                    >
                        Notifications (
                        {notifications.filter((n) => !n.read_at).length})
                    </Button>
                    {showNotifications && (
                        <section
                            aria-label="Notifications"
                            style={{
                                padding: '1rem',
                                background: 'white',
                                border: '1px solid #ddd',
                                maxHeight: '20rem',
                                overflowY: 'auto',
                            }}
                        >
                            {notifications.length === 0 && (
                                <p>No notifications yet.</p>
                            )}
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    style={{
                                        borderBottom: '1px solid #ddd',
                                        padding: '0.5rem',
                                    }}
                                >
                                    <strong>{n.title}</strong>
                                    <p>{n.body}</p>
                                    {!n.read_at && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                api
                                                    .patch(
                                                        `/notifications/${n.id}/read`
                                                    )
                                                    .then(() =>
                                                        setNotifications(
                                                            (list) =>
                                                                list.map(
                                                                    (entry) =>
                                                                        entry.id ===
                                                                        n.id
                                                                            ? {
                                                                                  ...entry,
                                                                                  read_at:
                                                                                      new Date().toISOString(),
                                                                              }
                                                                            : entry
                                                                )
                                                        )
                                                    )
                                            }
                                        >
                                            Mark read
                                        </button>
                                    )}
                                </div>
                            ))}
                        </section>
                    )}
                </div>
                <main className={styles.main}>{children}</main>
            </div>
        </div>
    );
}
