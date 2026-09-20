const {
  generateInvitationCode,
  getInvitationExpiry,
  generateInviteToken,
  hashInviteToken,
} = require("../../../src/utils/invitations");

describe("generateInvitationCode", () => {
  it("creates a short SCH-XXXX code for schools", () => {
    expect(generateInvitationCode("school")).toMatch(/^SCH-[A-Z0-9]{4}$/);
  });

  it("never uses look-alike characters in school codes", () => {
    // The school alphabet drops I, O, 0 and 1 so codes can be typed from an email
    for (let i = 0; i < 200; i += 1) {
      expect(generateInvitationCode("school")).not.toMatch(/[IO01]/);
    }
  });

  it("creates an EDU-XXXX-XXXX hex code for educators", () => {
    expect(generateInvitationCode("educator")).toMatch(
      /^EDU-[0-9A-F]{4}-[0-9A-F]{4}$/,
    );
  });

  it("creates an STU-XXXX-XXXX hex code for students", () => {
    expect(generateInvitationCode("student")).toMatch(
      /^STU-[0-9A-F]{4}-[0-9A-F]{4}$/,
    );
  });

  it("produces different codes on successive calls", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateInvitationCode("student")),
    );
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("getInvitationExpiry", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-01T10:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("gives students 30 days", () => {
    expect(getInvitationExpiry("student")).toEqual(
      new Date("2026-03-31T10:00:00Z"),
    );
  });

  it.each(["school", "educator"])("gives %s invitations 7 days", (type) => {
    expect(getInvitationExpiry(type)).toEqual(new Date("2026-03-08T10:00:00Z"));
  });
});

describe("generateInviteToken", () => {
  it("returns a URL-safe base64 token from 32 random bytes", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a new token each time", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe("hashInviteToken", () => {
  it("returns a 64-character SHA-256 hex digest", () => {
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic, so a stored hash can be looked up later", () => {
    expect(hashInviteToken("same-token")).toBe(hashInviteToken("same-token"));
  });

  it("gives different tokens different hashes", () => {
    expect(hashInviteToken("token-a")).not.toBe(hashInviteToken("token-b"));
  });
});
