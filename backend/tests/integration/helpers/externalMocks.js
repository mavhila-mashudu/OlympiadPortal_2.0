// Stand-ins for the external services the backend talks to. The database is
// real in integration tests; Supabase (auth + file storage) and SMTP are not.
//
// Usage at the top of a test file:
//   jest.mock("../../src/config/supabase", () => require("./helpers/externalMocks").supabase);
//   jest.mock("../../src/lib/mailer", () => require("./helpers/externalMocks").mailer);
//   beforeEach(() => require("./helpers/externalMocks").resetExternalMocks());
const crypto = require("node:crypto");

const bucket = { upload: jest.fn(), createSignedUrl: jest.fn() };

const supabase = {
  auth: {
    getUser: jest.fn(),
    admin: { createUser: jest.fn(), deleteUser: jest.fn() },
  },
  storage: { from: jest.fn(() => bucket), bucket },
};

const mailer = {
  sendSchoolInviteEmail: jest.fn(),
  sendStudentInviteEmail: jest.fn(),
  sendEducatorInviteEmail: jest.fn(),
};

const resetExternalMocks = () => {
  supabase.auth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
  supabase.auth.admin.createUser
    .mockReset()
    .mockImplementation(async ({ email }) => ({ data: { user: { id: crypto.randomUUID(), email } }, error: null }));
  supabase.auth.admin.deleteUser.mockReset().mockResolvedValue({ data: {}, error: null });
  supabase.storage.from.mockClear();
  bucket.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  bucket.createSignedUrl
    .mockReset()
    .mockImplementation(async (path, expiresIn) => ({
      data: { signedUrl: `https://storage.test/${path}?expires=${expiresIn}` },
      error: null,
    }));
  for (const fn of Object.values(mailer)) fn.mockReset().mockResolvedValue({ delivered: true });
};

// Makes Supabase accept a bearer token as belonging to this user
const signInAs = (user) => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: user.id, email: user.email } }, error: null });
};

resetExternalMocks();

module.exports = { supabase, mailer, resetExternalMocks, signInAs };
