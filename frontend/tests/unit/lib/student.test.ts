import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/api', () => ({ api: { get: vi.fn() } }));

// The profile is cached in module state, so each test loads a fresh copy
const loadStudent = async () => {
    vi.resetModules();
    const { api } = await import('../../../src/lib/api');
    const student = await import('../../../src/lib/student');
    return { ...student, get: vi.mocked(api.get) };
};

describe('getStudentProfile', () => {
    it('builds the name, initials and school from /auth/me', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({
            user: {
                full_name: 'ayanda khumalo',
                entrants: { schools: { name: 'Parktown High' } },
            },
        });

        await expect(getStudentProfile()).resolves.toEqual({
            userName: 'ayanda khumalo',
            userInitials: 'AK',
            organisation: 'Parktown High',
        });
        expect(get).toHaveBeenCalledWith('/auth/me');
    });

    it('uses at most two initials', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({ user: { full_name: 'Mary Jane Watson' } });
        expect((await getStudentProfile()).userInitials).toBe('MJ');
    });

    it('copes with extra spaces between names', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({ user: { full_name: '  Sipho   Dlamini ' } });
        expect((await getStudentProfile()).userInitials).toBe('SD');
    });

    it("falls back to 'ST' when the name has no letters to use", async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({ user: { full_name: '   ' } });
        expect((await getStudentProfile()).userInitials).toBe('ST');
    });

    it("calls a nameless user 'Student'", async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({ user: { full_name: '' } });
        expect(await getStudentProfile()).toMatchObject({
            userName: 'Student',
            userInitials: 'S',
        });
    });

    it('takes the school from a membership when there is no entrant school', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({
            user: {
                full_name: 'Ben',
                entrants: {},
                school_memberships: [{ schools: { name: 'Northview' } }],
            },
        });
        expect((await getStudentProfile()).organisation).toBe('Northview');
    });

    it('uses a generic school name when none is known', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({
            user: { full_name: 'Ben', school_memberships: [] },
        });
        expect((await getStudentProfile()).organisation).toBe(
            'Olympiad School'
        );
    });

    it('caches the profile after the first successful load', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockResolvedValue({ user: { full_name: 'Ben' } });

        const first = await getStudentProfile();
        const second = await getStudentProfile();
        expect(second).toBe(first);
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('returns a placeholder profile when the request fails, and retries next time', async () => {
        const { getStudentProfile, get } = await loadStudent();
        get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
            user: { full_name: 'Ben' },
        });

        await expect(getStudentProfile()).resolves.toEqual({
            userName: 'Student',
            userInitials: 'ST',
            organisation: 'Olympiad Portal',
        });
        await expect(getStudentProfile()).resolves.toMatchObject({
            userName: 'Ben',
        });
        expect(get).toHaveBeenCalledTimes(2);
    });
});

describe('formatCountdown', () => {
    const NOW = new Date('2026-06-01T08:00:00Z');
    const inFuture = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    const MIN = 60_000;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['the open time has passed', inFuture(-MIN)],
        ['it opens right now', inFuture(0)],
    ])("says 'Starting soon' when %s", async (_label, iso) => {
        const { formatCountdown } = await loadStudent();
        expect(formatCountdown(iso)).toBe('Starting soon');
    });

    it.each([
        [2 * 1440 * MIN + 3 * 60 * MIN + 4 * MIN, '2d 3h 4m'],
        [5 * 60 * MIN + 7 * MIN, '5h 7m'],
        [60 * MIN, '1h 0m'],
        [42 * MIN, '42m'],
        [30_000, '0m'],
    ])('formats %i ms ahead as %s', async (ms, expected) => {
        const { formatCountdown } = await loadStudent();
        expect(formatCountdown(inFuture(ms))).toBe(expected);
    });
});

describe('clearStudentProfile', () => {
    it('makes the next call load the profile again', async () => {
        const { getStudentProfile, clearStudentProfile, get } =
            await loadStudent();
        get.mockResolvedValueOnce({ user: { full_name: 'Ayanda Khumalo' } });
        get.mockResolvedValueOnce({ user: { full_name: 'Lerato Nkosi' } });

        expect((await getStudentProfile()).userName).toBe('Ayanda Khumalo');
        expect((await getStudentProfile()).userName).toBe('Ayanda Khumalo');
        clearStudentProfile();
        expect((await getStudentProfile()).userName).toBe('Lerato Nkosi');
        expect(get).toHaveBeenCalledTimes(2);
    });
});

describe('date formatting', () => {
    // Midday UTC keeps the calendar date the same in any timezone
    const ISO = '2026-03-15T12:00:00Z';

    it("formats a date with the time, in the olympiad's timezone", async () => {
        const { formatDateTime } = await loadStudent();
        expect(formatDateTime(ISO, 'Africa/Johannesburg')).toBe(
            '15 Mar 2026, 14:00 SAST'
        );
    });

    it("formats the olympiad's calendar date", async () => {
        const { formatDateOnly } = await loadStudent();
        expect(formatDateOnly(ISO, 'Africa/Johannesburg')).toBe('15 Mar 2026');
    });

    it.each(['formatDateTime', 'formatDateOnly'] as const)(
        '%s shows a dash for an empty value',
        async (fn) => {
            const module = await loadStudent();
            expect(module[fn]('', 'Africa/Johannesburg')).toBe('—');
        }
    );
});
