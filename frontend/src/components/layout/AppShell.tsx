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
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        setError(null);
        getOlympiads()
            .then((list) => {
                if (active) {
                    setOlympiads(list);
                    setError(null);
                }
            })
            .catch((err) => {
                if (active) {
                    setError(
                        friendlyErrorMessage(
                            err,
                            'We couldn’t load your olympiads.'
                        )
                    );
                }
            });
        return () => {
            active = false;
        };
    }, [version, reload]);

    const current = pickCurrentOlympiad(olympiads);
    return (
        <div className={styles.switcher}>
            {current && (
                <label>
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
            )}
            {error && (
                <div className={styles.switcherError} role="alert">
                    <span>{error}</span>
                    <button
                        onClick={() => setReload((attempt) => attempt + 1)}
                        type="button"
                    >
                        Try again
                    </button>
                </div>
            )}
        </div>
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
        api.get<{ user: { school_memberships: { role: string; status: string }[] } }>('/me', { background: true })
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
        { id: string; dedupe_key?: string; title: string; body: string; read_at: string | null }[]
    >([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationReload, setNotificationReload] = useState(0);
    const [notificationsLoaded, setNotificationsLoaded] = useState(false);
    const [notificationError, setNotificationError] = useState<string | null>(null);
    const [notificationActionError, setNotificationActionError] = useState<{
        id: string;
        message: string;
    } | null>(null);
    const [markingReadId, setMarkingReadId] = useState<string | null>(null);
    const [pendingRequestCount, setPendingRequestCount] = useState(0);
    useEffect(() => {
        if (activeRole === 'student' || (activeRole === 'educator' && !isCoordinator)) return;
        let active = true;
        const refreshRequests = async () => {
            try {
                const data = await api.get<{ requests: unknown[] }>(
                    '/membership-requests',
                    { background: true }
                );
                if (active) setPendingRequestCount(data.requests.length);
            } catch {
                // The queue page reports access and loading errors in context.
            }
        };
        void refreshRequests();
        window.addEventListener('membership-requests-updated', refreshRequests);
        const timer = setInterval(refreshRequests, 60_000);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener('membership-requests-updated', refreshRequests);
        };
    }, [activeRole, isCoordinator]);
    useEffect(() => {
        let active = true;
        const refresh = async () => {
            try {
                const data = await api.get<{ notifications: typeof notifications }>(
                    '/me/notifications'
                );
                if (active) {
                    setNotifications(data.notifications);
                    setNotificationsLoaded(true);
                    setNotificationError(null);
                }
            } catch (err) {
                if (active) {
                    setNotificationsLoaded(true);
                    setNotificationError(
                        friendlyErrorMessage(
                            err,
                            'We couldn’t load your notifications.'
                        )
                    );
                }
            }
        };
        refresh();
        const timer = setInterval(refresh, 60_000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [notificationReload]);

    const markNotificationRead = async (id: string) => {
        setMarkingReadId(id);
        setNotificationActionError(null);
        try {
            await api.patch(`/me/notifications/${id}/read`);
            setNotifications((list) =>
                list.map((entry) =>
                    entry.id === id
                        ? { ...entry, read_at: new Date().toISOString() }
                        : entry
                )
            );
        } catch (err) {
            setNotificationActionError({
                id,
                message: friendlyErrorMessage(
                    err,
                    'We couldn’t mark this notification as read.'
                ),
            });
        } finally {
            setMarkingReadId(null);
        }
    };
    const openNotification = async (
        notification: (typeof notifications)[number]
    ) => {
        if (markingReadId === notification.id) return;
        if (!notification.read_at) await markNotificationRead(notification.id);
        const destination = notification.dedupe_key?.includes(':signup:')
            ? activeRole === 'organiser'
                ? '/organiser/educators'
                : '/educator/members'
            : notification.dedupe_key?.includes(':invite:')
              ? activeRole === 'organiser'
                  ? '/organiser/educators'
                  : '/educator/invitations'
              : null;
        if (destination) {
            setShowNotifications(false);
            navigate(destination);
        }
    };
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
            await api.delete('/me');
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
                                {((activeRole === 'organiser' && item.to === '/organiser/educators') ||
                                    (activeRole === 'educator' && item.to === '/educator/members')) &&
                                    pendingRequestCount > 0 && (
                                        <span className={styles.navBadge} aria-label={`${pendingRequestCount} pending requests`}>
                                            {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                                        </span>
                                    )}
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
                <div className={styles.notificationArea}>
                    <button
                        aria-label={`Notifications${notifications.filter((n) => !n.read_at).length ? `, ${notifications.filter((n) => !n.read_at).length} unread` : ''}`}
                        aria-expanded={showNotifications}
                        aria-controls="notification-popover"
                        className={styles.notificationBell}
                        onClick={() => setShowNotifications(!showNotifications)}
                        type="button"
                    >
                        <Bell aria-hidden="true" />
                        {notifications.filter((n) => !n.read_at).length > 0 && (
                            <span className={styles.notificationBadge} aria-hidden="true">
                                {notifications.filter((n) => !n.read_at).length > 99 ? '99+' : notifications.filter((n) => !n.read_at).length}
                            </span>
                        )}
                    </button>
                    {showNotifications && (
                        <section
                            id="notification-popover"
                            className={styles.notificationPopover}
                            aria-label="Notifications"
                        >
                            {notificationError && (
                                <ErrorAlert
                                    message={notificationError}
                                    onRetry={() =>
                                        setNotificationReload((attempt) => attempt + 1)
                                    }
                                />
                            )}
                            {!notificationsLoaded && !notificationError && (
                                <p aria-live="polite" role="status">
                                    Loading notifications…
                                </p>
                            )}
                            {notifications.length === 0 && (
                                notificationsLoaded && !notificationError && (
                                    <p>No notifications yet.</p>
                                )
                            )}
                            {notificationActionError && (
                                <ErrorAlert
                                    message={notificationActionError.message}
                                    onRetry={() => markNotificationRead(notificationActionError.id)}
                                />
                            )}
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`${styles.notificationItem} ${!n.read_at ? styles.notificationItemUnread : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-disabled={markingReadId === n.id}
                                    onClick={() => void openNotification(n)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            void openNotification(n);
                                        }
                                    }}
                                >
                                    <strong>{n.title}</strong>
                                    <p>{n.body}</p>
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
