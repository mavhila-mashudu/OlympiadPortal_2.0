// Shared steps the journeys build on. Everything goes through the real UI:
// tests type into the login form rather than setting tokens directly.
import { expect, type Page } from '@playwright/test';
import { URLS } from './test-data';

type Credentials = { email: string; password: string };

/** Signs in through the login form and waits for the dashboard to load. */
export async function signIn(
    page: Page,
    { email, password }: Credentials,
    expectedPath: string
) {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
}

export const signInAsOrganiser = (page: Page, credentials: Credentials) =>
    signIn(page, credentials, '/organiser');

export const signInAsEducator = (page: Page, credentials: Credentials) =>
    signIn(page, credentials, '/educator');

export const signInAsStudent = (page: Page, credentials: Credentials) =>
    signIn(page, credentials, '/student');

/** The reset link that would have arrived by email. */
export async function readResetLink(page: Page, email: string) {
    const response = await page.request.get(
        `${URLS.supabase}/__test/recovery`,
        {
            params: { email },
        }
    );
    const { token } = (await response.json()) as { token: string | null };
    expect(token, `no reset link was issued for ${email}`).toBeTruthy();
    return `/reset-password?token_hash=${token}&type=recovery`;
}
