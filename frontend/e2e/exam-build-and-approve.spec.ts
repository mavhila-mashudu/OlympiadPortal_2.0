// The two-person exam workflow: an educator digitises the question paper and
// submits it, then the organiser verifies it and puts it live. The steps
// depend on each other, so they run in order.
import { expect, test } from '@playwright/test';
import { signInAsEducator, signInAsOrganiser } from './helpers';
import { DRAFT_ROUND, USERS } from './test-data';

test.describe.configure({ mode: 'serial' });

test('an educator builds the exam and submits it for review', async ({
    page,
}) => {
    await signInAsEducator(page, USERS.educator);

    await page.getByRole('link', { name: 'Open round' }).nth(1).click();
    await expect(
        page.getByRole('heading', { name: DRAFT_ROUND.name })
    ).toBeVisible();
    await page.getByRole('link', { name: 'Build exam' }).click();
    await expect(
        page.getByRole('heading', { name: 'Exam Builder' })
    ).toBeVisible();

    // A multiple-choice question with two correct answers
    await page.getByRole('button', { name: 'Add question' }).click();
    await page
        .getByLabel('Question prompt')
        .fill('Which of these are even numbers?');
    await page.getByPlaceholder('Option 1').fill('3');
    await page.getByPlaceholder('Option 2').fill('4');
    await page.getByPlaceholder('Option 3').fill('6');
    await page.getByPlaceholder('Option 4').fill('9');
    await page.getByTitle('Mark as correct').nth(1).check();
    await page.getByTitle('Mark as correct').nth(2).check();
    await page.getByLabel('Points').fill('4');
    await page.getByRole('button', { name: 'Add question' }).click();

    // ...and an essay for the marking queue
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByLabel('Question type').selectOption('essay');
    await page
        .getByLabel('Question prompt')
        .fill('Explain why 2 is the only even prime.');
    await page.getByLabel('Points').fill('6');
    await page.getByRole('button', { name: 'Add question' }).click();

    await expect(
        page.getByText('Which of these are even numbers?')
    ).toBeVisible();
    await expect(page.getByText('2 questions')).toBeVisible();
    await expect(page.getByText('10 total points')).toBeVisible();

    await page
        .getByRole('button', { name: 'Mark as ready for review' })
        .click();
    await expect(
        page.getByText(
            'Submitted for organiser verification. Waiting for approval.'
        )
    ).toBeVisible();
});

test('the organiser checks the questions and puts the exam live', async ({
    page,
}) => {
    await signInAsOrganiser(page, USERS.organiser);

    const row = page.getByRole('row').filter({ hasText: DRAFT_ROUND.name });
    await expect(row.getByText('Exam ready for review')).toBeVisible();
    await row.getByRole('link', { name: 'Review' }).click();

    await expect(
        page.getByRole('heading', { name: 'Exam Review' })
    ).toBeVisible();
    await expect(page.getByText('Awaiting approval')).toBeVisible();
    // Points are added up, not joined together
    await expect(page.getByText('2 questions · 10 total points')).toBeVisible();
    await expect(
        page.getByText('Explain why 2 is the only even prime.')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Approve & go live' }).click();

    await expect(page.getByText('Approved — live')).toBeVisible();
    await expect(
        page.getByText(`Verified by ${USERS.organiser.fullName}`)
    ).toBeVisible();
});
