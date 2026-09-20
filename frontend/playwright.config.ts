import { defineConfig, devices } from "@playwright/test";
import { URLS } from "./e2e/test-data";

// End-to-end tests: a real browser drives the real frontend and backend
// against a real PostgreSQL database. e2e/servers.ts starts everything.
//
// Chromium only by default: the suite is a safety net for the critical user
// journeys, and the shared CI runners are small. Run it with
// `--project=firefox` or `--project=webkit` to check another engine.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // The tests share one seeded database, so they run one at a time
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // A failing test in CI is retried once, in case a machine was slow
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: URLS.app,
    // Evidence kept only for failures, so runs stay light
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
