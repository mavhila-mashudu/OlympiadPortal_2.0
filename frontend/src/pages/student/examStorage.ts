// ── Offline resilience ──────────────────────────────
import { getToken } from '../../lib/api';

// Answers persist to localStorage so a refresh or
// network drop never loses work.  The dirty list
// tracks answers whose last save failed — they are
// replayed on reconnect and before submitting.
export type StoredAnswers = {
    answers: Record<string, string>;
    dirty: string[];
};

/** Keep a shared browser's offline exam draft isolated to its signed-in user. */
export const examStorageKey = (
    kind: 'exam-answers' | 'exam-flags',
    roundId: string
) => {
    const token = getToken();
    if (!token) return `${kind}-${roundId}`;

    try {
        const payload = token
            .split('.')[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const subject = JSON.parse(atob(payload)).sub;
        if (typeof subject === 'string' && subject) {
            return `${kind}-${subject}-${roundId}`;
        }
    } catch {
        // Non-JWT tokens are used by tests and older development setups.
    }

    // Supabase access tokens always have a subject. Retain a fallback for
    // development/test tokens, without putting the token itself in the key.
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
        hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    }
    return `${kind}-${(hash >>> 0).toString(36)}-${roundId}`;
};

export const readStored = (key: string): StoredAnswers => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { answers: {}, dirty: [] };
        const parsed = JSON.parse(raw);
        return {
            answers: parsed.answers ?? {},
            dirty: Array.isArray(parsed.dirty) ? parsed.dirty : [],
        };
    } catch {
        return { answers: {}, dirty: [] };
    }
};

export const writeStored = (key: string, state: StoredAnswers) => {
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch {
        // Quota exceeded / private mode — degrade gracefully
    }
};
