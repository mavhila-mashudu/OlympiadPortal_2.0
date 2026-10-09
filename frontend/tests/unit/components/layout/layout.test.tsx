import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClipboardList, LayoutDashboard, Trophy } from 'lucide-react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../../../src/components/layout/AppShell';
import shellStyles from '../../../../src/components/layout/AppShell.module.css';
import { PageHeader } from '../../../../src/components/layout/PageHeader';
import { clearCurrentUser } from '../../../../src/lib/currentUser';
import { clearCurrentOlympiadCache } from '../../../../src/lib/olympiad';

describe('PageHeader', () => {
    it('shows the title and description', () => {
        render(<PageHeader title="Rounds" description="Manage your rounds" />);
        expect(
            screen.getByRole('heading', { level: 1, name: 'Rounds' })
        ).toBeInTheDocument();
        expect(screen.getByText('Manage your rounds')).toBeInTheDocument();
    });

    it('renders actions only when provided', () => {
        const { rerender } = render(
            <PageHeader title="Rounds" description="d" />
        );
        expect(screen.queryByRole('button')).not.toBeInTheDocument();

        rerender(
            <PageHeader
                title="Rounds"
                description="d"
                actions={<button>New round</button>}
            />
        );
        expect(
            screen.getByRole('button', { name: 'New round' })
        ).toBeInTheDocument();
    });
});

