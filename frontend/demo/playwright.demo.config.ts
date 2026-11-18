import { defineConfig, devices } from '@playwright/test';
import { URLS } from '../e2e/test-data';

// Demo capture run: starts the same real stack the E2E suite uses
// (PGlite Postgres + mock Supabase + Express API + built Vite frontend),
// then walks the three role journeys while recording screenshots and video.
//
// Run with:
//   npx playwright test --config=demo/playwright.demo.config.ts
export default defineConfig({
    testDir: '.',
    testMatch: '**/*.spec.ts',
    globalSetup: '../e2e/global-setup.ts',
    globalTeardown: '../e2e/global-teardown.ts',
    workers: 1,
    fullyParallel: false,
    timeout: 300_000,
    expect: { timeout: 30_000 },
    reporter: [['list']],
    outputDir: './.output',
    use: {
        baseURL: URLS.app,
        screenshot: 'off',
        trace: 'off',
    },
    projects: [
        {
            name: 'demo',
            use: {
                ...devices['Desktop Chrome'],
                // Declared after the device preset on purpose: the preset's
                // 1280x720 viewport is narrower than the desktop layout needs,
                // and a document that overflows sideways is captured clipped.
                viewport: { width: 1680, height: 1000 },
                video: { mode: 'on', size: { width: 1680, height: 1000 } },
            },
        },
    ],
});
