import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as fx from './support/fixtures';
import { mockApi, mockApiError } from './support/network';
import { renderApp } from './support/renderApp';

describe('organiser dashboard', () => {
    const rounds = () => [
        fx.organiserRound({
            id: 'r-open',
            name: 'Round 1',
            state: 'open',
            exam_status: 'live',
            _count: { submissions: 14, entrant_registrations: 30 },
        }),
        fx.organiserRound({
            id: 'r-ready',
            name: 'Round 2',
            state: 'scheduled',
            exam_status: 'ready',
            _count: { submissions: 0, entrant_registrations: 12 },
        }),
        fx.organiserRound({
            id: 'r-done',
            name: 'Round 0',
            state: 'results_released',
            exam_status: 'live',
            _count: { submissions: 6, entrant_registrations: 6 },
        }),
    ];

    describe('with more than one olympiad', () => {
        const twoOlympiads = () => {
            mockApi('get', '/olympiads', {
                olympiads: [
                    fx.olympiad({ id: 'oly-2', name: 'Science Olympiad' }),
                    fx.olympiad(),
                ],
            });
            mockApi('get', '/olympiads/oly-2/rounds', {
                rounds: [
                    fx.organiserRound({ id: 'r-sci', name: 'Science heats' }),
                ],
            });
            mockApi('get', '/olympiads/oly-1/rounds', {
                rounds: [
                    fx.organiserRound({ id: 'r-maths', name: 'Maths heats' }),
                ],
            });
        };

        it('shows the olympiad chosen in the sidebar, and switches when another is chosen', async () => {
            twoOlympiads();
            const { user } = renderApp('/organiser');
            expect(
                await screen.findByText('Science heats')
            ).toBeInTheDocument();

            await user.selectOptions(
                screen.getByLabelText('Current olympiad'),
                'oly-1'
            );

            expect(await screen.findByText('Maths heats')).toBeInTheDocument();
            expect(screen.queryByText('Science heats')).not.toBeInTheDocument();
        });

        it('remembers the choice on this device', async () => {
            twoOlympiads();
            localStorage.setItem('op_current_olympiad', 'oly-1');
            renderApp('/organiser');

            expect(await screen.findByText('Maths heats')).toBeInTheDocument();
            expect(screen.getByLabelText('Current olympiad')).toHaveValue(
                'oly-1'
            );
        });

        it('falls back to the newest when the remembered one no longer exists', async () => {
            twoOlympiads();
            localStorage.setItem('op_current_olympiad', 'oly-deleted');
            renderApp('/organiser');

            expect(
                await screen.findByText('Science heats')
            ).toBeInTheDocument();
        });
    });

    it('summarises the olympiad and lists its rounds with the right actions', async () => {
        mockApi('get', '/olympiads', {
            olympiads: [
                fx.olympiad({ _count: { rounds: 3, school_registrations: 4 } }),
            ],
        });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: rounds() });
        renderApp('/organiser');

        const table = await screen.findByRole('table');
        await within(table).findByText('Round 1');

        // Each stat is a Card (<section>) holding its label and value
        const stat = (label: string) =>
            screen.getByText(label).closest('section')!;
        expect(
            within(stat('Schools registered') as HTMLElement).getByText('4')
        ).toBeInTheDocument();
        expect(
            within(stat('Submissions received') as HTMLElement).getByText('20')
        ).toBeInTheDocument();
        expect(
            within(stat('Rounds currently open') as HTMLElement).getByText('1')
        ).toBeInTheDocument();
        expect(
            within(stat('Exams awaiting review') as HTMLElement).getByText('1')
        ).toBeInTheDocument();

        const row = (name: string) =>
            within(table).getByText(name).closest('tr')!;
        expect(within(row('Round 1')).getByText('Open')).toBeInTheDocument();
        expect(
            within(row('Round 1')).getByRole('button', { name: 'Close round' })
        ).toBeInTheDocument();
        expect(
            within(row('Round 2')).getByText('Exam ready for review')
        ).toBeInTheDocument();
        expect(
            within(row('Round 2')).getByRole('button', { name: 'Open round' })
        ).toBeInTheDocument();
        expect(
            within(row('Round 0')).getByRole('button', { name: 'Closed' })
        ).toBeDisabled();
        expect(
            within(row('Round 2')).getByRole('link', { name: 'Review' })
        ).toHaveAttribute('href', '/organiser/rounds/r-ready/review');
        expect(
            screen.getByRole('heading', {
                name: 'Maths Olympiad 2026 — Rounds',
            })
        ).toBeInTheDocument();
    });

    // Round times are the olympiad's official times, whatever the viewer's
    // device is set to: the table and the edit form must agree
    it("shows and edits round times in the olympiad's timezone", async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        const round = fx.organiserRound({
            id: 'r-1',
            name: 'Round 1',
            opens_at: '2026-10-01T06:00:00.000Z',
            closes_at: '2026-10-01T08:30:00.000Z',
        });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [round] });
        mockApi('get', '/rounds/:id', {
            round: {
                ...round,
                state: 'scheduled',
                olympiads: { timezone: 'Africa/Johannesburg' },
                papers: [],
            },
        });
        const edits = mockApi('patch', '/rounds/r-1', { round, warnings: [] });
        const { user } = renderApp('/organiser');

        const row = (await screen.findByText('Round 1')).closest('tr')!;
        expect(
            within(row).getByText('01 Oct 2026, 08:00 SAST')
        ).toBeInTheDocument();
        expect(
            within(row).getByText('01 Oct 2026, 10:30 SAST')
        ).toBeInTheDocument();

        await user.click(within(row).getByRole('link', { name: 'Edit round' }));
        await screen.findByRole('heading', { name: 'Edit round: Round 1' });
        const opens = screen.getByLabelText('Opens at (SAST)');
        expect(opens).toHaveValue('2026-10-01T08:00');
        expect(screen.getByLabelText('Closes at (SAST)')).toHaveValue(
            '2026-10-01T10:30'
        );

        fireEvent.change(opens, { target: { value: '2026-10-01T09:00' } });
        await user.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(edits).toHaveLength(1));
        expect(edits[0].body).toMatchObject({
            opens_at: '2026-10-01T07:00:00.000Z',
            closes_at: '2026-10-01T08:30:00.000Z',
        });
    });

    it('opens a round and shows its new state', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        let current = rounds();
        mockApi('get', '/olympiads/oly-1/rounds', () => ({ rounds: current }));
        const stateChanges = mockApi('patch', '/rounds/:id/state', (req) => {
            current = current.map((r) =>
                r.id === 'r-ready' ? { ...r, state: 'open' } : r
            );
            return { round: { id: req.path.split('/')[2] } };
        });
        const { user } = renderApp('/organiser');

        const table = await screen.findByRole('table');
        const round2 = (await within(table).findByText('Round 2')).closest(
            'tr'
        )!;
        await user.click(
            within(round2).getByRole('button', { name: 'Open round' })
        );

        await waitFor(() =>
            expect(
                within(round2).getByRole('button', { name: 'Close round' })
            ).toBeInTheDocument()
        );
        expect(stateChanges.map((c) => [c.path, c.body])).toEqual([
            ['/rounds/r-ready/state', { state: 'open' }],
        ]);
    });

    it('shows why a state change was refused', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: rounds() });
        mockApiError(
            'patch',
            '/rounds/:id/state',
            400,
            'Cannot transition from "open" to "closed"'
        );
        const { user } = renderApp('/organiser');

        const round1 = (await screen.findByText('Round 1')).closest('tr')!;
        await user.click(
            within(round1).getByRole('button', { name: 'Close round' })
        );

        expect(
            await screen.findByText('Cannot transition from "open" to "closed"')
        ).toBeInTheDocument();
    });

    it('asks a brand-new organiser to create their first olympiad', async () => {
        mockApi('get', '/olympiads', { olympiads: [] });
        const created = mockApi(
            'post',
            '/olympiads',
            { olympiad: fx.olympiad() },
            { status: 201 }
        );
        renderApp('/organiser');

        expect(
            await screen.findByRole('heading', { name: 'No olympiads yet' })
        ).toBeInTheDocument();
        expect(created).toHaveLength(0);
    });

    it("shows an error when the olympiad can't be loaded", async () => {
        // (A 401 ends the session instead; see auth.test.tsx)
        mockApiError('get', '/olympiads', 500, 'Database unavailable');
        renderApp('/organiser');
        expect(
            await screen.findByText('Database unavailable')
        ).toBeInTheDocument();
    });

    it('navigates to create a round', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
        const { user, currentPath } = renderApp('/organiser');

        await screen.findByText(/No rounds created yet/);
        await user.click(
            screen.getAllByRole('link', { name: 'Create round' })[0]
        );
        expect(currentPath()).toBe('/organiser/rounds/new');
        expect(
            await screen.findByRole('heading', { name: 'Create a round' })
        ).toBeInTheDocument();
    });
});

