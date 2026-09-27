import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Every test starts from clean mocks, env vars and globals
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      projects: [
        {
          extends: true,
          test: {
            // Components, hooks and helpers in isolation; dependencies mocked
            name: "unit",
            environment: "jsdom",
            include: ["tests/unit/**/*.test.{ts,tsx}"],
            setupFiles: ["tests/unit/setup.ts"],
            // Form tests type with user-event, which a busy shared runner has
            // stretched past vitest's 5s default. A passing test still
            // finishes in well under a second locally.
            testTimeout: 15_000,
            retry: process.env.CI ? 1 : 0,
          },
        },
        {
          extends: true,
          test: {
            // Whole pages through the real router, API client and Supabase
            // client, with the network mocked by MSW
            name: "integration",
            environment: "jsdom",
            include: ["tests/integration/**/*.test.{ts,tsx}"],
            setupFiles: ["tests/integration/setup.ts"],
            testTimeout: 20_000,
            // One retry in CI, where a shared runner can stall a test
            retry: process.env.CI ? 1 : 0,
          },
        },
      ],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          // App bootstrap and routing
          "src/main.tsx",
          "src/App.tsx",
          "src/vite-env.d.ts",
          // Static demo data and an unused helper
          "src/lib/mockData.ts",
          "src/lib/utils.ts",
          // Full route-level pages (fetching + composing the units above) are
          // exercised by the integration and E2E suites, not unit tests
          "src/pages/auth/{Login,Signup}.tsx",
          "src/pages/educator/{Dashboard,Entrants,ExamBuilder,Results,RoundDetail}.tsx",
          "src/pages/organiser/{Archive,CreateRound,Dashboard,ExamReview,MarkingQueue,Notifications,Olympiads,Schools}.tsx",
          "src/pages/student/{Dashboard,ExamSitting,Results,RoundDetail}.tsx",
        ],
      },
    },
  }),
);
