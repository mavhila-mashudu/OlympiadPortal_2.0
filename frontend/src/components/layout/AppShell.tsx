import {
  Bell,
  GraduationCap,
  LogOut,
  Menu,
  Trash2,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { QueryClientContext } from "@tanstack/react-query";
import { useContext, useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { logout } from "../../lib/session";
import type { NavItem } from "../../lib/mockData";
import { Button } from "../ui/Button";
import styles from "./AppShell.module.css";

type AppShellProps = {
  activeRole: "organiser" | "educator" | "student";
  children: React.ReactNode;
  navItems: NavItem[];
  organisation: string;
  portalLabel: string;
  userInitials: string;
  userName: string;
};

function Brand({ organisation }: { organisation: string }) {
  return (
    <Link className={styles.brand} to="/login">
      <span className={styles.brandMark}>
        <Trophy aria-hidden="true" />
      </span>
      <span className={styles.brandText}>
        <span>Olympiad Portal</span>
        <small>{organisation}</small>
      </span>
    </Link>
  );
}

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" />;
}

export function AppShell({
  activeRole,
  children,
  navItems,
  organisation,
  portalLabel,
  userInitials,
  userName,
}: AppShellProps) {
  const navigate = useNavigate();
  // Read the context directly so the shell also renders without a provider
  const queryClient = useContext(QueryClientContext);

  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; read_at: string | null }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => api.get<{ notifications: typeof notifications }>("/notifications")
      .then((data) => { if (active) setNotifications(data.notifications); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Deleting the account removes the login from Supabase and marks the
  // account deleted, so the session that is open must end with it
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete("/auth/account");
      logout();
      queryClient?.clear();
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn’t delete your account. Please try again.",
      );
      setDeleting(false);
    }
  };

  const handleLogout = () => {
    logout();
    // Drop cached API data so the next user starts clean
    queryClient?.clear();
    navigate("/login", { replace: true });
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          <Brand organisation={organisation} />

          <div>
            <p className={styles.roleLabel}>
              {activeRole === "organiser"
                ? "Organiser portal"
                : activeRole === "educator"
                  ? "Educator portal"
                  : "Student portal"}
            </p>
          </div>

          <nav className={styles.nav} aria-label="Main">
            {navItems.map((item) => (
              <NavLink
                end={
                  item.to === "/organiser" ||
                  item.to === "/educator" ||
                  item.to === "/student"
                }
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navItemActive : ""}`
                }
                key={item.label}
                to={item.to}
              >
                <NavIcon icon={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className={styles.account}>
            <div className={styles.accountIdentity}>
              <span className={styles.avatar}>{userInitials}</span>
              <span className={styles.accountText}>
                <span>{userName}</span>
                <small>
                  {activeRole === "organiser"
                    ? "Organiser"
                    : activeRole === "educator"
                      ? "Educator"
                      : "Student"}
                </small>
              </span>
            </div>
            <Button
              fullWidth
              icon={<LogOut aria-hidden="true" />}
              justify="start"
              onClick={handleLogout}
              variant="outline"
            >
              Log out
            </Button>
            <Button
              fullWidth
              icon={<Trash2 aria-hidden="true" />}
              justify="start"
              onClick={() => {
                setDeleteError(null);
                setConfirmingDelete(true);
              }}
              variant="ghost"
            >
              Delete account
            </Button>
          </div>
        </div>
      </aside>

      {confirmingDelete && (
        <div className={styles.overlay}>
          <div
            aria-labelledby="delete-account-heading"
            aria-modal="true"
            className={styles.confirmDialog}
            role="dialog"
          >
            <h2 id="delete-account-heading">Delete your account?</h2>
            <p>
              This removes your login and your access to the portal. It can’t be
              undone.
            </p>
            {deleteError && <p className={styles.confirmError}>{deleteError}</p>}
            <div className={styles.confirmActions}>
              <Button
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
                variant="outline"
              >
                Keep my account
              </Button>
              <Button disabled={deleting} onClick={handleDeleteAccount}>
                {deleting ? "Deleting..." : "Delete account"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className={styles.mobileHeader}>
        <Button
          aria-label="Open navigation menu"
          icon={<Menu aria-hidden="true" />}
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
        <div style={{ padding: "0.75rem 1.5rem" }}>
          <Button variant="outline" icon={<Bell aria-hidden="true" />} onClick={() => setShowNotifications(!showNotifications)}>Notifications ({notifications.filter((n) => !n.read_at).length})</Button>
          {showNotifications && <section aria-label="Notifications" style={{ padding: "1rem", background: "white", border: "1px solid #ddd", maxHeight: "20rem", overflowY: "auto" }}>
            {notifications.length === 0 && <p>No notifications yet.</p>}
            {notifications.map((n) => <div key={n.id} style={{ borderBottom: "1px solid #ddd", padding: "0.5rem" }}>
              <strong>{n.title}</strong><p>{n.body}</p>
              {!n.read_at && <button type="button" onClick={() => api.patch(`/notifications/${n.id}/read`).then(() => setNotifications((list) => list.map((entry) => entry.id === n.id ? { ...entry, read_at: new Date().toISOString() } : entry)))}>Mark read</button>}
            </div>)}
          </section>}
        </div>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
