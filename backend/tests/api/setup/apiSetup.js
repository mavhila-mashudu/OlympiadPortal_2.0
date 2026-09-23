// Runs before every API test file.
//
// Supabase is replaced for the whole file (the app loads it when it is first
// required), and Supabase Auth is taught to accept the test tokens made by
// helpers/api.js#tokenFor. Everything else — routing,
// middleware, validation, services, Prisma and Postgres — is real.
jest.mock("../../../src/config/supabase", () => require("../../integration/helpers/externalMocks").supabase);

const { resetExternalMocks } = require("../../integration/helpers/externalMocks");
const { acceptTestTokens } = require("../helpers/api");

beforeEach(() => {
  resetExternalMocks();
  acceptTestTokens();
});

// The error handler logs every failed request; the tests assert on the
// responses instead, so keep the output readable
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  console.error.mockRestore?.();
  console.log.mockRestore?.();
});
