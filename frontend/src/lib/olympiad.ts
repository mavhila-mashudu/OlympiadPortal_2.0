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

// Every organiser page starts by looking up the current olympiad, so the
// answer is kept in memory briefly and concurrent callers share one request.
// It is keyed by the session token (never persisted), so another account never
// sees it, and pages that change olympiads call clearCurrentOlympiadCache().
const CACHE_TTL_MS = 60_000;
let cached: { token: string | null; expiresAt: number; value: Promise<Olympiad | null> } | null = null;

export function clearCurrentOlympiadCache() {
  cached = null;
}

// Returns null when no olympiads exist — callers should prompt the user to create one.
export function getCurrentOlympiad(): Promise<Olympiad | null> {
  const token = getToken();
  if (cached && cached.token === token && cached.expiresAt > Date.now()) return cached.value;

  const value = api
    .get<{ olympiads: Olympiad[] }>("/olympiads")
    .then(({ olympiads }) => (olympiads.length > 0 ? olympiads[0] : null));
  const entry = { token, expiresAt: Date.now() + CACHE_TTL_MS, value };
  cached = entry;
  value.catch(() => {
    if (cached === entry) cached = null;
  });
  return value;
}
