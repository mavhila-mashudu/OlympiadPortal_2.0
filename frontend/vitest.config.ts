import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["tests/unit/**/*.test.{ts,tsx}"],
      setupFiles: ["tests/unit/setup.ts"],
      // Every test starts from clean mocks, env vars and globals
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
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