describe('AppShell', () => {
    // The shell polls for notifications and logging out tells the server; no
    // request may leave the test, so every call is answered here
    let requests: string[];
    let signedInAs: { full_name: string } | null;
    beforeEach(() => {
        requests = [];
        signedInAs = { full_name: 'Thandi Mokoena' };
        // Each test loads the signed-in user and olympiads afresh
        clearCurrentUser();
        clearCurrentOlympiadCache();
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                const path = new URL(url).pathname;
                requests.push(`${init?.method ?? 'GET'} ${path}`);
                if (path === '/auth/me') {
                    return signedInAs
                        ? new Response(
                              JSON.stringify({
                                  success: true,
                                  data: { user: signedInAs },
                              })
                          )
                        : new Response(
                              JSON.stringify({
                                  success: false,
                                  error: 'Server error',
                              }),
                              { status: 500 }
                          );
                }
                if (path === '/olympiads') {
                    return new Response(
                        JSON.stringify({
                            success: true,
                            data: { olympiads: [] },
                        })
                    );
                }
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: { notifications: [] },
                    })
                );
            })
        );
    });

    const navItems = [
        { label: 'Dashboard', to: '/organiser', icon: LayoutDashboard },
        { label: 'Olympiads', to: '/organiser/olympiads', icon: Trophy },
        { label: 'Marking', to: '/organiser/marking', icon: ClipboardList },
    ];

    const renderShell = (
        path: string,
        props: Partial<Parameters<typeof AppShell>[0]> = {}
    ) =>
        render(
            <MemoryRouter initialEntries={[path]}>
                <AppShell
                    activeRole="organiser"
                    navItems={navItems}
                    organisation="Wits Maths Olympiad"
                    portalLabel="Organiser console"
                    {...props}
                >
                    <p>Page content</p>
                </AppShell>
            </MemoryRouter>
        );

    it('renders the page content inside the main region', () => {
        renderShell('/organiser');
        expect(
            within(screen.getByRole('main')).getByText('Page content')
        ).toBeInTheDocument();
    });

    it("shows the role signed in as, then the person's name and initials", async () => {
        renderShell('/organiser');
        expect(screen.getByText('Organiser console')).toBeInTheDocument();

        const account = screen.getByText('Organiser').closest('div')!;
        expect(
            await within(account).findByText('Thandi Mokoena')
        ).toBeInTheDocument();
        expect(within(account).getByText('TM')).toBeInTheDocument();
        // The name comes from the server, loaded once
        expect(requests.filter((r) => r === 'GET /auth/me')).toHaveLength(1);
    });

    it("shows the role alone when the name can't be loaded", async () => {
        signedInAs = null;
        renderShell('/educator', { activeRole: 'educator' });

        await waitFor(() => expect(requests).toContain('GET /auth/me'));
        expect(screen.getByText('Educator')).toBeInTheDocument();
        expect(screen.getByText('E')).toBeInTheDocument();
    });

    it("shows an educator's or student's school under the portal name, but not an organiser's", () => {
        renderShell('/educator', {
            activeRole: 'educator',
            organisation: 'Parktown High',
        });
        expect(screen.getByText('Parktown High')).toBeInTheDocument();
    });

    it('collapses to icons from the logo, keeping every name readable, and expands again', async () => {
        const { container } = renderShell('/organiser');
        const shell = container.firstElementChild!;

        await userEvent.click(
            screen.getByRole('button', { name: 'Collapse sidebar' })
        );

        expect(shell).toHaveClass(shellStyles.collapsed);
        const toggle = screen.getByRole('button', { name: 'Expand sidebar' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        // Icons only, but links and buttons keep their names, with a tooltip
        const dashboard = within(
            screen.getByRole('navigation', { name: 'Main' })
        ).getByRole('link', { name: 'Dashboard' });
        expect(dashboard).toHaveAttribute('title', 'Dashboard');
        expect(screen.getByRole('button', { name: 'Log out' })).toHaveAttribute(
            'title',
            'Log out'
        );

        await userEvent.click(toggle);
        expect(shell).not.toHaveClass(shellStyles.collapsed);
        expect(
            screen.getByRole('button', { name: 'Collapse sidebar' })
        ).toHaveAttribute('aria-expanded', 'true');
    });

    it('remembers a collapsed sidebar on this device', async () => {
        const { unmount } = renderShell('/organiser');
        await userEvent.click(
            screen.getByRole('button', { name: 'Collapse sidebar' })
        );
        expect(localStorage.getItem('op_sidebar_collapsed')).toBe('true');
        unmount();

        renderShell('/organiser/olympiads');
        expect(
            screen.getByRole('button', { name: 'Expand sidebar' })
        ).toBeInTheDocument();
    });

    it('opens the sidebar over the page from the menu button on small screens', async () => {
        const { container } = renderShell('/organiser');
        const sidebar = container.querySelector('#app-sidebar')!;

        await userEvent.click(
            screen.getByRole('button', { name: 'Open navigation menu' })
        );
        expect(sidebar).toHaveClass(shellStyles.mobileOpen);

        await userEvent.click(
            screen.getByRole('button', { name: 'Close navigation menu' })
        );
        expect(sidebar).not.toHaveClass(shellStyles.mobileOpen);
    });

    it('lists each navigation item as a link', () => {
        renderShell('/organiser');
        const nav = screen.getByRole('navigation', { name: 'Main' });
        expect(
            within(nav)
                .getAllByRole('link')
                .map((l) => [l.textContent, l.getAttribute('href')])
        ).toEqual([
            ['Dashboard', '/organiser'],
            ['Olympiads', '/organiser/olympiads'],
            ['Marking', '/organiser/marking'],
        ]);
    });

    it('highlights the current page', () => {
        renderShell('/organiser/olympiads');
        const nav = screen.getByRole('navigation', { name: 'Main' });
        expect(
            within(nav).getByRole('link', { name: 'Olympiads' })
        ).toHaveClass(shellStyles.navItemActive);
    });

    it("doesn't highlight the dashboard link on its sub-pages", () => {
        renderShell('/organiser/olympiads');
        const nav = screen.getByRole('navigation', { name: 'Main' });
        expect(
            within(nav).getByRole('link', { name: 'Dashboard' })
        ).not.toHaveClass(shellStyles.navItemActive);
    });

    it('highlights the dashboard link on the dashboard itself', () => {
        renderShell('/organiser');
        const nav = screen.getByRole('navigation', { name: 'Main' });
        expect(
            within(nav).getByRole('link', { name: 'Dashboard' })
        ).toHaveClass(shellStyles.navItemActive);
    });

    it.each([
        ['organiser', 'Organiser portal', 'Organiser'],
        ['educator', 'Educator portal', 'Educator'],
        ['student', 'Student portal', 'Student'],
    ] as const)(
        'names the %s portal and the signed-in role',
        (role, portalLabel, accountLabel) => {
            renderShell(`/${role}`, { activeRole: role });
            expect(screen.getByText(portalLabel)).toBeInTheDocument();
            expect(screen.getByText(accountLabel)).toBeInTheDocument();
            // Roles are no longer switchable from the sidebar
            expect(
                screen.queryByRole('group', { name: 'Switch demo role' })
            ).not.toBeInTheDocument();
        }
    );

    it('logs out: clears the session and cached data, then opens the login page', async () => {
        localStorage.setItem('op_access_token', 'jwt');
        const queryClient = new QueryClient();
        queryClient.setQueryData(['educator', 'rounds'], { rounds: [] });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/organiser']}>
                    <Routes>
                        <Route
                            path="/organiser"
                            element={
                                <AppShell
                                    activeRole="organiser"
                                    navItems={navItems}
                                    organisation="o"
                                    portalLabel="p"
                                >
                                    <p>Page content</p>
                                </AppShell>
                            }
                        />
                        <Route path="/login" element={<h1>Log in</h1>} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );

        await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

        expect(
            await screen.findByRole('heading', { name: 'Log in' })
        ).toBeInTheDocument();
        // The server ended the session before the page was left
        expect(requests).toContain('POST /auth/logout');
        expect(localStorage.getItem('op_access_token')).toBeNull();
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    it('can log out outside a query client provider', async () => {
        localStorage.setItem('op_access_token', 'jwt');
        renderShell('/organiser');
        await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
        await waitFor(() =>
            expect(localStorage.getItem('op_access_token')).toBeNull()
        );
    });
});