describe('olympiads page', () => {
    it('lists olympiads with their counts and creates a new one', async () => {
        let olympiads = [
            fx.olympiad({ _count: { rounds: 2, school_registrations: 3 } }),
        ];
        mockApi('get', '/olympiads', () => ({ olympiads }));
        const created = mockApi(
            'post',
            '/olympiads',
            (req) => {
                const next = fx.olympiad({
                    id: 'oly-2',
                    name: (req.body as { name: string }).name,
                    _count: { rounds: 0, school_registrations: 0 },
                });
                olympiads = [next, ...olympiads];
                return { olympiad: next };
            },
            { status: 201 }
        );
        const { user } = renderApp('/organiser/olympiads');

        // (the sidebar's switcher lists the olympiads too, so look in the page)
        const first = (
            await within(screen.getByRole('main')).findByText(
                'Maths Olympiad 2026'
            )
        ).closest('tr')!;
        expect(
            within(first)
                .getAllByRole('cell')
                .map((c) => c.textContent)
        ).toEqual([
            expect.stringContaining('Maths Olympiad 2026'),
            'oly-1',
            '2',
            '3',
            'Invite EducatorEdit olympiadDelete',
        ]);

        await user.type(
            screen.getByPlaceholderText('e.g. 2026 National Competition'),
            'Science Olympiad'
        );
        await user.click(screen.getByRole('button', { name: 'Create' }));

        expect(
            await within(screen.getByRole('main')).findByText(
                'Science Olympiad'
            )
        ).toBeInTheDocument();
        // South African time unless the organiser picks another zone
        expect(created[0].body).toEqual({
            name: 'Science Olympiad',
            timezone: 'Africa/Johannesburg',
        });
        expect(
            screen.getByPlaceholderText('e.g. 2026 National Competition')
        ).toHaveValue('');

        // The new olympiad becomes the one being worked on, and the sidebar can
        // switch back to the earlier one
        const switcher = screen.getByLabelText('Current olympiad');
        await waitFor(() => expect(switcher).toHaveValue('oly-2'));
        await user.selectOptions(switcher, 'oly-1');
        expect(switcher).toHaveValue('oly-1');
        expect(localStorage.getItem('op_current_olympiad')).toBe('oly-1');
    });

    it('creates an olympiad in the timezone the organiser picks', async () => {
        mockApi('get', '/olympiads', { olympiads: [] });
        const created = mockApi(
            'post',
            '/olympiads',
            { olympiad: fx.olympiad({ timezone: 'Africa/Nairobi' }) },
            { status: 201 }
        );
        const { user } = renderApp('/organiser/olympiads');

        await user.type(
            await screen.findByPlaceholderText(
                'e.g. 2026 National Competition'
            ),
            'East Africa Olympiad'
        );
        await user.selectOptions(
            screen.getByLabelText('Timezone'),
            'Africa/Nairobi'
        );
        await user.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(created).toHaveLength(1));
        expect(created[0].body).toEqual({
            name: 'East Africa Olympiad',
            timezone: 'Africa/Nairobi',
        });
        expect(screen.getByLabelText('Timezone')).toHaveValue(
            'Africa/Johannesburg'
        );
    });

    it('labels the signed-in user as an organiser', async () => {
        mockApi('get', '/olympiads', { olympiads: [] });
        renderApp('/organiser/olympiads');
        await screen.findByText('No olympiads registered yet.');
        expect(
            within(screen.getByRole('complementary')).getByText('Organiser')
        ).toBeInTheDocument();
    });

    it('shows the reason a new olympiad was rejected', async () => {
        mockApi('get', '/olympiads', { olympiads: [] });
        mockApiError('post', '/olympiads', 422, 'Name is required');
        const { user } = renderApp('/organiser/olympiads');

        await user.type(
            await screen.findByPlaceholderText(
                'e.g. 2026 National Competition'
            ),
            'x'
        );
        await user.click(screen.getByRole('button', { name: 'Create' }));
        expect(await screen.findByText('Name is required')).toBeInTheDocument();
    });

    it('invites an educator to the olympiad chosen in the table', async () => {
        mockApi('get', '/olympiads', {
            olympiads: [
                fx.olympiad(),
                fx.olympiad({ id: 'oly-2', name: 'Science Olympiad' }),
            ],
        });
        mockApi('get', '/me/olympiad-invitation-candidates', {
            candidates: [
                {
                    id: 'edu-1',
                    name: 'Ms Naidoo',
                    email: 'naidoo@parktown.test',
                    school: { id: 'school-1', name: 'Parktown High' },
                },
            ],
        });
        const invites = mockApi(
            'post',
            '/olympiad-invitations',
            { invite: { id: 'inv-1' } },
            { status: 201 }
        );
        const { user } = renderApp('/organiser/olympiads');

        const science = (
            await within(screen.getByRole('main')).findByText(
                'Science Olympiad'
            )
        ).closest('tr')!;
        await user.click(
            within(science).getByRole('button', { name: 'Invite Educator' })
        );

        expect(screen.getByLabelText('Olympiad')).toHaveValue('oly-2');
        await user.selectOptions(
            await screen.findByLabelText('Educator'),
            'edu-1'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send invitation' })
        );

        expect(
            await screen.findByText(/Ms Naidoo will see this invitation/)
        ).toBeInTheDocument();
        expect(invites[0].body).toEqual({
            olympiad_id: 'oly-2',
            invitee_id: 'edu-1',
        });
    });
});

