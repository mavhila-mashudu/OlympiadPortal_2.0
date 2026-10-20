import { expect, test } from '@playwright/test';

test('landing page scrolls normally and its section links work on desktop and mobile', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: /A place for bright minds/i })
    ).toBeVisible();

    expect(
        await page.evaluate(() => document.documentElement.scrollHeight)
    ).toBeGreaterThan(800);
    await page.getByRole('link', { name: 'How it works', exact: true }).click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(
        page.getByRole('heading', { name: /A clear path from/i })
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(
        page.getByRole('heading', { name: /A place for bright minds/i })
    ).toBeVisible();
    expect(
        await page.evaluate(() => document.documentElement.scrollHeight)
    ).toBeGreaterThan(844);
    await page.getByRole('link', { name: "Who it's for" }).click();
    await expect(page).toHaveURL(/#who-its-for$/);
    await expect(
        page.getByRole('heading', { name: /One platform/i })
    ).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
