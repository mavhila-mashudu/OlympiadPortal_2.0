// Stand-ins for the external services the backend talks to. The database is
// real in integration tests; Supabase (auth + file storage) is not.
// Invitations are delivered in-app, so nothing is emailed.
//
// Usage at the top of a test file:
//   jest.mock("../../src/config/supabase", () => require("./helpers/externalMocks").supabase);
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
};

// Makes Supabase accept a bearer token as belonging to this user
const signInAs = (user) => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: user.id, email: user.email } }, error: null });
};

resetExternalMocks();

module.exports = { supabase, resetExternalMocks, signInAs };
