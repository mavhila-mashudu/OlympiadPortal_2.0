import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/api', () => ({
    api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '../../../src/lib/api';
import * as educatorApi from '../../../src/lib/educatorApi';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const wrapperFor = (client: QueryClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    };

const newClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

beforeEach(() => {
    get.mockReset();
    post.mockReset();
});

describe("date formatting, in the olympiad's timezone", () => {
    const ISO = '2026-03-15T12:00:00Z';

    it('formatDate shows the date and time, labelled with the zone', () => {
        expect(educatorApi.formatDate(ISO, 'Africa/Johannesburg')).toBe(
            '15 Mar 2026, 14:00 SAST'
        );
        expect(educatorApi.formatDate(ISO, 'UTC')).toBe(
            '15 Mar 2026, 12:00 UTC'
        );
    });

    it("formatDateShort shows the olympiad's calendar date", () => {
        expect(educatorApi.formatDateShort(ISO, 'Africa/Johannesburg')).toBe(
            '15 Mar 2026'
        );
        // 23:00 UTC is already the next day in Johannesburg
        expect(
            educatorApi.formatDateShort(
                '2026-03-15T23:00:00Z',
                'Africa/Johannesburg'
            )
        ).toBe('16 Mar 2026');
    });
});

// Each hook returns a differently-typed result; the tables below only need
// the parts they assert on.
type QueryCase = {
    name: string;
    use: () => { isSuccess: boolean; data: unknown };
    path: string;
    response: unknown;
    data: unknown;
};
type DisabledCase = [name: string, use: () => { fetchStatus: string }];
type MutationCase = {
    name: string;
    use: () => { mutateAsync: (variables: never) => Promise<unknown> };
    variables: unknown;
    path: string;
    body: unknown;
    invalidated: string[][];
};

