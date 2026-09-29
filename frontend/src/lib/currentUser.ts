import { useEffect, useState } from "react";
import { api } from "./api";

// The signed-in user as the sidebar shows them. Loaded once per session and
// shared by every page, then forgotten at logout (clearCurrentUser), so the
// next person on this computer never sees the previous name.
export type CurrentUser = { name: string; initials: string };

let cached: Promise<CurrentUser | null> | null = null;

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join("");

export function getCurrentUser(): Promise<CurrentUser | null> {
  cached ??= api
    // background: the sidebar loading must never cover the page
    .get<{ user: { full_name: string } }>("/auth/me", { background: true })
    .then(({ user }) => (user?.full_name ? { name: user.full_name, initials: initialsOf(user.full_name) } : null))
    .catch(() => {
      // Try again next time rather than remembering the failure
      cached = null;
      return null;
    });
  return cached;
}

export function clearCurrentUser() {
  cached = null;
}

/** The signed-in user, or null while loading (or if it can't be loaded). */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    let active = true;
    getCurrentUser().then((loaded) => {
      if (active) setUser(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return user;
}
