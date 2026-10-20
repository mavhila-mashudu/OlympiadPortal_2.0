// Account journeys: signing in, signing up, resetting a password, deleting an
// account and logging out — each one clicked through the real UI.
import { expect, test } from '@playwright/test';
import { readResetLink, signIn } from './helpers';
import { PASSWORD, SCHOOL, USERS } from './test-data';

test.describe('signing in', () => {
    test('each role signs in and lands on their own dashboard', async ({
        page,
    }) => {
        await signIn(page, USERS.organiser, '/organiser');
        await expect(
            page.getByRole('heading', { name: 'Organiser dashboard' })
        ).toBeVisible();

        await signIn(page, USERS.educator, '/educator');
        await expect(
            page.getByRole('heading', { name: 'Your rounds' })
        ).toBeVisible();

        await signIn(page, USERS.student, '/student');
        await expect(
            page.getByRole('heading', { name: 'Your olympiad' })
        ).toBeVisible();
    });

    test('a wrong password is refused and the user stays on the login page', async ({
        page,
    }) => {
        await page.goto('/login');
        await page.getByLabel('Email address').fill(USERS.organiser.email);
        await page
            .getByLabel('Password', { exact: true })
            .fill('not-my-password');
        await page.getByRole('button', { name: 'Log in' }).click();

        await expect(page.getByText('Invalid login credentials')).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);
    });

    test("logging out ends the session, and Back doesn't bring the account back", async ({
        page,
    }) => {
        await signIn(page, USERS.organiser, '/organiser');
        await page.getByRole('link', { name: 'Paper archive' }).click();
        await expect(page).toHaveURL(/\/organiser\/archive$/);

        await page.getByRole('button', { name: 'Log out' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(
            page.getByRole('heading', { name: 'Log in' })
        ).toBeVisible();

        // The browser's Back button lands on the login page, not the account
        await page.goBack();
        await expect(page).toHaveURL(/\/login$/);
        await expect(
            page.getByRole('heading', { name: 'Log in' })
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Organiser dashboard' })
        ).toBeHidden();

        // Typing a signed-in page's address does the same
        await page.goto('/organiser/schools');
        await expect(page).toHaveURL(/\/login$/);
        await expect(
            page.getByRole('button', { name: 'Log out' })
        ).toBeHidden();
    });
});

test.describe('signing up', () => {
    test("public sign-up doesn't offer the organiser role", async ({
        page,
    }) => {
        await page.goto('/signup');

        await expect(
            page.getByRole('radio', { name: /Educator/ })
        ).toBeVisible();
        await expect(
            page.getByRole('radio', { name: /Student/ })
        ).toBeVisible();
        await expect(
            page.getByRole('radio', { name: /Organiser/ })
        ).toHaveCount(0);
    });

    test('a student signs up by picking their school and waits for approval', async ({
        page,
    }) => {
        const email = `new.student.${Date.now()}@e2e.test`;

        await page.goto('/signup');
        await page.getByRole('radio', { name: /Student/ }).click();
        await expect(
            page.getByLabel('Invitation code', { exact: true })
        ).toBeHidden();

        await page.getByLabel('School').selectOption({ label: SCHOOL.name });
        await page.getByLabel('Full name').fill('New Learner');
        await page.getByLabel('Email address').fill(email);
        await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
        await page.getByRole('button', { name: 'Create account' }).click();

        await expect(page).toHaveURL(/\/student$/);
        await expect(
            page.getByRole('heading', { name: 'Waiting for approval' })
        ).toBeVisible();
    });

    test('an educator signs up and brings a new school onto the platform', async ({
        page,
    }) => {
        const email = `new.educator.${Date.now()}@e2e.test`;
        const school = `Eastridge Academy ${Date.now()}`;

        await page.goto('/signup');
        await page.getByRole('radio', { name: /Educator/ }).click();
        await page.getByLabel('School').selectOption('__new__');
        await page.getByLabel('School name').fill(school);
        await page.getByLabel('Full name').fill('New Educator');
        await page.getByLabel('Email address').fill(email);
        await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
        await page.getByRole('button', { name: 'Create account' }).click();

        await expect(page).toHaveURL(/\/educator$/);
        await expect(
            page.getByRole('heading', { name: 'School approval pending' })
        ).toBeVisible();
        await expect(
            page.getByText(new RegExp(school))
        ).toBeVisible();
    });
});

test('a forgotten password is reset and the new one works', async ({
    page,
}) => {
    const newPassword = 'BrandNew456';

    // Ask for the link
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email address').fill(USERS.resetting.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/a reset link is on its way/i)).toBeVisible();

    // Follow the link from the email and choose a new password
    await page.goto(await readResetLink(page, USERS.resetting.email));
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(
        page.getByText(
            'Your password has been changed. You can now log in with it.'
        )
    ).toBeVisible();

    // The old password no longer works, the new one does
    await page.goto('/login');
    await page.getByLabel('Email address').fill(USERS.resetting.email);
    await page
        .getByLabel('Password', { exact: true })
        .fill(USERS.resetting.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Invalid login credentials')).toBeVisible();

    await signIn(
        page,
        { email: USERS.resetting.email, password: newPassword },
        '/organiser'
    );
});

test('an account is deleted and can no longer sign in', async ({ page }) => {
    await signIn(page, USERS.disposable, '/organiser');

    await page.getByRole('button', { name: 'Delete account' }).click();
    await expect(
        page.getByRole('heading', { name: 'Delete your account?' })
    ).toBeVisible();
    // Changing your mind keeps the account
    await page.getByRole('button', { name: 'Keep my account' }).click();
    await expect(
        page.getByRole('heading', { name: 'Delete your account?' })
    ).toBeHidden();

    await page.getByRole('button', { name: 'Delete account' }).click();
    await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete account' })
        .click();

    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email address').fill(USERS.disposable.email);
    await page
        .getByLabel('Password', { exact: true })
        .fill(USERS.disposable.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Invalid login credentials')).toBeVisible();
});

test('Log out and Delete account stay in view on a short laptop screen', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1366, height: 420 });
    await signIn(page, USERS.organiser, '/organiser');

    // The organiser's sidebar is the longest; its links scroll instead
    await expect(
        page.getByRole('button', { name: 'Log out' })
    ).toBeInViewport();
    await expect(
        page.getByRole('button', { name: 'Delete account' })
    ).toBeInViewport();
});
