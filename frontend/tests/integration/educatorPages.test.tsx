import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as fx from './support/fixtures';
import { mockApi, mockApiError } from './support/network';
import { renderApp } from './support/renderApp';

describe('educator dashboard', () => {
    it("shows each round's status, countdown and next action", async () => {
        mockApi('get', '/educator/rounds', {
            school: fx.school,
            rounds: [
                fx.educatorRound({
                    id: 'r-open',
                    name: 'Round 1',
                    status: 'open',
                    closes_at: fx.inHours(5),
                }),
                fx.educatorRound({
                    id: 'r-next',
                    name: 'Round 2',
                    status: 'upcoming',
                    state: 'scheduled',
                    opens_at: fx.inHours(24 * 3 + 2),
                    closes_at: fx.inHours(24 * 3 + 4),
                }),
                fx.educatorRound({
                    id: 'r-done',
                    name: 'Round 0',
                    status: 'closed',
                    state: 'results_released',
                    opens_at: fx.inHours(-50),
                    closes_at: fx.inHours(-48),
                    submission_count: 9,
                }),
            ],
        });
        const { user, currentPath } = renderApp('/educator');

        const card = async (name: string) =>
            (await screen.findByRole('heading', { name })).closest('section')!;
        const open = await card('Round 1');
        expect(within(open).getByText('Open')).toBeInTheDocument();
        expect(within(open).getByText('Closes in')).toBeInTheDocument();
        expect(within(open).getByText(/^[45]h \d+m$/)).toBeInTheDocument();
        expect(
            within(open).queryByRole('link', { name: /results|entrants/i })
        ).not.toBeInTheDocument();

        const upcoming = await card('Round 2');
        expect(within(upcoming).getByText('Upcoming')).toBeInTheDocument();
        expect(within(upcoming).getByText(/^3d [12]h$/)).toBeInTheDocument();
        expect(
            within(upcoming).getByRole('link', { name: 'Register entrants' })
        ).toHaveAttribute('href', '/educator/entrants');

        const closed = await card('Round 0');
        expect(
            within(closed).getByText('Submission received')
        ).toBeInTheDocument();
        expect(
            within(closed).getByRole('link', { name: 'View results' })
        ).toHaveAttribute('href', '/educator/results');

        expect(
            screen.getByText('Olympiad rounds relevant to Parktown High.')
        ).toBeInTheDocument();
        await user.click(
            within(open).getByRole('link', { name: 'Open round' })
        );
        expect(currentPath()).toBe('/educator/rounds/r-open');
    });

    it('explains when the school has no rounds', async () => {
        mockApi('get', '/educator/rounds', { rounds: [], school: fx.school });
        renderApp('/educator');
        expect(await screen.findByText(/No rounds found/)).toBeInTheDocument();
    });

    it("shows why rounds couldn't be loaded", async () => {
        mockApiError(
            'get',
            '/educator/rounds',
            403,
            'Educator profile not found'
        );
        renderApp('/educator');
        expect(
            await screen.findByText(
                'Failed to load rounds: Educator profile not found'
            )
        ).toBeInTheDocument();
    });
});

