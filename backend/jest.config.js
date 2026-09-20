// Unit tests only (fast, everything mocked). Integration tests against a real
// Postgres live in tests/integration and use jest.integration.config.js.
/** @type {import('jest').Config} */
module.exports = {
  displayName: "unit",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/unit"],
  testMatch: ["**/*.test.js"],
  // The backend is CommonJS and runs untransformed. Only the TypeScript
  // sources (e.g. src/lib/mailer.ts) need Babel to strip types and convert
  // their ES module syntax.
  transform: {
    "\\.ts$": [
      "babel-jest",
      {
        presets: ["@babel/preset-typescript"],
        plugins: ["@babel/plugin-transform-modules-commonjs"],
      },
    ],
  },
  collectCoverageFrom: ["src/**/*.{js,ts}"],
  coverageDirectory: "coverage",
};
