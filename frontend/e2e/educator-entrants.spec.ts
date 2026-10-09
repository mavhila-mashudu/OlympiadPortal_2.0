// The educator's other core job: getting learners into the competition.
import { expect, test } from '@playwright/test';
import { signInAsEducator } from './helpers';
import { DRAFT_ROUND, OLYMPIAD, PASSWORD, USERS } from './test-data';

test('an educator registers a learner and invites a student to join', async ({
    page,
}) => {
    const learner = `New Learner ${Date.now()}`;
    await signInAsEducator(page, USERS.educator);

    // The sidebar link, not the shortcut on a round card
    await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Register entrants' })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Entrants & invitations' })
    ).toBeVisible();

    // Register a learner for the olympiad
    await page.getByLabel(/^Full name/).fill(learner);
    await page.getByLabel('Student number').fill(`S${Date.now()}`);
    await page.getByLabel('Grade').selectOption('10');
    await page.getByRole('button', { name: 'Add entrant' }).click();

    // Registered for every round still open to entries, which always
    // includes the scheduled one
    await expect(
        page.getByText(
            new RegExp(
                `${learner} has been registered for .*${DRAFT_ROUND.name}`
            )
        )
    ).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: learner });
    await expect(row).toBeVisible();
    await expect(row.getByText('10')).toBeVisible();

    // Invite a student who already has an account at this school
    await page
        .getByLabel('Student *', { exact: true })
        .selectOption(USERS.student.id);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('alert')).toContainText(
        `${USERS.student.fullName} will see this invitation on their dashboard.`
    );
    await expect(
        page
            .getByRole('listitem')
            .filter({ hasText: `${USERS.student.fullName}` })
    ).toContainText('pending');
});

test('a student accepts an invitation and the olympiad appears on their dashboard', async ({
    page,
}) => {
    await signInAsEducator(page, USERS.educator);
    await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Register entrants' })
        .click();
    await page
        .getByLabel('Student *', { exact: true })
        .selectOption(USERS.joiningStudent.id);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('alert')).toContainText(
        /will see this invitation/
    );
    await page.getByRole('button', { name: 'Log out' }).click();

    await page.goto('/login');
    await page.getByLabel('Email address').fill(USERS.joiningStudent.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/student$/);

    const invitation = page
        .getByRole('listitem')
        .filter({ hasText: OLYMPIAD.name });
    await invitation.getByRole('button', { name: 'Accept' }).click();

    await expect(
        page.getByRole('heading', { name: /Invitations/ })
    ).toBeHidden();
    await expect(page.getByText(DRAFT_ROUND.name)).toBeVisible();
});
