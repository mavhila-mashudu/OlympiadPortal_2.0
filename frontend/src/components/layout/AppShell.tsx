import {
  GraduationCap,
  LogOut,
  Menu,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
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
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          <Brand organisation={organisation} />

          <div>
            <p className={styles.roleLabel}>Demo role</p>
            <div
              className={styles.roleSwitch}
              role="group"
              aria-label="Switch demo role"
            >
              <Link
                aria-pressed={activeRole === "organiser"}
                className={`${styles.roleOption} ${
                  activeRole === "organiser" ? styles.roleOptionActive : ""
                }`}
                to="/organiser"
              >
                organiser
              </Link>
              <Link
                aria-pressed={activeRole === "educator"}
                className={`${styles.roleOption} ${
                  activeRole === "educator" ? styles.roleOptionActive : ""
                }`}
                to="/educator"
              >
                educator
              </Link>
              <Link
                aria-pressed={activeRole === "student"}
                className={`${styles.roleOption} ${
                  activeRole === "student" ? styles.roleOptionActive : ""
                }`}
                to="/student"
              >
                student
              </Link>
            </div>
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
              to="/login"
              variant="outline"
            >
              Log out
            </Button>
          </div>
        </div>
      </aside>

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
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