describe('educator round page', () => {
    // GET /educator/rounds/:id
    const roundDetail = (overrides: Record<string, unknown> = {}) => ({
        id: 'round-1',
        name: 'Round 1 — Regional',
        olympiad_id: 'oly-1',
        olympiad_name: 'Maths Olympiad 2026',
        timezone: 'Africa/Johannesburg',
        opens_at: fx.inHours(-1),
        closes_at: fx.inHours(3),
        results_release_at: null,
        state: 'open',
        status: 'open',
        paper: {
            id: 'paper-1',
            title: 'Regional paper',
            has_paper: true,
            has_memo: true,
        },
        submissions: [] as Array<Record<string, unknown>>,
        results_available: false,
        school: fx.school,
        ...overrides,
    });
    const entrants = [
        {
            id: 'ent-1',
            full_name: 'Ayanda Khumalo',
            grade: '11',
            external_ref: 'S001',
            registered_at: '2026-09-01T08:00:00.000Z',
        },
        {
            id: 'ent-2',
            full_name: 'Lerato Nkosi',
            grade: null,
            external_ref: null,
            registered_at: '2026-09-01T08:00:00.000Z',
        },
    ];

    const mockRound = (
        round: ReturnType<typeof roundDetail>,
        { pastPapers = [] as unknown[], roster = entrants } = {}
    ) => {
        const state = { round };
        mockApi('get', '/educator/rounds/round-1', () => ({
            round: state.round,
        }));
        mockApi('get', '/educator/rounds/round-1/papers/past', {
            papers: pastPapers,
        });
        mockApi('get', '/educator/rounds/round-1/entrants', {
            entrants: roster,
        });
        return state;
    };

    it('downloads the question paper through a signed link', async () => {
        mockRound(roundDetail());
        const downloads = mockApi(
            'get',
            '/educator/rounds/:roundId/paper/download',
            (req) => ({ url: `https://storage.test/paper.pdf${req.search}` })
        );
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const { user } = renderApp('/educator/rounds/round-1');

        expect(await screen.findByText('Regional paper')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Download paper' })
        );

        await waitFor(() =>
            expect(open).toHaveBeenCalledWith(
                'https://storage.test/paper.pdf?type=paper',
                '_blank'
            )
        );
        expect(downloads[0].path).toBe(
            '/educator/rounds/round-1/paper/download'
        );
    });

    // A submission row as GET /educator/rounds/:id lists it
    const submitted = (
        entrant: (typeof entrants)[number],
        overrides: Record<string, unknown> = {}
    ) => ({
        id: `sub-${entrant.id}`,
        entrant: { id: entrant.id, full_name: entrant.full_name },
        received_at: '2026-09-01T09:00:00.000Z',
        status: 'received',
        route: 'offline',
        ...overrides,
    });

    it('submits results for one learner after another, showing each receipt', async () => {
        const state = mockRound(roundDetail());
        const submissions = mockApi(
            'post',
            '/rounds/round-1/submissions',
            (req) => {
                const entrant = entrants.find(
                    (e) =>
                        e.id === (req.body as { entrant_id: string }).entrant_id
                )!;
                state.round = {
                    ...state.round,
                    submissions: [
                        ...state.round.submissions,
                        submitted(entrant),
                    ],
                };
                return {
                    submission: {
                        id: `sub-${entrant.id}`,
                        round_id: 'round-1',
                        entrant_id: entrant.id,
                        received_at: new Date().toISOString(),
                        status: 'received',
                        route: 'offline',
                    },
                    answers: [],
                    totalPoints: 0,
                    autoMarked: false,
                };
            },
            { status: 201 }
        );
        const { user } = renderApp('/educator/rounds/round-1');

        const submit = await screen.findByRole('button', {
            name: 'Submit results',
        });
        expect(submit).toBeDisabled();
        await user.selectOptions(
            screen.getByLabelText('Select entrant'),
            'ent-2'
        );
        await user.click(submit);

        expect(
            await screen.findByText('Submission confirmed')
        ).toBeInTheDocument();
        expect(screen.getByText('sub-ent-2')).toBeInTheDocument();
        expect(screen.queryByText(/auto-marked/)).not.toBeInTheDocument();

        // The form stays for the rest: Lerato is listed as submitted and no longer offered
        const section = screen
            .getByRole('heading', { name: 'Submit results' })
            .closest('section')!;
        expect(
            await within(section).findByRole('heading', {
                name: 'Submitted (1 of 2)',
            })
        ).toBeInTheDocument();
        expect(within(section).getByText('Lerato Nkosi')).toBeInTheDocument();
        expect(
            within(section).queryByRole('option', { name: 'Lerato Nkosi' })
        ).not.toBeInTheDocument();
        expect(within(section).getByLabelText('Select entrant')).toHaveValue(
            ''
        );

        await user.selectOptions(
            within(section).getByLabelText('Select entrant'),
            'ent-1'
        );
        await user.click(
            within(section).getByRole('button', { name: 'Submit results' })
        );

        expect(
            await within(section).findByText(
                'Results have been submitted for all 2 registered entrants.'
            )
        ).toBeInTheDocument();
        expect(
            within(section).queryByRole('button', { name: 'Submit results' })
        ).not.toBeInTheDocument();
        expect(
            within(section).getByRole('heading', { name: 'Submitted (2 of 2)' })
        ).toBeInTheDocument();
        expect(
            submissions.map(
                (s) => (s.body as { entrant_id: string }).entrant_id
            )
        ).toEqual(['ent-2', 'ent-1']);
    });

    it("alerts the backend's reason when a submission is rejected", async () => {
        mockRound(roundDetail());
        mockApiError(
            'post',
            '/rounds/round-1/submissions',
            409,
            'This entrant has already submitted for this round'
        );
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const { user } = renderApp('/educator/rounds/round-1');

        await user.selectOptions(
            await screen.findByLabelText('Select entrant'),
            'ent-1'
        );
        await user.click(
            screen.getByRole('button', { name: 'Submit results' })
        );

        await waitFor(() =>
            expect(alert).toHaveBeenCalledWith(
                'This entrant has already submitted for this round'
            )
        );
        expect(
            screen.queryByText('Submission confirmed')
        ).not.toBeInTheDocument();
    });

    it('asks for entrants to be registered before results can be submitted', async () => {
        mockRound(roundDetail(), { roster: [] });
        renderApp('/educator/rounds/round-1');

        const section = (
            await screen.findByRole('heading', { name: 'Submit results' })
        ).closest('section')!;
        expect(
            await within(section).findByText(/No entrants registered yet/)
        ).toBeInTheDocument();
        expect(
            within(section).getByRole('link', { name: 'Register entrants' })
        ).toHaveAttribute('href', '/educator/entrants');
        expect(
            within(section).getByRole('button', { name: 'Submit results' })
        ).toBeDisabled();
    });

    it('locks the paper and submissions before the round opens', async () => {
        mockRound(
            roundDetail({
                state: 'scheduled',
                status: 'upcoming',
                opens_at: fx.inHours(24),
            })
        );
        renderApp('/educator/rounds/round-1');

        expect(
            await screen.findByRole('button', { name: 'Download paper' })
        ).toBeDisabled();
        expect(
            screen.getByText('Paper will be available once the round opens.')
        ).toBeInTheDocument();
        expect(
            screen.getByText('Submissions open when the round opens.')
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Results will be available once the round closes/)
        ).toBeInTheDocument();
    });

    it('offers only the learners still without results, including ones who sat online', async () => {
        mockRound(
            roundDetail({
                submissions: [
                    submitted(entrants[0], {
                        route: 'online',
                        status: 'automarked',
                    }),
                ],
            })
        );
        renderApp('/educator/rounds/round-1');

        const section = (
            await screen.findByRole('heading', { name: 'Submit results' })
        ).closest('section')!;
        expect(
            await within(section).findByText(/Sat online/)
        ).toBeInTheDocument();
        expect(
            within(section)
                .getAllByRole('option')
                .map((o) => o.textContent)
        ).toEqual(['Choose an entrant…', 'Lerato Nkosi']);
    });

    // A9: the learner opened the exam online but never submitted it, e.g. their
    // connection failed, so the school can capture what they wrote on paper
    it('still offers a learner whose online attempt was never submitted, and says what capturing does', async () => {
        mockRound(
            roundDetail({
                submissions: [
                    submitted(entrants[0], {
                        route: 'online',
                        status: 'received',
                    }),
                ],
            })
        );
        renderApp('/educator/rounds/round-1');

        const section = (
            await screen.findByRole('heading', { name: 'Submit results' })
        ).closest('section')!;
        expect(
            within(section)
                .getAllByRole('option')
                .map((o) => o.textContent)
        ).toEqual([
            'Choose an entrant…',
            'Ayanda Khumalo (Grade 11)',
            'Lerato Nkosi',
        ]);
        expect(
            within(section).getByText(
                /Started online but not submitted: Ayanda Khumalo\./
            )
        ).toHaveTextContent('replaces the unfinished online attempt');
        expect(
            within(section).queryByText(/Sat online/)
        ).not.toBeInTheDocument();
        expect(
            within(section).queryByRole('heading', { name: /Submitted/ })
        ).not.toBeInTheDocument();
    });

    it('counts an unfinished online attempt as submitted once the round has closed', async () => {
        mockRound(
            roundDetail({
                state: 'closed',
                status: 'closed',
                submissions: [
                    submitted(entrants[0], {
                        route: 'online',
                        status: 'received',
                    }),
                ],
            })
        );
        renderApp('/educator/rounds/round-1');

        expect(
            await screen.findByRole('heading', { name: 'Submitted (1 of 2)' })
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Sat online · .* · received/)
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Started online but not submitted/)
        ).not.toBeInTheDocument();
    });

    it('lists what was submitted once the round has closed', async () => {
        mockRound(
            roundDetail({
                state: 'closed',
                status: 'closed',
                submissions: [submitted(entrants[1], { status: 'marked' })],
            })
        );
        renderApp('/educator/rounds/round-1');

        expect(
            await screen.findByText('The submission window has closed.')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Submitted (1 of 2)' })
        ).toBeInTheDocument();
        expect(screen.getByText(/Captured · .* · marked/)).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Submit results' })
        ).not.toBeInTheDocument();
    });

    it('lists released past papers and downloads one by its round', async () => {
        mockRound(roundDetail(), {
            pastPapers: [
                {
                    id: 'paper-0',
                    round_id: 'round-0',
                    round_name: 'Round 0 — School',
                    title: 'School paper',
                    timezone: 'Africa/Johannesburg',
                    closed_at: '2026-05-01T10:00:00.000Z',
                    has_paper: true,
                    has_memo: false,
                },
            ],
        });
        const downloads = mockApi(
            'get',
            '/educator/rounds/:roundId/paper/download',
            { url: 'https://storage.test/past.pdf' }
        );
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const { user } = renderApp('/educator/rounds/round-1');

        const past = (
            await screen.findByRole('heading', { name: 'Released past papers' })
        ).closest('section')!;
        expect(within(past).getByText('School paper')).toBeInTheDocument();
        await user.click(
            within(past).getByRole('button', { name: 'Download' })
        );

        await waitFor(() =>
            expect(open).toHaveBeenCalledWith(
                'https://storage.test/past.pdf',
                '_blank'
            )
        );
        expect(downloads[0].path).toBe(
            '/educator/rounds/round-0/paper/download'
        );
    });

    it("shows the school's released results with numeric scores", async () => {
        mockRound(
            roundDetail({
                state: 'results_released',
                status: 'closed',
                opens_at: fx.inHours(-30),
                closes_at: fx.inHours(-28),
            })
        );
        mockApi('get', '/educator/rounds/round-1/results', {
            round: {
                id: 'round-1',
                name: 'Round 1 — Regional',
                state: 'results_released',
                closes_at: fx.inHours(-28),
            },
            results: [
                {
                    id: 'res-1',
                    rank: 1,
                    total_points: '73.5',
                    qualified: true,
                    entrant: {
                        id: 'ent-1',
                        full_name: 'Ayanda Khumalo',
                        grade: '11',
                        external_ref: 'S001',
                    },
                },
                {
                    id: 'res-2',
                    rank: null,
                    total_points: '12',
                    qualified: false,
                    entrant: {
                        id: 'ent-2',
                        full_name: 'Lerato Nkosi',
                        grade: null,
                        external_ref: null,
                    },
                },
            ],
        });
        renderApp('/educator/rounds/round-1');

        const ayanda = (
            await screen.findByText('Ayanda Khumalo', { selector: 'td' })
        ).closest('tr')!;
        expect(
            within(ayanda)
                .getAllByRole('cell')
                .map((c) => c.textContent)
        ).toEqual(['1', 'Ayanda Khumalo', 'S001', '11', '73.5', 'Yes']);
        const lerato = screen
            .getByText('Lerato Nkosi', { selector: 'td' })
            .closest('tr')!;
        expect(
            within(lerato)
                .getAllByRole('cell')
                .map((c) => c.textContent)
        ).toEqual(['—', 'Lerato Nkosi', '—', '—', '12', 'No']);
        expect(
            screen.getByText('The submission window has closed.')
        ).toBeInTheDocument();
    });

    it("doesn't ask for results while the round is still being marked", async () => {
        mockRound(roundDetail({ state: 'marking', status: 'closed' }));
        const resultRequests = mockApiError(
            'get',
            '/educator/rounds/round-1/results',
            400,
            'Results are not yet available — round is "marking"'
        );
        renderApp('/educator/rounds/round-1');

        expect(
            await screen.findByText(
                'Results are being processed. Check back soon.'
            )
        ).toBeInTheDocument();
        expect(resultRequests).toHaveLength(0);
    });

    it('shows a load failure with a way back', async () => {
        mockApiError(
            'get',
            '/educator/rounds/round-1',
            403,
            'Your school is not registered for this olympiad'
        );
        mockApi('get', '/educator/rounds/round-1/papers/past', { papers: [] });
        mockApi('get', '/educator/rounds/round-1/entrants', { entrants: [] });
        renderApp('/educator/rounds/round-1');

        expect(
            await screen.findByText(
                'Failed to load: Your school is not registered for this olympiad'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to dashboard' })
        ).toHaveAttribute('href', '/educator');
    });

    it('shows the Mark submissions button on round detail when in marking state', async () => {
        mockRound(roundDetail({ state: 'marking', status: 'marking' }));

        renderApp('/educator/rounds/round-1');

        const markBtn = await screen.findByRole('link', {
            name: 'Mark submissions',
        });
        expect(markBtn).toBeInTheDocument();
        expect(markBtn).toHaveAttribute(
            'href',
            '/educator/rounds/round-1/marking'
        );
    });
});

