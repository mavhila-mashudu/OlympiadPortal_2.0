// ── Offline resilience ──────────────────────────────
// Answers persist to localStorage so a refresh or
// network drop never loses work.  The dirty list
// tracks answers whose last save failed — they are
// replayed on reconnect and before submitting.
export type StoredAnswers = {
    answers: Record<string, string>;
    dirty: string[];
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
