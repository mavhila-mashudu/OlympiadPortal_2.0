import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/lib/api', () => ({
    api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '../../../../src/lib/api';
import { InviteEducatorForm } from '../../../../src/pages/organiser/InviteEducatorForm';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const olympiads = [
    { id: 'oly-1', name: 'Maths Olympiad' },
    { id: 'oly-2', name: 'Science Olympiad' },
];

const candidates = [
    {
        id: 'edu-1',
        name: 'Ms Naidoo',
        email: 'naidoo@parktown.test',
        school: { id: 'school-1', name: 'Parktown High' },
    },
    {
        id: 'edu-2',
        name: 'Mr Pillay',
        email: 'pillay@northview.test',
        school: { id: 'school-2', name: 'Northview College' },
    },
];

const pick = async (id: string) => {
    await userEvent.selectOptions(await screen.findByLabelText('Educator'), id);
    await userEvent.click(
        screen.getByRole('button', { name: 'Send invitation' })
    );
};

// Block bodies matter here: a hook that returns a function (mockReset returns
// the mock) is run by Vitest as a teardown after each test.
beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValue({ candidates });
});

describe('InviteEducatorForm', () => {
    it('loads the educators who can still be invited to the selected olympiad', async () => {
        render(<InviteEducatorForm olympiads={olympiads} />);

        expect(
            await screen.findByRole('option', { name: /Ms Naidoo/ })
        ).toBeInTheDocument();
        expect(get).toHaveBeenCalledWith(
            '/me/olympiad-invitation-candidates?olympiad_id=oly-1'
        );
    });

    it('posts the invitation for the selected olympiad and educator', async () => {
        post.mockResolvedValue({ invite: { id: 'inv-1' } });
        render(<InviteEducatorForm olympiads={olympiads} />);

        await pick('edu-1');

        expect(post).toHaveBeenCalledWith('/olympiad-invitations', {
            olympiad_id: 'oly-1',
            invitee_id: 'edu-1',
            message: undefined,
        });
    });

    it('sends a trimmed message when one is typed', async () => {
        post.mockResolvedValue({ invite: { id: 'inv-1' } });
        render(<InviteEducatorForm olympiads={olympiads} />);

        await userEvent.type(
            screen.getByLabelText('Message (optional)'),
            '  Please join us  '
        );
        await pick('edu-1');

        expect(post).toHaveBeenCalledWith(
            '/olympiad-invitations',
            expect.objectContaining({ message: 'Please join us' })
        );
    });

    it('reloads the candidates when the olympiad changes', async () => {
        render(<InviteEducatorForm olympiads={olympiads} />);
        await screen.findByRole('option', { name: /Ms Naidoo/ });

        await userEvent.selectOptions(
            screen.getByLabelText('Olympiad'),
            'oly-2'
        );

        await waitFor(() =>
            expect(get).toHaveBeenCalledWith(
                '/me/olympiad-invitation-candidates?olympiad_id=oly-2'
            )
        );
    });

    it('narrows the list by name, email or school', async () => {
        render(<InviteEducatorForm olympiads={olympiads} />);
        await screen.findByRole('option', { name: /Ms Naidoo/ });

        await userEvent.type(
            screen.getByLabelText('Find an educator'),
            'northview'
        );

        expect(
            screen.getByRole('option', { name: /Mr Pillay/ })
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('option', { name: /Ms Naidoo/ })
        ).not.toBeInTheDocument();
    });

    it("confirms that the invitation is waiting on the educator's dashboard", async () => {
        post.mockResolvedValue({ invite: { id: 'inv-1' } });
        const onSuccess = vi.fn();
        render(
            <InviteEducatorForm olympiads={olympiads} onSuccess={onSuccess} />
        );

        await pick('edu-1');

        expect(
            await screen.findByRole('heading', { name: 'Invitation sent' })
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                /Ms Naidoo will see this invitation on their dashboard/
            )
        ).toBeInTheDocument();
        expect(onSuccess).toHaveBeenCalled();
    });

    it("shows the backend's reason for refusing and stays on the form", async () => {
        post.mockRejectedValue(
            new Error('That person has already been invited to this olympiad')
        );
        render(<InviteEducatorForm olympiads={olympiads} />);

        await pick('edu-1');

        expect(
            await screen.findByText(
                'That person has already been invited to this olympiad'
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Send invitation' })
        ).toBeInTheDocument();
    });

    it('says when every educator has already been invited', async () => {
        get.mockResolvedValue({ candidates: [] });
        render(<InviteEducatorForm olympiads={olympiads} />);

        expect(
            await screen.findByText(
                /Every educator on the platform has already been invited/
            )
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Send invitation' })
        ).toBeDisabled();
    });

    it('hides the olympiad picker when the page fixes one', async () => {
        render(<InviteEducatorForm olympiadId="oly-2" />);

        await screen.findByRole('option', { name: /Ms Naidoo/ });
        expect(screen.queryByLabelText('Olympiad')).not.toBeInTheDocument();
        expect(get).toHaveBeenCalledWith(
            '/me/olympiad-invitation-candidates?olympiad_id=oly-2'
        );
    });
});
