import { api, clearToken, getToken, setToken } from './api';
import type { UserRole } from './auth';
import { clearCurrentUser } from './currentUser';
import { SELECTED_OLYMPIAD_KEY, clearCurrentOlympiadCache } from './olympiad';
import { clearStudentProfile } from './student';
import { getSupabaseClient } from './supabase';

const ROLE_KEY = 'op_role';
const ROLES: UserRole[] = ['organiser', 'educator', 'student'];

// Exam progress kept on the device (see pages/student/examStorage.ts). It
// belongs to the signed-in student, so it must not carry over to whoever
// uses this computer next.
const USER_STORAGE_PREFIXES = ['exam-answers-', 'exam-flags-'];

// Supabase keeps its own copy of the session (including the refresh token)
// under "sb-<project>-auth-token"
const isSupabaseSessionKey = (key: string) =>
    key.startsWith('sb-') && key.endsWith('-auth-token');

function clearUserStorage() {
    try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (
                key &&
                (USER_STORAGE_PREFIXES.some((prefix) =>
                    key.startsWith(prefix)
                ) ||
                    isSupabaseSessionKey(key))
            ) {
                keys.push(key);
            }
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch {
        // Storage unavailable — nothing to clear
    }
}

// When the token expires, from its "exp" claim. A token that isn't a JWT
// (as in tests) has no known expiry.
function tokenExpiresAt(token: string): number {
    try {
        const payload = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        );
        return typeof payload.exp === 'number' ? payload.exp * 1000 : Infinity;
    } catch {
        return Infinity;
    }
}

// Gives up waiting on the network after a moment: logging out must never hang
const withTimeout = (work: Promise<unknown>, ms: number) =>
    Promise.race([
        work.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, ms)),
    ]);

/** Remembers who signed in: their API token and their role. */
export function startSession(token: string, role: UserRole) {
    setToken(token);
    localStorage.setItem(ROLE_KEY, role);
}

export type SessionState =
    | { status: 'active'; token: string; role: UserRole }
    | { status: 'expired' }
    | { status: 'none' };

/** The session on this device: active, expired, or none at all. */
export function readSession(): SessionState {
    const token = getToken();
    const role = localStorage.getItem(ROLE_KEY) as UserRole | null;
    if (!token || !role || !ROLES.includes(role)) return { status: 'none' };
    if (tokenExpiresAt(token) <= Date.now()) return { status: 'expired' };
    return { status: 'active', token, role };
}

/**
 * Forgets the session on this device: the token, the role, cached profile,
 * on-device exam progress and Supabase's own copy of the session. For when
 * the server has already ended it (an expired token, a deleted account).
 */
export async function endLocalSession() {
    clearToken();
    localStorage.removeItem(ROLE_KEY);
    // Which olympiad this organiser was working on is theirs alone
    localStorage.removeItem(SELECTED_OLYMPIAD_KEY);
    clearStudentProfile();
    clearCurrentUser();
    clearCurrentOlympiadCache();
    try {
        await withTimeout(
            getSupabaseClient().auth.signOut({ scope: 'local' }),
            3000
        );
    } catch {
        // Supabase isn't configured — there is no session to end
    }
    // After Supabase, which leaves its copy behind if it can't reach the server
    clearUserStorage();
}

/**
 * Signs the user out: the server ends the session first, while the token is
 * still here to identify it, so the token stops working everywhere. Then this
 * device forgets it. A server that can't be reached doesn't stop the logout.
 */
export async function logout() {
    if (getToken()) await withTimeout(api.post('/auth/logout'), 3000);
    await endLocalSession();
}