describe('educator entrants and invitations', () => {
    const olympiads = [
        { id: 'oly-1', name: 'Maths Olympiad 2026' },
        { id: 'oly-2', name: 'Science Olympiad 2026' },
    ];
    const olympiadEntrant = (overrides: Record<string, unknown> = {}) => ({
        id: fx.id('ent'),
        full_name: 'Ayanda Khumalo',
        grade: '11',
        external_ref: 'S001',
        rounds: [{ id: 'round-1', name: 'Round 1' }],
        ...overrides,
    });

    const mockEntrantsPage = ({
        membershipRole = 'coordinator',
        requiresQualification = false,
    } = {}) => {
        const state = {
            invitations: [
                {
                    id: 'inv-1',
                    status: 'accepted',
                    olympiad: { id: 'oly-1', name: 'Maths Olympiad 2026' },
                    invitee: {
                        id: 'stu-1',
                        name: 'Ayanda Khumalo',
                        email: 'old@student.test',
                    },
                },
            ] as Record<string, unknown>[],
            candidates: [
                {
                    id: 'stu-2',
                    name: 'Lerato Nkosi',
                    email: 'new@student.test',
                },
            ] as Record<string, unknown>[],
            entrants: {
                'oly-1': [olympiadEntrant()],
                'oly-2': [] as ReturnType<typeof olympiadEntrant>[],
            } as Record<string, ReturnType<typeof olympiadEntrant>[]>,
        };
        mockApi('get', '/educator/rounds', { rounds: [], school: fx.school });
        mockApi('get', '/auth/educator-olympiads', { olympiads });
        mockApi('get', '/invites/sent', () => ({ invites: state.invitations }));
        mockApi('get', '/invites/candidates', () => ({
            candidates: state.candidates,
        }));
        mockApi(
            'get',
            '/auth/me',
            fx.me('educator', {
                school_memberships: [
                    {
                        school_id: 'school-1',
                        role: membershipRole,
                        schools: { name: 'Parktown High' },
                    },
                ],
            })
        );
        mockApi('get', '/educator/olympiads/:olympiadId/entrants', (req) => ({
            entrants: state.entrants[req.path.split('/')[3]],
        }));
        mockApi(
            'get',
            '/educator/olympiads/:olympiadId/progression',
            (req) => ({
                rounds: [
                    {
                        roundId: 'round-1',
                        roundName: 'Round 1',
                        requiresQualification: false,
                        previousRound: null,
                        qualifiedEntrantIds: [],
                        state: 'results_released',
                    },
                    {
                        roundId: 'round-2',
                        roundName: 'Round 2',
                        requiresQualification:
                            requiresQualification && req.path.includes('oly-1'),
                        previousRound: null,
                        qualifiedEntrantIds: [],
                        state: 'scheduled',
                    },
                ],
            })
        );
        return state;
    };

    it("shows invitations and the first olympiad's registered entrants", async () => {
        mockEntrantsPage();
        renderApp('/educator/entrants');

        expect(
            await screen.findByRole('heading', {
                name: 'Registered entrants (1)',
            })
        ).toBeInTheDocument();
        const row = screen.getByText('Ayanda Khumalo').closest('tr')!;
        expect(
            within(row)
                .getAllByRole('cell')
                .map((c) => c.textContent)
        ).toEqual(['Ayanda Khumalo', 'S001', '11', 'Round 1']);
        expect(screen.getByLabelText('Olympiad')).toHaveValue('oly-1');
        expect(
            screen.getByRole('heading', { name: 'Student invitations (1)' })
        ).toBeInTheDocument();
        expect(
            screen.getByText('Ayanda Khumalo · Maths Olympiad 2026')
        ).toBeInTheDocument();
        expect(screen.getByText('accepted')).toBeInTheDocument();
    });

    it('loads the entrants of the olympiad the educator switches to', async () => {
        mockEntrantsPage();
        const { user } = renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        await user.selectOptions(screen.getByLabelText('Olympiad'), 'oly-2');

        expect(
            await screen.findByText(
                'No entrants registered for this olympiad yet.'
            )
        ).toBeInTheDocument();
    });

    it('registers an entrant and refreshes the list', async () => {
        const state = mockEntrantsPage();
        const registrations = mockApi(
            'post',
            '/educator/olympiads/:olympiadId/entrants',
            (req) => {
                const [entrant] = (
                    req.body as { entrants: Record<string, string>[] }
                ).entrants;
                const created = olympiadEntrant({
                    ...entrant,
                    rounds: [
                        { id: 'round-1', name: 'Round 1' },
                        { id: 'round-2', name: 'Round 2' },
                    ],
                });
                state.entrants['oly-1'] = [...state.entrants['oly-1'], created];
                return { entrants: [created] };
            },
            { status: 201 }
        );
        const { user } = renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        await user.type(screen.getByLabelText(/Full name/), '  Lerato Nkosi ');
        await user.type(screen.getByLabelText('Student number'), 'S002');
        await user.selectOptions(screen.getByLabelText('Grade'), '9');
        await user.click(screen.getByRole('button', { name: 'Add entrant' }));

        expect(
            await screen.findByText(
                'Lerato Nkosi has been registered for Round 1, Round 2.'
            )
        ).toBeInTheDocument();
        expect(
            await screen.findByRole('heading', {
                name: 'Registered entrants (2)',
            })
        ).toBeInTheDocument();
        expect(registrations[0].path).toBe(
            '/educator/olympiads/oly-1/entrants'
        );
        expect(registrations[0].body).toEqual({
            entrants: [
                { full_name: 'Lerato Nkosi', grade: '9', external_ref: 'S002' },
            ],
        });
        expect(screen.getByLabelText(/Full name/)).toHaveValue('');
    });

    it("says when a saved learner isn't eligible for any open round", async () => {
        mockEntrantsPage();
        mockApi(
            'post',
            '/educator/olympiads/:olympiadId/entrants',
            {
                entrants: [
                    olympiadEntrant({ full_name: 'Late Learner', rounds: [] }),
                ],
            },
            { status: 201 }
        );
        const { user } = renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        await user.type(screen.getByLabelText(/Full name/), 'Late Learner');
        await user.click(screen.getByRole('button', { name: 'Add entrant' }));

        expect(
            await screen.findByText(
                "Late Learner was saved, but isn't eligible for any open round yet."
            )
        ).toBeInTheDocument();
    });

    it("shows the backend's reason when registration is refused", async () => {
        mockEntrantsPage();
        mockApiError(
            'post',
            '/educator/olympiads/:olympiadId/entrants',
            403,
            'Your school is not registered for this olympiad'
        );
        const { user } = renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        await user.type(screen.getByLabelText(/Full name/), 'Lerato Nkosi');
        await user.click(screen.getByRole('button', { name: 'Add entrant' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Your school is not registered for this olympiad'
        );
    });

    it('warns when later rounds require qualification', async () => {
        mockEntrantsPage({ requiresQualification: true });
        renderApp('/educator/entrants');
        expect(
            await screen.findByText(
                /require entrants to have qualified from a previous round/
            )
        ).toBeInTheDocument();
    });

    it('invites a student from the school and adds the invitation to the list', async () => {
        const state = mockEntrantsPage();
        const invites = mockApi(
            'post',
            '/invites',
            () => {
                state.invitations = [
                    {
                        id: 'inv-2',
                        status: 'pending',
                        olympiad: { id: 'oly-1', name: 'Maths Olympiad 2026' },
                        invitee: {
                            id: 'stu-2',
                            name: 'Lerato Nkosi',
                            email: 'new@student.test',
                        },
                    },
                    ...state.invitations,
                ];
                return { invite: { id: 'inv-2' } };
            },
            { status: 201 }
        );
        const { user } = renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        await user.selectOptions(
            screen.getByRole('combobox', { name: /^Student/ }),
            'stu-2'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send invitation' })
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Lerato Nkosi will see this invitation on their dashboard.'
        );
        expect(
            await screen.findByText('Lerato Nkosi · Maths Olympiad 2026')
        ).toBeInTheDocument();
        expect(invites[0].body).toEqual({
            olympiad_id: 'oly-1',
            invitee_id: 'stu-2',
        });
    });

    it("shows the backend's reason when an invitation is refused", async () => {
        mockEntrantsPage();
        mockApiError(
            'post',
            '/invites',
            409,
            'That person has already been invited to this olympiad'
        );
        const { user } = renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        await user.selectOptions(
            screen.getByRole('combobox', { name: /^Student/ }),
            'stu-2'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send invitation' })
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'That person has already been invited to this olympiad'
        );
    });

    it('says so when there is nobody left to invite, and disables the picker', async () => {
        const state = mockEntrantsPage();
        state.candidates = [];
        renderApp('/educator/entrants');

        await screen.findByText('Ayanda Khumalo');
        const picker = screen.getByRole('combobox', { name: /^Student/ });
        expect(picker).toBeDisabled();
        expect(
            within(picker).getByRole('option', {
                name: 'No students left to invite',
            })
        ).toBeInTheDocument();
    });

    it("tells the educator when invitations couldn't be loaded", async () => {
        mockApi('get', '/educator/rounds', { rounds: [], school: fx.school });
        mockApiError(
            'get',
            '/auth/educator-olympiads',
            500,
            'Internal server error'
        );
        mockApi('get', '/invites/sent', { invites: [] });
        mockApi('get', '/auth/me', fx.me('educator'));
        renderApp('/educator/entrants');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            "We couldn't load your invitations. Please refresh the page."
        );
        expect(
            screen.getByRole('option', { name: 'No olympiads available' })
        ).toBeInTheDocument();
    });
});

describe('educator results', () => {
    const rounds = [
        {
            id: 'round-2',
            name: 'Round 2 — Provincial',
            olympiad_name: 'Maths Olympiad 2026',
            timezone: 'Africa/Johannesburg',
            closes_at: '2026-08-01T10:00:00.000Z',
            results: [
                {
                    id: 'res-1',
                    rank: 3,
                    total_points: '81.25',
                    qualified: true,
                    entrant: {
                        id: 'ent-1',
                        full_name: 'Ayanda Khumalo',
                        grade: '11',
                        external_ref: 'S001',
                    },
                },
            ],
        },
        {
            id: 'round-1',
            name: 'Round 1 — Regional',
            olympiad_name: 'Maths Olympiad 2026',
            timezone: 'Africa/Johannesburg',
            closes_at: '2026-05-01T10:00:00.000Z',
            results: [],
        },
    ];

    it("shows the latest round's results and switches rounds", async () => {
        mockApi('get', '/educator/results', { rounds });
        const { user } = renderApp('/educator/results');

        const row = (await screen.findByText('Ayanda Khumalo')).closest('tr')!;
        expect(
            within(row)
                .getAllByRole('cell')
                .map((c) => c.textContent)
        ).toEqual(['3', 'Ayanda Khumalo', 'S001', '11', '81.25', 'Yes']);
        expect(screen.getByText(/· 1 entrant$/)).toBeInTheDocument();

        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Round' }),
            'round-1'
        );
        expect(
            screen.getByText('No results for your entrants in this round.')
        ).toBeInTheDocument();
        expect(screen.getByText(/· 0 entrants$/)).toBeInTheDocument();
    });

    it('explains when no results have been released', async () => {
        mockApi('get', '/educator/results', { rounds: [] });
        renderApp('/educator/results');
        expect(
            await screen.findByText(/No results available yet/)
        ).toBeInTheDocument();
    });

    it("shows why results couldn't be loaded", async () => {
        mockApiError(
            'get',
            '/educator/results',
            403,
            'Educator profile not found'
        );
        renderApp('/educator/results');
        expect(
            await screen.findByText(
                'Failed to load results: Educator profile not found'
            )
        ).toBeInTheDocument();
    });
});

