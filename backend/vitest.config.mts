import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.js"],
    testTimeout: 10000,
    include: ["tests/**/*.{test,spec}.?(c|m)[jt]s?(x)", "tests/tests.js"],
  },
});