describe('schools page', () => {
    // GET /olympiads/:id/schools returns participating schools plus outstanding
    // educator invitations
    const schools = [
        {
            id: 'inv-1',
            name: 'Parktown High',
            address: '1 Park Rd',
            entrants: 35,
            educators: [
                { name: 'Ms Naidoo', email: 'naidoo@parktown.test' },
                { name: 'Mr Pillay', email: 'pillay@parktown.test' },
            ],
            contactEmail: 'head@parktown.test',
            status: 'accepted',
        },
        {
            id: 'inv-2',
            name: 'Northview College',
            address: null,
            entrants: 0,
            educators: [],
            contactEmail: 'principal@northview.test',
            status: 'pending',
        },
        {
            id: 'inv-3',
            name: 'Declined School',
            address: null,
            entrants: 0,
            educators: [],
            contactEmail: null,
            status: 'declined',
        },
    ];

    it("shows each school's educators, entrants and invitation status", async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/schools', { schools });
        renderApp('/organiser/schools');

        const row = async (name: string) =>
            (await screen.findByText(name)).closest('tr')!;
        const parktown = await row('Parktown High');
        expect(within(parktown).getByText('2')).toBeInTheDocument();
        expect(
            within(parktown).getByRole('link', { name: 'pillay@parktown.test' })
        ).toHaveAttribute('href', 'mailto:pillay@parktown.test');
        expect(within(parktown).getByText('35')).toBeInTheDocument();
        expect(within(parktown).getByText('Participating')).toBeInTheDocument();
        expect(
            within(parktown).getByText('head@parktown.test')
        ).toBeInTheDocument();
        expect(
            within(await row('Northview College')).getByText('Invited')
        ).toBeInTheDocument();
        expect(
            within(await row('Declined School')).getByText('Declined')
        ).toBeInTheDocument();
        expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
    });

    it('invites an educator from the dialog and refreshes the list', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        let list: typeof schools = [];
        const listCalls = mockApi('get', '/olympiads/oly-1/schools', () => ({
            schools: list,
        }));
        mockApi('get', '/me/olympiad-invitation-candidates', {
            candidates: [
                {
                    id: 'edu-2',
                    name: 'Mr Khumalo',
                    email: 'principal@northview.test',
                    school: { id: 'school-2', name: 'Northview College' },
                },
            ],
        });
        const invites = mockApi(
            'post',
            '/olympiad-invitations',
            () => {
                list = [schools[1]];
                return { invite: { id: 'inv-2' } };
            },
            { status: 201 }
        );
        const { user } = renderApp('/organiser/schools');

        expect(
            await screen.findByText(/No schools taking part yet/)
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Invite educator' })
        );
        expect(screen.queryByLabelText('Olympiad')).not.toBeInTheDocument();
        await user.selectOptions(
            await screen.findByLabelText('Educator'),
            'edu-2'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send invitation' })
        );

        expect(
            await screen.findByText(/Mr Khumalo will see this invitation/)
        ).toBeInTheDocument();
        expect(invites[0].body).toEqual({
            olympiad_id: 'oly-1',
            invitee_id: 'edu-2',
        });
        await waitFor(() => expect(listCalls).toHaveLength(2));

        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(
            await screen.findByText('Northview College')
        ).toBeInTheDocument();
    });
});