describe('educator marking queue', () => {
    const queueSubmission = {
        id: 'sub-1',
        received_at: '2026-06-01T10:00:00Z',
        entrants: { id: 'ent-1', full_name: 'Ayanda Khumalo', grade: '11' },
        answers: [
            {
                id: 'ans-1',
                answer_value: 'Because primes are infinite',
                questions: {
                    id: 'q-1',
                    prompt: 'Prove there are infinitely many primes.',
                    type: 'essay',
                    options: null,
                    correct_option: null,
                    correct_answer: null,
                    max_points: 10,
                },
            },
        ],
    };

    it('loads the queue and awards marks for an answer', async () => {
        let queue: any[] = [queueSubmission];
        mockApi('get', '/rounds/round-1/marking-queue', () => ({
            submissions: queue,
        }));
        mockApi('get', '/rounds/round-1/submissions', {
            submissions: [{ id: 'sub-1', route: 'online' }],
        });
        mockApi('get', '/rounds/round-1/review-sample', { sample: [] });
        const marks = mockApi(
            'patch',
            '/rounds/round-1/answers/:answerId',
            () => {
                queue = [];
                return {
                    answerId: 'ans-1',
                    is_correct: true,
                    points_awarded: 8,
                };
            }
        );

        const { user } = renderApp('/educator/rounds/round-1/marking');

        expect(await screen.findByText('Ayanda Khumalo')).toBeInTheDocument();
        expect(
            screen.getByText('Prove there are infinitely many primes.')
        ).toBeInTheDocument();
        expect(
            screen.getByText('Because primes are infinite')
        ).toBeInTheDocument();

        const pointsInput = screen.getByRole('spinbutton');
        await user.clear(pointsInput);
        await user.type(pointsInput, '8');
        await user.click(screen.getByRole('button', { name: 'Award' }));

        await waitFor(() => expect(marks).toHaveLength(1));
        expect(marks[0].body).toEqual({ is_correct: true, points_awarded: 8 });
        expect(
            await screen.findByRole('heading', { name: 'Nothing to mark' })
        ).toBeInTheDocument();
    });

    it('moderates a sampled answer and saves a review', async () => {
        let reviews: { id: string }[] = [];
        mockApi('get', '/rounds/round-1/marking-queue', { submissions: [] });
        mockApi('get', '/rounds/round-1/submissions', { submissions: [] });
        mockApi('get', '/rounds/round-1/review-sample', () => ({
            sample: [
                {
                    id: 'ans-mod-1',
                    answer_value: 'A rigorous mathematical induction step',
                    points_awarded: '5',
                    questions: {
                        prompt: 'Prove the theorem by induction.',
                        max_points: '10',
                    },
                    submissions: { entrants: { full_name: 'Lerato Nkosi' } },
                    marking_reviews: reviews,
                    users: {
                        id: 'u-org',
                        email: 'organiser@test.com',
                        full_name: 'Lead Organiser',
                    },
                },
            ],
        }));
        const saved = mockApi(
            'patch',
            '/rounds/round-1/review-sample/:answerId',
            () => {
                reviews = [{ id: 'rev-1' }];
                return { message: 'Review saved and results recalculated' };
            }
        );

        const { user } = renderApp('/educator/rounds/round-1/marking');

        expect(await screen.findByText('Lerato Nkosi')).toBeInTheDocument();
        expect(
            screen.getByText(
                /Mark: 5\/10 \| Reviews: 0 \| Marker: Lead Organiser/
            )
        ).toBeInTheDocument();

        const points = screen.getByLabelText('Reviewed points');
        await user.clear(points);
        await user.type(points, '7');
        await user.type(
            screen.getByLabelText('Review comment'),
            'Clear inductive step presented'
        );
        await user.click(screen.getByRole('button', { name: 'Save review' }));

        expect(
            await screen.findByText('Review saved and results recalculated')
        ).toBeInTheDocument();
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            path: '/rounds/round-1/review-sample/ans-mod-1',
            body: {
                points_awarded: 7,
                comment: 'Clear inductive step presented',
            },
        });
    });
});
