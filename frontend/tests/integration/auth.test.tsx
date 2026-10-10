import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as fx from './support/fixtures';
import {
    mockApi,
    mockApiError,
    mockNetworkFailure,
    mockSupabasePasswordReset,
    mockSupabaseSignIn,
    mockSupabaseSignOut,
} from './support/network';
import { renderApp } from './support/renderApp';

// Stops the dashboard each role lands on from making unhandled requests
const mockLandingPages = () => {
    mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
    mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
    mockApi('get', '/educator/rounds', { rounds: [], school: fx.school });
    mockApi('get', '/rounds/registered', {
        rounds: [],
        stats: { roundsEntered: 0, resultsAvailable: 0, certificatesEarned: 0 },
    });
    mockApi('get', '/invites/mine', { invites: [] });
};

beforeEach(() => {
    localStorage.removeItem('op_access_token');
});

describe('logging in', () => {
    const fillAndSubmit = async (
        user: ReturnType<typeof renderApp>['user'],
        password = 'Secret123'
    ) => {
        await user.type(
            screen.getByLabelText('Email address'),
            'thandi@olympiad.test'
        );
        await user.type(screen.getByLabelText('Password'), password);
        await user.click(screen.getByRole('button', { name: 'Log in' }));
    };

    it('shows the public landing page with working login and signup navigation', async () => {
        const { user, currentPath } = renderApp('/');
        expect(currentPath()).toBe('/');
        expect(
            screen.getByRole('heading', { name: /A place for bright minds/i })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Join the portal' })
        ).toHaveAttribute('href', '/signup');
        await user.click(screen.getByRole('link', { name: 'Log in' }));
        expect(currentPath()).toBe('/login');
        expect(
            screen.getByRole('heading', { name: 'Log in' })
        ).toBeInTheDocument();
    });

    it.each([
        ['organiser', '/organiser', 'Organiser dashboard'],
        ['educator', '/educator', 'Your rounds'],
        ['student', '/student', 'Your olympiad'],
    ] as const)(
        'signs a %s in and opens their dashboard',
        async (role, path, heading) => {
            mockLandingPages();
            const signIns = mockSupabaseSignIn({
                userId: `${role}-user`,
                accessToken: `jwt-for-${role}`,
            });
            mockApi('get', '/auth/me', fx.me(role));
            const { user, currentPath } = renderApp('/login');

            await fillAndSubmit(user);

            expect(
                await screen.findByRole('heading', { name: heading })
            ).toBeInTheDocument();
            expect(currentPath()).toBe(path);
            expect(signIns).toEqual([
                {
                    email: 'thandi@olympiad.test',
                    password: 'Secret123',
                    gotrue_meta_security: {},
                },
            ]);
            expect(localStorage.getItem('op_access_token')).toBe(
                `jwt-for-${role}`
            );
        }
    );

    it('uses the Supabase token to ask the backend who the user is', async () => {
        mockLandingPages();
        mockSupabaseSignIn({
            userId: 'organiser-user',
            accessToken: 'jwt-abc',
        });
        const meCalls = mockApi('get', '/auth/me', fx.me('organiser'));
        const { user } = renderApp('/login');

        await fillAndSubmit(user);

        await waitFor(() => expect(meCalls).toHaveLength(1));
        expect(meCalls[0].headers.get('authorization')).toBe('Bearer jwt-abc');
    });

    it("shows Supabase's message for wrong credentials and stays on the page", async () => {
        mockSupabaseSignIn({ error: 'Invalid login credentials' });
        const { user, currentPath } = renderApp('/login');

        await fillAndSubmit(user, 'wrong');

        expect(
            await screen.findByText('Invalid login credentials')
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/login');
        expect(localStorage.getItem('op_access_token')).toBeNull();
        expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    });

    it("explains when the backend can't be reached", async () => {
        mockSupabaseSignIn({ userId: 'organiser-user' });
        mockNetworkFailure('get', '/auth/me');
        const { user } = renderApp('/login');

        await fillAndSubmit(user);

        expect(
            await screen.findByText(
                'We couldn’t reach the server. Make sure the frontend and backend are running, then try again.'
            )
        ).toBeInTheDocument();
    });

    it('shows a backend error such as a deleted account', async () => {
        mockSupabaseSignIn({ userId: 'organiser-user' });
        mockApiError('get', '/auth/me', 401, 'Account not found or deleted');
        const { user } = renderApp('/login');

        await fillAndSubmit(user);
        expect(
            await screen.findByText('Account not found or deleted')
        ).toBeInTheDocument();
    });

    it('links to sign-up for teachers and students, and not to organiser sign-up', async () => {
        const { user, currentPath } = renderApp('/login');
        expect(
            screen.queryByRole('link', { name: /organiser account/i })
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('link', { name: 'Create an account' })
        );
        expect(currentPath()).toBe('/signup');
        expect(
            screen.getByRole('heading', { name: 'Create account' })
        ).toBeInTheDocument();
    });
});

describe('signing up', () => {
    const fillDetails = async (user: ReturnType<typeof renderApp>['user']) => {
        await user.type(screen.getByLabelText('Full name'), 'Thandi Mokoena');
        await user.type(
            screen.getByLabelText('Email address'),
            'thandi@olympiad.test'
        );
        await user.type(screen.getByLabelText('Password'), 'Secret123');
    };

    const mockSchools = () =>
        mockApi('get', '/auth/schools', {
            schools: [
                { id: 'school-1', name: 'Parktown High' },
                { id: 'school-2', name: 'Northview College' },
            ],
        });

    // Organisers hold authority over every olympiad they own, so the portal
    // administrator creates them; public sign-up doesn't offer the role at all.
    it('offers educator and student sign-up only, starting on educator', async () => {
        mockSchools();
        renderApp('/signup');

        const roles = screen.getAllByRole('radio');
        expect(roles.map((role) => role.textContent)).toEqual([
            expect.stringContaining('Educator'),
            expect.stringContaining('Student'),
        ]);
        expect(
            screen.queryByRole('radio', { name: /Organiser/ })
        ).not.toBeInTheDocument();
        expect(screen.getByRole('radio', { name: /Educator/ })).toHaveAttribute(
            'aria-checked',
            'true'
        );
        expect(await screen.findByLabelText('School')).toBeInTheDocument();
    });

    it("shows the backend's validation error and doesn't sign in", async () => {
        mockSchools();
        mockApiError('post', '/auth/register', 409, 'Email already registered');
        const signIns = mockSupabaseSignIn({ userId: 'x' });
        const { user, currentPath } = renderApp('/signup');

        await user.selectOptions(
            await screen.findByLabelText('School'),
            'school-1'
        );
        await fillDetails(user);
        await user.click(
            screen.getByRole('button', { name: 'Create account' })
        );

        expect(
            await screen.findByText('Email already registered')
        ).toBeInTheDocument();
        expect(signIns).toHaveLength(0);
        expect(currentPath()).toBe('/signup');
    });

    it('registers an educator against a school picked from the list, with no invitation code', async () => {
        mockLandingPages();
        mockSchools();
        const registrations = mockApi(
            'post',
            '/auth/register',
            { user: { id: 'educator-user' } },
            { status: 201 }
        );
        mockSupabaseSignIn({ userId: 'educator-user' });
        mockApi('get', '/auth/me', fx.me('educator', {
            school_memberships: [{
                school_id: 'school-1',
                role: 'educator',
                status: 'pending',
                schools: { name: 'Parktown High' },
            }],
        }));
        const { user, currentPath } = renderApp('/signup');

        await user.click(screen.getByRole('radio', { name: /Educator/ }));
        await user.selectOptions(
            await screen.findByLabelText('School'),
            'school-1'
        );
        await fillDetails(user);
        await user.click(
            screen.getByRole('button', { name: 'Create account' })
        );

        expect(
            await screen.findByRole('heading', { name: 'School approval pending' })
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/educator');
        expect(registrations[0].body).toEqual({
            full_name: 'Thandi Mokoena',
            email: 'thandi@olympiad.test',
            password: 'Secret123',
            role: 'educator',
            school_id: 'school-1',
        });
    });

    it('lets an educator name a school that is not listed yet', async () => {
        mockLandingPages();
        mockSchools();
        const registrations = mockApi(
            'post',
            '/auth/register',
            { user: { id: 'educator-user' } },
            { status: 201 }
        );
        mockSupabaseSignIn({ userId: 'educator-user' });
        mockApi('get', '/auth/me', fx.me('educator'));
        const { user } = renderApp('/signup');

        await user.click(screen.getByRole('radio', { name: /Educator/ }));
        await user.selectOptions(
            await screen.findByLabelText('School'),
            '__new__'
        );
        await user.type(
            screen.getByLabelText('School name'),
            'Eastridge Academy'
        );
        await fillDetails(user);
        await user.click(
            screen.getByRole('button', { name: 'Create account' })
        );

        await waitFor(() => expect(registrations).toHaveLength(1));
        expect(registrations[0].body).toEqual({
            full_name: 'Thandi Mokoena',
            email: 'thandi@olympiad.test',
            password: 'Secret123',
            role: 'educator',
            school_name: 'Eastridge Academy',
        });
    });

    it('registers a student against an existing school, and offers no way to invent one', async () => {
        mockLandingPages();
        mockSchools();
        const registrations = mockApi(
            'post',
            '/auth/register',
            { user: { id: 'student-user' } },
            { status: 201 }
        );
        mockSupabaseSignIn({ userId: 'student-user' });
        mockApi('get', '/auth/me', fx.me('student', {
            entrants: {
                school_id: 'school-2',
                status: 'pending',
                schools: {
                    id: 'school-2',
                    name: 'Northview College',
                },
            },
        }));
        const { user, currentPath } = renderApp('/signup');

        await user.click(screen.getByRole('radio', { name: /Student/ }));
        const schoolSelect = await screen.findByLabelText('School');
        expect(
            within(schoolSelect).queryByText(/isn’t listed/)
        ).not.toBeInTheDocument();

        await user.selectOptions(schoolSelect, 'school-2');
        await fillDetails(user);
        await user.click(
            screen.getByRole('button', { name: 'Create account' })
        );

        expect(
            await screen.findByRole('heading', { name: 'Waiting for approval' })
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/student');
        expect(registrations[0].body).toMatchObject({
            role: 'student',
            school_id: 'school-2',
        });
    });

    it('still offers the school list when /register is opened directly', async () => {
        mockSchools();
        renderApp('/register');

        expect(
            screen.getByRole('heading', { name: 'Create account' })
        ).toBeInTheDocument();
        expect(
            screen.queryByLabelText('Invitation code')
        ).not.toBeInTheDocument();
    });

    it('links back to login', async () => {
        mockSchools();
        const { user, currentPath } = renderApp('/signup');
        await user.click(screen.getByRole('link', { name: 'Log in' }));
        expect(currentPath()).toBe('/login');
    });
});

describe('logging out', () => {
    const logIn = async (
        user: ReturnType<typeof renderApp>['user'],
        email: string
    ) => {
        await user.type(screen.getByLabelText('Email address'), email);
        await user.type(screen.getByLabelText('Password'), 'Secret123');
        await user.click(screen.getByRole('button', { name: 'Log in' }));
    };

    it('clears the session so the next student on this computer starts fresh', async () => {
        mockLandingPages();
        mockApi('post', '/auth/logout', { message: 'Logged out' });
        mockSupabaseSignIn({
            userId: 'student-user',
            accessToken: 'jwt-ayanda',
        });
        const signOuts = mockSupabaseSignOut();
        const students = [
            fx.me('student'),
            fx.me('student', { id: 'student-2', full_name: 'Lerato Nkosi' }),
        ];
        const meCalls = mockApi(
            'get',
            '/auth/me',
            () => students[Math.min(meCalls.length - 1, 1)]
        );
        const { user, currentPath, queryClient } = renderApp('/login');

        await logIn(user, 'ayanda@olympiad.test');
        expect(
            await screen.findByText('Ayanda Khumalo · Parktown High')
        ).toBeInTheDocument();
        // Progress from an exam Ayanda sat on this device
        localStorage.setItem(
            'exam-answers-round-1',
            JSON.stringify({ answers: { q: '42' }, dirty: ['q'] })
        );
        localStorage.setItem('exam-flags-round-1', JSON.stringify(['q']));

        await user.click(screen.getByRole('button', { name: 'Log out' }));

        expect(
            await screen.findByRole('heading', { name: 'Log in' })
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/login');
        expect(localStorage.getItem('op_access_token')).toBeNull();
        expect(localStorage.getItem('exam-answers-round-1')).toBeNull();
        expect(localStorage.getItem('exam-flags-round-1')).toBeNull();
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
        await waitFor(() => expect(signOuts).toEqual(['?scope=local']));

        // A different student signs in on the same tab
        mockSupabaseSignIn({ userId: 'student-2', accessToken: 'jwt-lerato' });
        await logIn(user, 'lerato@olympiad.test');

        expect(
            await screen.findByText('Lerato Nkosi · Parktown High')
        ).toBeInTheDocument();
        expect(screen.queryByText(/Ayanda Khumalo/)).not.toBeInTheDocument();
        expect(localStorage.getItem('op_access_token')).toBe('jwt-lerato');
    });

    it('returns to the login page when there is no Supabase session to end', async () => {
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
        mockApi('post', '/auth/logout', { message: 'Logged out' });
        localStorage.setItem('op_access_token', 'jwt');
        const { user, currentPath } = renderApp('/organiser');

        await user.click(
            await screen.findByRole('button', { name: 'Log out' })
        );

        await waitFor(() => expect(currentPath()).toBe('/login'));
        expect(localStorage.getItem('op_access_token')).toBeNull();
        expect(localStorage.getItem('op_role')).toBeNull();
    });

    it('ends the session on the server with the token being logged out', async () => {
        mockLandingPages();
        const logouts = mockApi('post', '/auth/logout', {
            message: 'Logged out',
        });
        localStorage.setItem('op_access_token', 'jwt-thandi');
        const { user, currentPath } = renderApp('/organiser');

        await user.click(
            await screen.findByRole('button', { name: 'Log out' })
        );

        await waitFor(() => expect(currentPath()).toBe('/login'));
        expect(logouts).toHaveLength(1);
        expect(logouts[0].headers.get('Authorization')).toBe(
            'Bearer jwt-thandi'
        );
    });

    it("still logs out when the server can't be reached", async () => {
        mockLandingPages();
        mockNetworkFailure('post', '/auth/logout');
        localStorage.setItem('op_access_token', 'jwt');
        const { user, currentPath } = renderApp('/organiser');

        await user.click(
            await screen.findByRole('button', { name: 'Log out' })
        );

        await waitFor(() => expect(currentPath()).toBe('/login'));
        expect(localStorage.getItem('op_access_token')).toBeNull();
    });

    it('shows the login page, not the account, when Back is pressed after logging out', async () => {
        mockLandingPages();
        mockApi('get', '/olympiads/archive', { rounds: [] });
        mockApi('post', '/auth/logout', { message: 'Logged out' });
        localStorage.setItem('op_access_token', 'jwt');
        const { user, currentPath, goBack } = renderApp('/organiser');
        await screen.findByRole('heading', { name: 'Organiser dashboard' });
        await user.click(screen.getByRole('link', { name: 'Paper archive' }));
        await waitFor(() => expect(currentPath()).toBe('/organiser/archive'));

        await user.click(screen.getByRole('button', { name: 'Log out' }));
        await screen.findByRole('heading', { name: 'Log in' });
        goBack();

        await waitFor(() => expect(currentPath()).toBe('/login'));
        expect(
            screen.getByRole('heading', { name: 'Log in' })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Organiser dashboard' })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Log out' })
        ).not.toBeInTheDocument();
    });
});

describe('signed-in pages', () => {
    // A JWT whose "exp" claim is the given moment
    const jwtExpiringAt = (date: Date) =>
        `header.${btoa(JSON.stringify({ exp: Math.floor(date.getTime() / 1000) })).replace(/=+$/, '')}.signature`;

    it("send a visitor who isn't signed in to the login page, and back after they log in", async () => {
        mockApi('get', '/olympiads/archive', { rounds: [] });
        mockSupabaseSignIn({
            userId: 'organiser-user',
            accessToken: 'jwt-thandi',
        });
        mockApi('get', '/auth/me', fx.me('organiser'));
        const { user, currentPath } = renderApp('/organiser/archive');

        expect(
            await screen.findByRole('heading', { name: 'Log in' })
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/login');
        // Not signed in before, so nothing "ended"
        expect(
            screen.queryByText('Your session has ended. Please log in again.')
        ).not.toBeInTheDocument();

        await user.type(
            screen.getByLabelText('Email address'),
            'thandi@olympiad.test'
        );
        await user.type(screen.getByLabelText('Password'), 'Secret123');
        await user.click(screen.getByRole('button', { name: 'Log in' }));

        await waitFor(() => expect(currentPath()).toBe('/organiser/archive'));
        expect(localStorage.getItem('op_role')).toBe('organiser');
    });

    it("send a user to their own dashboard from another role's pages", async () => {
        mockLandingPages();
        localStorage.setItem('op_access_token', 'jwt');
        localStorage.setItem('op_role', 'student');
        const { currentPath } = renderApp('/organiser/schools');

        await waitFor(() => expect(currentPath()).toBe('/student'));
    });

    it('end an expired session and say so', async () => {
        localStorage.setItem(
            'op_access_token',
            jwtExpiringAt(new Date(Date.now() - 60_000))
        );
        const { currentPath } = renderApp('/organiser');

        expect(
            await screen.findByText(
                'Your session has ended. Please log in again.'
            )
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/login');
        await waitFor(() =>
            expect(localStorage.getItem('op_access_token')).toBeNull()
        );
    });

    it("end the session when the server says it's no longer valid", async () => {
        mockApiError('get', '/olympiads', 401, 'Invalid or expired token');
        mockApiError('get', '/notifications', 401, 'Invalid or expired token');
        localStorage.setItem('op_access_token', 'jwt');
        const { currentPath } = renderApp('/organiser');

        expect(
            await screen.findByText(
                'Your session has ended. Please log in again.'
            )
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/login');
        await waitFor(() =>
            expect(localStorage.getItem('op_access_token')).toBeNull()
        );
    });

    it('follow a logout in another tab', async () => {
        mockLandingPages();
        localStorage.setItem('op_access_token', 'jwt');
        const { currentPath } = renderApp('/organiser');
        await screen.findByRole('heading', { name: 'Organiser dashboard' });

        // The other tab removed the token from the storage this tab shares
        localStorage.removeItem('op_access_token');
        window.dispatchEvent(
            new StorageEvent('storage', {
                key: 'op_access_token',
                oldValue: 'test-token',
                newValue: null,
            })
        );

        await waitFor(() => expect(currentPath()).toBe('/login'));
    });
});

describe('resetting a forgotten password', () => {
    const resetSent = {
        message:
            'If an account exists for that address, a reset link is on its way.',
    };

    it('asks the portal, not Supabase, to email a reset link', async () => {
        const { requests } = mockSupabasePasswordReset();
        const calls = mockApi('post', '/auth/forgot-password', resetSent);
        const { user } = renderApp('/login');

        await user.click(
            screen.getByRole('link', { name: 'Forgot password?' })
        );
        await user.type(
            screen.getByLabelText('Email address'),
            'thandi@olympiad.test'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send reset link' })
        );

        expect(
            await screen.findByText(/a reset link is on its way/i)
        ).toBeInTheDocument();
        expect(calls.map((call) => call.body)).toEqual([
            { email: 'thandi@olympiad.test' },
        ]);
        // Supabase's own sender allows only a few emails an hour for everyone
        expect(requests).toEqual([]);
    });

    it('explains when too many resets are asked for', async () => {
        mockApiError(
            'post',
            '/auth/forgot-password',
            429,
            'Too many attempts. Please wait a few minutes and try again.'
        );
        const { user } = renderApp('/forgot-password');

        await user.type(
            screen.getByLabelText('Email address'),
            'thandi@olympiad.test'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send reset link' })
        );

        expect(
            await screen.findByText(
                'Too many attempts. Please wait a few minutes and try again.'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Send reset link' })
        ).toBeEnabled();
    });

    it('says the same thing for an address without an account', async () => {
        mockApi('post', '/auth/forgot-password', resetSent);
        const { user } = renderApp('/forgot-password');

        await user.type(
            screen.getByLabelText('Email address'),
            'nobody@olympiad.test'
        );
        await user.click(
            screen.getByRole('button', { name: 'Send reset link' })
        );

        // The form must not reveal who has an account
        expect(
            await screen.findByText(/a reset link is on its way/i)
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/not found|no account/i)
        ).not.toBeInTheDocument();
    });

    it('sets a new password from the emailed link', async () => {
        const { verifications, updates } = mockSupabasePasswordReset({
            token: 'recovery-token',
        });
        const { user } = renderApp(
            '/reset-password?token_hash=recovery-token&type=recovery'
        );

        await waitFor(() => expect(verifications).toHaveLength(1));
        await user.type(screen.getByLabelText('New password'), 'BrandNew456');
        await user.type(
            screen.getByLabelText('Confirm new password'),
            'BrandNew456'
        );
        await user.click(
            screen.getByRole('button', { name: 'Save new password' })
        );

        expect(
            await screen.findByText(
                'Your password has been changed. You can now log in with it.'
            )
        ).toBeInTheDocument();
        expect(verifications[0]).toMatchObject({
            token_hash: 'recovery-token',
            type: 'recovery',
        });
        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({ password: 'BrandNew456' });
    });

    it.each([
        ['short', 'Short1', 'Short1', 'Use at least 8 characters.'],
        [
            'mismatched',
            'BrandNew456',
            'BrandNew457',
            'The two passwords don’t match.',
        ],
    ])(
        'refuses a %s password without calling Supabase',
        async (_label, password, confirmation, message) => {
            const { updates } = mockSupabasePasswordReset({
                token: 'recovery-token',
            });
            const { user } = renderApp(
                '/reset-password?token_hash=recovery-token&type=recovery'
            );

            await user.type(screen.getByLabelText('New password'), password);
            await user.type(
                screen.getByLabelText('Confirm new password'),
                confirmation
            );
            await user.click(
                screen.getByRole('button', { name: 'Save new password' })
            );

            expect(await screen.findByText(message)).toBeInTheDocument();
            expect(updates).toHaveLength(0);
        }
    );

    it('explains when the link has already been used or expired', async () => {
        mockSupabasePasswordReset({
            token: 'recovery-token',
            verifyError: 'Email link is invalid or has expired',
        });
        renderApp('/reset-password?token_hash=used-token&type=recovery');

        expect(
            await screen.findByText('Email link is invalid or has expired')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save new password' })
        ).toBeDisabled();
    });

    it('explains a link with no token at all', async () => {
        mockSupabasePasswordReset();
        renderApp('/reset-password');

        expect(
            await screen.findByText(
                'This reset link is invalid. Please request a new one.'
            )
        ).toBeInTheDocument();
    });
});

describe('deleting an account', () => {
    const signedInOrganiser = () => {
        localStorage.setItem('op_access_token', 'test-token');
        mockApi('get', '/olympiads', { olympiads: [fx.olympiad()] });
        mockApi('get', '/olympiads/oly-1/rounds', { rounds: [] });
    };

    it('asks for confirmation, then deletes the account and returns to login', async () => {
        signedInOrganiser();
        const deletions = mockApi('delete', '/auth/account', {
            message: 'Account deleted',
        });
        mockSupabaseSignOut();
        const { user, currentPath, queryClient } = renderApp('/organiser');

        await screen.findByRole('heading', { name: 'Organiser dashboard' });
        await user.click(
            screen.getByRole('button', { name: 'Delete account' })
        );
        expect(
            screen.getByRole('heading', { name: 'Delete your account?' })
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Keep my account' })
        );
        expect(
            screen.queryByRole('heading', { name: 'Delete your account?' })
        ).not.toBeInTheDocument();
        expect(deletions).toHaveLength(0);

        await user.click(
            screen.getByRole('button', { name: 'Delete account' })
        );
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Delete account',
            })
        );

        expect(
            await screen.findByRole('heading', { name: 'Log in' })
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/login');
        expect(deletions).toHaveLength(1);
        expect(localStorage.getItem('op_access_token')).toBeNull();
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    it('keeps the user signed in when the deletion fails', async () => {
        signedInOrganiser();
        mockApiError('delete', '/auth/account', 500, 'Something went wrong');
        const { user, currentPath } = renderApp('/organiser');

        await screen.findByRole('heading', { name: 'Organiser dashboard' });
        await user.click(
            screen.getByRole('button', { name: 'Delete account' })
        );
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Delete account',
            })
        );

        expect(
            await screen.findByText('Something went wrong')
        ).toBeInTheDocument();
        expect(currentPath()).toBe('/organiser');
        expect(localStorage.getItem('op_access_token')).toBe('test-token');
    });
});
