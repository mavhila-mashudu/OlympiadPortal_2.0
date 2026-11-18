// Records the demo media used in the README and docs: a screenshot gallery of
// every major screen plus one video per role journey.
//
// Every step drives the real UI against the real backend; nothing is mocked in
// this file. The stack itself is the E2E stack (PGlite Postgres, mock Supabase,
// Express API, built frontend) and its seeded demo data.
//
//   npx playwright test --config=demo/playwright.demo.config.ts
//
// Screenshots land in ../docs/media/screenshots, videos in this folder's
// .output directory (one per test) and are collected by demo/collect-media.mjs.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signInAsEducator, signInAsOrganiser, signInAsStudent } from '../e2e/helpers';
import { DRAFT_ROUND, LIVE_ROUND, USERS } from '../e2e/test-data';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(here, '..', '..', 'docs', 'media', 'screenshots');

fs.mkdirSync(SHOTS, { recursive: true });

/** Screenshot after the page has settled, so views are never caught mid-load. */
async function shot(page: Page, name: string) {
    await page.waitForLoadState('networkidle').catch(() => {});
    // Anchor the capture at the top-left of every scroll container. A page
    // whose inner panel was scrolled sideways is otherwise captured
    // mid-offset and clipped by the fixed sidebar.
    await page.evaluate(() => {
        window.scrollTo(0, 0);
        for (const element of Array.from(document.querySelectorAll('*'))) {
            if (element.scrollLeft) element.scrollLeft = 0;
            if (element.scrollTop) element.scrollTop = 0;
        }
    });
    await page.waitForTimeout(700);
    await page.screenshot({
        path: path.join(SHOTS, `${name}.png`),
        fullPage: true,
    });
}

test.describe.configure({ mode: 'serial' });

test('public entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Olympiad/i);
    await shot(page, '01-landing-page');

    await page.goto('/login');
    await shot(page, '02-login');

    await page.goto('/signup');
    await shot(page, '03-signup');

    await page.goto('/forgot-password');
    await shot(page, '04-forgot-password');
});

test('organiser journey', async ({ page }) => {
    await signInAsOrganiser(page, USERS.organiser);
    await shot(page, '10-organiser-dashboard');

    await page.goto('/organiser/olympiads');
    await shot(page, '11-organiser-olympiads');

    await page.goto('/organiser/schools');
    await shot(page, '12-organiser-schools');

    await page.goto(`/organiser/rounds/${LIVE_ROUND.id}/papers`);
    await shot(page, '13-organiser-round-papers');

    await page.goto(`/organiser/rounds/${LIVE_ROUND.id}/review`);
    await shot(page, '14-organiser-exam-review');

    await page.goto('/organiser/standings');
    await shot(page, '15-organiser-standings');

    await page.goto('/organiser/remarks');
    await shot(page, '16-organiser-remarks');

    await page.goto('/organiser/notifications');
    await shot(page, '17-organiser-notifications');

    await page.goto('/organiser/archive');
    await shot(page, '18-organiser-archive');

    await page.goto('/organiser/educators');
    await shot(page, '19-organiser-educator-membership');
});

test('educator journey', async ({ page }) => {
    await signInAsEducator(page, USERS.educator);
    await shot(page, '20-educator-dashboard');

    await page.goto('/educator/entrants');
    await shot(page, '21-educator-entrants');

    await page.goto(`/educator/rounds/${DRAFT_ROUND.id}`);
    await shot(page, '22-educator-round-detail');

    await page.goto(`/educator/rounds/${DRAFT_ROUND.id}/exam`);
    await shot(page, '23-educator-exam-builder');

    await page.goto(`/educator/rounds/${LIVE_ROUND.id}/marking`);
    await shot(page, '24-educator-marking-queue');

    await page.goto('/educator/results');
    await shot(page, '25-educator-results');
});

test('student sits the exam online', async ({ page }) => {
    await signInAsStudent(page, USERS.student);
    await shot(page, '30-student-dashboard');

    await page.goto(`/student/rounds/${LIVE_ROUND.id}`);
    await shot(page, '31-student-round-detail');

    await page.getByRole('link', { name: 'Sit exam online' }).click();
    await page.getByRole('button', { name: 'Start exam' }).click();
    await page.waitForTimeout(500);
    await shot(page, '32-student-exam-in-progress');

    // Answer whichever question the shuffled variant put on screen first
    const answerCurrent = async () => {
        if (
            await page
                .getByText('Which of these numbers are prime?')
                .isVisible()
        ) {
            await page.getByText(/^[A-D]\. 2$/).click();
            await page.getByText(/^[A-D]\. 5$/).click();
        } else {
            await page.getByPlaceholder('Type your answer...').fill('Pretoria');
        }
        await page.waitForTimeout(500);
    };

    await answerCurrent();
    await page.getByRole('button', { name: 'Next' }).click();
    await shot(page, '33-student-exam-second-question');
    await answerCurrent();

    await page.getByRole('button', { name: 'Submit exam' }).click();
    await page.waitForTimeout(400);
    await shot(page, '34-student-submit-confirmation');
    await page.getByRole('button', { name: 'Confirm submit' }).click();

    await expect(
        page.getByRole('heading', { name: 'Exam submitted' })
    ).toBeVisible();
    await shot(page, '35-student-auto-marked-submission');
});

test('organiser closes the round and releases results', async ({ page }) => {
    await signInAsOrganiser(page, USERS.organiser);

    const row = page.getByRole('row').filter({ hasText: LIVE_ROUND.name });
    await row.getByRole('button', { name: 'Close round' }).click();
    await page.waitForTimeout(700);
    await shot(page, '40-organiser-round-closed');

    await page.goto(`/organiser/rounds/${LIVE_ROUND.id}/marking`);
    await expect(
        page.getByRole('heading', { name: 'Nothing to mark' })
    ).toBeVisible();
    await shot(page, '41-organiser-marking-complete');

    await page.getByRole('button', { name: 'Generate results' }).click();
    await expect(
        page.getByRole('heading', { name: 'Results released' })
    ).toBeVisible();
    await shot(page, '42-organiser-results-released');

    await page.goto('/organiser/standings');
    await shot(page, '43-organiser-standings-released');
});

test('student sees the released result', async ({ page }) => {
    await signInAsStudent(page, USERS.student);
    await page.getByRole('link', { name: 'Results & certificates' }).click();
    await expect(
        page.getByRole('heading', { name: 'Results & certificates' })
    ).toBeVisible();
    await shot(page, '50-student-results');
});