describe('query hooks', () => {
    const cases: QueryCase[] = [
        {
            name: 'useEducatorRounds',
            use: () => educatorApi.useEducatorRounds(),
            path: '/me/rounds',
            response: {
                rounds: [{ id: 'r1' }],
                school: { id: 's1', name: 'Parktown' },
            },
            data: {
                rounds: [{ id: 'r1' }],
                school: { id: 's1', name: 'Parktown' },
            },
        },
        {
            name: 'useEducatorRoundDetail',
            use: () => educatorApi.useEducatorRoundDetail('r1'),
            path: '/me/rounds/r1',
            response: { round: { id: 'r1', name: 'Round 1' } },
            data: { id: 'r1', name: 'Round 1' },
        },
        {
            name: 'useEducatorEntrants',
            use: () => educatorApi.useEducatorEntrants('r1'),
            path: '/rounds/r1/entrants',
            response: { entrants: [{ id: 'e1' }] },
            data: [{ id: 'e1' }],
        },
        {
            name: 'useProgressionInfo',
            use: () => educatorApi.useProgressionInfo('r1'),
            path: '/rounds/r1/progression',
            response: {
                requiresQualification: true,
                previousRound: null,
                qualifiedEntrantIds: ['e1'],
            },
            data: {
                requiresQualification: true,
                previousRound: null,
                qualifiedEntrantIds: ['e1'],
            },
        },
        {
            name: 'useOlympiadEntrants',
            use: () => educatorApi.useOlympiadEntrants('o1'),
            path: '/olympiads/o1/entrants',
            response: { entrants: [{ id: 'e1', rounds: [] }] },
            data: [{ id: 'e1', rounds: [] }],
        },
        {
            name: 'useOlympiadProgressionInfo',
            use: () => educatorApi.useOlympiadProgressionInfo('o1'),
            path: '/olympiads/o1/progression',
            response: { rounds: [{ roundId: 'r1' }] },
            data: { rounds: [{ roundId: 'r1' }] },
        },
        {
            name: 'useEducatorResults',
            use: () => educatorApi.useEducatorResults('r1'),
            path: '/me/rounds/r1/results',
            response: { round: { id: 'r1' }, results: [] },
            data: { round: { id: 'r1' }, results: [] },
        },
        {
            name: 'useAllEducatorResults',
            use: () => educatorApi.useAllEducatorResults(),
            path: '/me/results',
            response: { rounds: [{ id: 'r1', results: [] }] },
            data: [{ id: 'r1', results: [] }],
        },
        {
            name: 'usePastPapers',
            use: () => educatorApi.usePastPapers('r1'),
            path: '/educator/rounds/r1/papers/past',
            response: { papers: [{ id: 'p1' }] },
            data: [{ id: 'p1' }],
        },
    ];

    it.each(cases)(
        '$name loads $path and returns the data the page needs',
        async ({ use, path, response, data }) => {
            get.mockResolvedValue(response);
            const { result } = renderHook(use, {
                wrapper: wrapperFor(newClient()),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(get).toHaveBeenCalledWith(path);
            expect(result.current.data).toEqual(data);
        }
    );

    it.each<DisabledCase>([
        [
            'useEducatorRoundDetail',
            () => educatorApi.useEducatorRoundDetail(''),
        ],
        ['useEducatorEntrants', () => educatorApi.useEducatorEntrants('')],
        ['useProgressionInfo', () => educatorApi.useProgressionInfo('')],
        ['useOlympiadEntrants', () => educatorApi.useOlympiadEntrants('')],
        [
            'useOlympiadProgressionInfo',
            () => educatorApi.useOlympiadProgressionInfo(''),
        ],
        ['useEducatorResults', () => educatorApi.useEducatorResults('')],
        ['usePastPapers', () => educatorApi.usePastPapers('')],
    ])('%s waits until it has an id', async (_name, use) => {
        const { result } = renderHook(use, {
            wrapper: wrapperFor(newClient()),
        });
        await act(async () => {});
        expect(result.current.fetchStatus).toBe('idle');
        expect(get).not.toHaveBeenCalled();
    });

    it('exposes API errors to the page', async () => {
        get.mockRejectedValue(
            new Error('Your school is not registered for this olympiad')
        );
        const { result } = renderHook(() => educatorApi.useEducatorRounds(), {
            wrapper: wrapperFor(newClient()),
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toBe(
            'Your school is not registered for this olympiad'
        );
    });
});

describe('mutation hooks', () => {
    const entrants = [{ full_name: 'Ayanda Khumalo', grade: '10' }];

    it.each<MutationCase>([
        {
            name: 'useRegisterEntrants',
            use: () => educatorApi.useRegisterEntrants('r1'),
            variables: entrants,
            path: '/rounds/r1/entrants',
            body: { entrants },
            invalidated: [
                ['educator', 'rounds', 'r1', 'entrants'],
                ['educator', 'rounds'],
            ],
        },
        {
            name: 'useRegisterEntrantsForOlympiad',
            use: () => educatorApi.useRegisterEntrantsForOlympiad('o1'),
            variables: entrants,
            path: '/olympiads/o1/entrants',
            body: { entrants },
            invalidated: [
                ['educator', 'olympiads', 'o1', 'entrants'],
                ['educator', 'rounds'],
            ],
        },
        {
            name: 'useSubmitResults',
            use: () => educatorApi.useSubmitResults('r1'),
            variables: {
                entrant_id: 'e1',
                answers: [{ question_id: 'q1', answer_value: '0' }],
            },
            path: '/rounds/r1/submissions',
            body: {
                entrant_id: 'e1',
                answers: [{ question_id: 'q1', answer_value: '0' }],
            },
            invalidated: [
                ['educator', 'rounds', 'r1'],
                ['educator', 'rounds'],
            ],
        },
    ])(
        '$name posts to $path and refreshes the affected lists',
        async ({ use, variables, path, body, invalidated }) => {
            post.mockResolvedValue({ ok: true });
            const client = newClient();
            const invalidate = vi.spyOn(client, 'invalidateQueries');

            const { result } = renderHook(use, { wrapper: wrapperFor(client) });
            await act(() => result.current.mutateAsync(variables as never));

            expect(post).toHaveBeenCalledWith(path, body);
            expect(invalidate.mock.calls.map(([arg]) => arg?.queryKey)).toEqual(
                invalidated
            );
        }
    );

    it("doesn't refresh anything when the request fails", async () => {
        post.mockRejectedValue(new Error('Round closed'));
        const client = newClient();
        const invalidate = vi.spyOn(client, 'invalidateQueries');

        const { result } = renderHook(
            () => educatorApi.useRegisterEntrants('r1'),
            {
                wrapper: wrapperFor(client),
            }
        );
        await act(async () => {
            await expect(result.current.mutateAsync(entrants)).rejects.toThrow(
                'Round closed'
            );
        });
        expect(invalidate).not.toHaveBeenCalled();
    });
});

describe('downloadPaperFile', () => {
    it('opens a signed download link for the paper in a new tab', async () => {
        get.mockResolvedValue({ url: 'https://signed.test/paper.pdf' });
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);

        await educatorApi.downloadPaperFile('r1');

        expect(get).toHaveBeenCalledWith(
            '/educator/rounds/r1/paper/download?type=paper'
        );
        expect(open).toHaveBeenCalledWith(
            'https://signed.test/paper.pdf',
            '_blank'
        );
    });

    it('requests the memo when asked', async () => {
        get.mockResolvedValue({ url: 'https://signed.test/memo.pdf' });
        vi.spyOn(window, 'open').mockImplementation(() => null);

        await educatorApi.downloadPaperFile('r1', 'memo');
        expect(get).toHaveBeenCalledWith(
            '/educator/rounds/r1/paper/download?type=memo'
        );
    });

    it("doesn't open a tab when the link can't be created", async () => {
        get.mockRejectedValue(new Error('Paper is not available yet'));
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);

        await expect(educatorApi.downloadPaperFile('r1')).rejects.toThrow(
            'Paper is not available yet'
        );
        expect(open).not.toHaveBeenCalled();
    });
});
