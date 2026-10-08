import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { TOKEN_STORAGE_KEY, setSessionEndedHandler } from "../../lib/api";
import { dashboardForRole, type UserRole } from "../../lib/auth";
import { endLocalSession, readSession } from "../../lib/session";

// What the login page is told when it was sent there
export type LoginRedirectState = { from?: string; sessionEnded?: boolean };

/**
 * Guards one role's pages. Without a session (never signed in, or signed out
 * and then the Back button) the page is replaced by the login page, so
 * nothing of the account is shown. Another role is sent to its own
 * dashboard. While a page is open, a 401 from the API (the session expired,
 * was revoked, or the account was deleted) or a logout in another tab ends
 * the session here too.
 */
export function RequireSession({ role }: { role: UserRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = readSession();

  useEffect(() => {
    const toLogin = (state: LoginRedirectState) => navigate("/login", { replace: true, state });

    setSessionEndedHandler(() => {
      void endLocalSession();
      toLogin({ sessionEnded: true });
    });
    // localStorage is shared between tabs; this fires when another tab logs out
    const onStorage = (event: StorageEvent) => {
      if ((event.key === TOKEN_STORAGE_KEY || event.key === null) && readSession().status !== "active") toLogin({});
    };
    window.addEventListener("storage", onStorage);
    return () => {
      setSessionEndedHandler(null);
      window.removeEventListener("storage", onStorage);
    };
  }, [navigate]);

  useEffect(() => {
    if (session.status === "expired") void endLocalSession();
  }, [session.status]);

  if (session.status !== "active") {
    const state: LoginRedirectState = { from: location.pathname + location.search, sessionEnded: session.status === "expired" };
    return <Navigate to="/login" replace state={state} />;
  }
  if (session.role !== role) return <Navigate to={dashboardForRole(session.role)} replace />;
  return <Outlet />;
}