describe('creating a round', () => {
    const localInput = '2026-10-01T08:00';
    const localClose = '2026-10-01T10:30';

    // Before creating a round, the form asks the server whether its dates fall
    // on a public holiday
    let dateChecks: ReturnType<typeof mockApi>;
    beforeEach(() => {
        dateChecks = mockApi('post', '/olympiads/oly-1/rounds/date-check', { warnings: [] });
    });

    const fillRoundForm = async (
        user: ReturnType<typeof renderApp>['user']
    ) => {
        // (the sidebar's switcher lists the olympiads too, so look in the form)
        await within(screen.getByRole('main')).findByRole('option', {
            name: 'Maths Olympiad 2026',
        });
        await user.selectOptions(screen.getByLabelText(/^Olympiad/), 'oly-1');
        await user.type(
            screen.getByLabelText(/^Round name/),
            'Round 3 — Provincial'
        );
        await user.type(
            screen.getByLabelText('Qualifying threshold (%)'),
            '62.5'
        );
        await user.type(
            screen.getByLabelText('Instructions for educators'),
            'Calculators allowed'
        );
        fireEvent.change(screen.getByLabelText(/^Opens at/), {
            target: { value: localInput },
        });
        fireEvent.change(screen.getByLabelText(/^Closes at/), {
            target: { value: localClose },
        });
    };

    it('creates the round, uploads its paper and returns to the dashboard', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
        const created = mockApi(
            'post',
            '/olympiads/oly-1/rounds',
            { round: { id: 'round-new' } },
            { status: 201 }
        );
        const uploads = mockApi(
            'post',
            '/rounds/round-new/papers',
            { paper: { id: 'paper-1' } },
            { status: 201 }
        );
        const { user, currentPath } = renderApp('/organiser/rounds/new');

        await fillRoundForm(user);
        // The form says which timezone the typed times are in
        expect(
            screen.getByText(/Times are in the olympiad's timezone \(SAST\)/)
        ).toBeInTheDocument();
        await user.upload(
            screen.getByLabelText('Paper file'),
            new File(['%PDF-1.4'], 'round3.pdf', { type: 'application/pdf' })
        );
        await user.click(screen.getByRole('button', { name: 'Create round' }));

        await waitFor(() => expect(currentPath()).toBe('/organiser'));
        // 08:00 and 10:30 typed for a South African olympiad are 06:00 and 08:30 UTC
        expect(created[0].body).toEqual({
            name: 'Round 3 — Provincial',
            notes: 'Calculators allowed',
            opens_at: '2026-10-01T06:00:00.000Z',
            closes_at: '2026-10-01T08:30:00.000Z',
            qualifying_threshold: 62.5,
        });
        // Holidays are checked on that olympiad's calendar (in the URL)
        expect(dateChecks[0].body).toEqual({
            opens_at: '2026-10-01T06:00:00.000Z',
            closes_at: '2026-10-01T08:30:00.000Z',
        });
        expect(uploads).toHaveLength(1);
        expect(uploads[0].headers.get('authorization')).toBe(
            'Bearer test-token'
        );
        expect(uploads[0].headers.get('content-type')).toMatch(
            /^multipart\/form-data/
        );
        const paper = (uploads[0].body as FormData).get('paper') as File;
        expect([paper.name, paper.type, await paper.text()]).toEqual([
            'round3.pdf',
            'application/pdf',
            '%PDF-1.4',
        ]);
        expect((uploads[0].body as FormData).has('memo')).toBe(false);
    });

    it('skips the upload when no files are chosen', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
        const created = mockApi(
            'post',
            '/olympiads/oly-1/rounds',
            { round: { id: 'round-new' } },
            { status: 201 }
        );
        const uploads = mockApi('post', '/rounds/round-new/papers', {});
        const { user, currentPath } = renderApp('/organiser/rounds/new');

        await fillRoundForm(user);
        await user.clear(screen.getByLabelText('Qualifying threshold (%)'));
        await user.click(screen.getByRole('button', { name: 'Create round' }));

        await waitFor(() => expect(currentPath()).toBe('/organiser'));
        expect(created[0].body).toMatchObject({ qualifying_threshold: null });
        expect(uploads).toHaveLength(0);
    });

    it('warns about a public holiday and creates the round only once confirmed', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
        dateChecks = mockApi('post', '/olympiads/oly-1/rounds/date-check', {
            warnings: ['2026-10-01 falls on a public holiday: Heritage Day'],
        });
        const created = mockApi(
            'post',
            '/olympiads/oly-1/rounds',
            { round: { id: 'round-new' } },
            { status: 201 }
        );
        const { user, currentPath } = renderApp('/organiser/rounds/new');

        await fillRoundForm(user);
        await user.click(screen.getByRole('button', { name: 'Create round' }));

        // Nothing is created until the organiser decides
        expect(
            await screen.findByText('Public holiday clashes detected')
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                '2026-10-01 falls on a public holiday: Heritage Day'
            )
        ).toBeInTheDocument();
        expect(created).toHaveLength(0);

        await user.click(screen.getByRole('button', { name: 'Create anyway' }));

        await waitFor(() => expect(currentPath()).toBe('/organiser'));
        expect(created).toHaveLength(1);
    });

    it("keeps the organiser on the form with the server's error", async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApiError(
            'post',
            '/olympiads/oly-1/rounds',
            400,
            'closes_at must be after opens_at'
        );
        const { user, currentPath } = renderApp('/organiser/rounds/new');

        await fillRoundForm(user);
        await user.click(screen.getByRole('button', { name: 'Create round' }));

        expect(
            await screen.findByText('closes_at must be after opens_at')
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/organiser/rounds/new');
        expect(
            screen.getByRole('button', { name: 'Create round' })
        ).toBeEnabled();
    });

    it('asks for an olympiad first when the organiser has none', async () => {
        mockApi('get', '/olympiads', { olympiads: [] });
        renderApp('/organiser/rounds/new');

        expect(
            await screen.findByText(/No olympiads found/)
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Create round' })
        ).toBeDisabled();
    });
});
