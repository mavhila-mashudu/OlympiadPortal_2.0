import { useSyncExternalStore } from "react";
import { api, getToken } from "./api";

export type Olympiad = {
  id: string;
  name: string;
  organiser_id: string;
  // IANA timezone; the olympiad's round times are entered and shown in it
  timezone: string;
  created_at: string;
  _count?: { rounds: number; school_registrations: number };
};

// Every organiser page starts by looking up the organiser's olympiads, so the
// list is kept in memory briefly and concurrent callers share one request.
// It is keyed by the session token (never persisted), so another account never
// sees it, and pages that change olympiads call clearCurrentOlympiadCache().
const CACHE_TTL_MS = 60_000;
let cached: { token: string | null; expiresAt: number; value: Promise<Olympiad[]> } | null = null;

// Bumped whenever the list or the choice changes, so the sidebar's switcher
// shows an olympiad just created, renamed or deleted
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((listener) => listener());
};

export function clearCurrentOlympiadCache() {
  cached = null;
  notify();
}

/** The organiser's olympiads, newest first. */
export function getOlympiads(): Promise<Olympiad[]> {
  const token = getToken();
  if (cached && cached.token === token && cached.expiresAt > Date.now()) return cached.value;

  const value = api.get<{ olympiads: Olympiad[] }>("/olympiads").then(({ olympiads }) => olympiads ?? []);
  const entry = { token, expiresAt: Date.now() + CACHE_TTL_MS, value };
  cached = entry;
  value.catch(() => {
    if (cached === entry) cached = null;
  });
  return value;
}

// ── The olympiad the organiser is working on ────────────────────────────
// Chosen in the sidebar and remembered on this device, so every organiser page
// (dashboard, schools, standings, announcements) shows the same one until the
// organiser switches. Cleared at logout.
export const SELECTED_OLYMPIAD_KEY = "op_current_olympiad";

export function getSelectedOlympiadId(): string | null {
  try {
    return localStorage.getItem(SELECTED_OLYMPIAD_KEY);
  } catch {
    return null;
  }
}

export function selectOlympiad(id: string) {
  try {
    localStorage.setItem(SELECTED_OLYMPIAD_KEY, id);
  } catch {
    // Storage unavailable: the choice lasts until the page is reloaded
  }
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The chosen olympiad's id; pages depend on it to reload when it changes. */
export function useSelectedOlympiadId() {
  return useSyncExternalStore(subscribe, getSelectedOlympiadId, () => null);
}

/** Changes whenever the olympiad list or the choice changes. */
export function useOlympiadsVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

// The chosen olympiad if it still exists, otherwise the newest.
export function pickCurrentOlympiad(olympiads: Olympiad[]): Olympiad | null {
  const selectedId = getSelectedOlympiadId();
  return olympiads.find((o) => o.id === selectedId) ?? olympiads[0] ?? null;
}

// Returns null when no olympiads exist — callers should prompt the user to create one.
export async function getCurrentOlympiad(): Promise<Olympiad | null> {
  return pickCurrentOlympiad(await getOlympiads());
}
