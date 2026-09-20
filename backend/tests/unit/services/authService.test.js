jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/config/env", () => ({
  frontend: { url: "https://frontend.test" },
}));
jest.mock("../../../src/config/supabase", () => ({
  auth: { admin: { createUser: jest.fn(), deleteUser: jest.fn() } },
}));
jest.mock("../../../src/lib/mailer", () => ({
  sendSchoolInviteEmail: jest.fn(),
  sendStudentInviteEmail: jest.fn(),
  sendEducatorInviteEmail: jest.fn(),
}));
jest.mock("../../../src/utils/invitations", () => ({
  ...jest.requireActual("../../../src/utils/invitations"),
  generateInvitationCode: jest.fn(),
  generateInviteToken: jest.fn(),
  getInvitationExpiry: jest.fn(),
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const supabase = require("../../../src/config/supabase");
const mailer = require("../../../src/lib/mailer");
const invitations = require("../../../src/utils/invitations");
const authService = require("../../../src/services/authService");

const EXPIRY = new Date("2030-01-01T00:00:00Z");
const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

beforeEach(() => {
  resetPrismaMock();
  supabase.auth.admin.createUser.mockReset().mockResolvedValue({
    data: { user: { id: "auth-1" } },
    error: null,
  });
  supabase.auth.admin.deleteUser.mockReset().mockResolvedValue({});
  for (const fn of Object.values(mailer)) fn.mockReset().mockResolvedValue({ delivered: true });
  invitations.generateInvitationCode.mockReset().mockReturnValue("CODE-0001");
  invitations.generateInviteToken.mockReset().mockReturnValue("token-1");
  invitations.getInvitationExpiry.mockReset().mockReturnValue(EXPIRY);
});

describe("registerOrganiser", () => {
  const input = { full_name: "Thandi Mokoena", email: "thandi@test.com", password: "Secret123" };

  it("rejects an email that is already registered", async () => {
    prisma.users.findUnique.mockResolvedValue({ id: "existing" });
    await expect(authService.registerOrganiser(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already registered",
    });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates a confirmed Supabase user and an organiser account with the same id", async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ id: "auth-1", role: "organiser" });

    await expect(authService.registerOrganiser(input)).resolves.toEqual({
      user: { id: "auth-1", role: "organiser" },
    });
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
      email: "thandi@test.com",
      password: "Secret123",
      email_confirm: true,
    });
    expect(prisma.users.create).toHaveBeenCalledWith({
      data: {
        id: "auth-1",
        auth_provider_id: "auth-1",
        full_name: "Thandi Mokoena",
        email: "thandi@test.com",
        role: "organiser",
      },
      select: { id: true, full_name: true, email: true, role: true, created_at: true },
    });
  });

  it("surfaces a Supabase sign-up error as a 400", async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    supabase.auth.admin.createUser.mockResolvedValue({ data: null, error: { message: "Password too weak" } });
    await expect(authService.registerOrganiser(input)).rejects.toMatchObject({
      statusCode: 400,
      message: "Password too weak",
    });
  });

  it("deletes the Supabase user again if saving the account fails", async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    const dbError = new Error("insert failed");
    prisma.users.create.mockRejectedValue(dbError);

    await expect(authService.registerOrganiser(input)).rejects.toBe(dbError);
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
  });
});

describe("registerWithCode", () => {
  const input = (overrides = {}) => ({
    full_name: "Sipho Dlamini",
    email: "sipho@school.test",
    password: "Secret123",
    code: "EDU-AAAA-BBBB",
    ...overrides,
  });
  const invitation = (overrides = {}) => ({
    id: "inv-1",
    type: "educator",
    school_id: "school-1",
    school_name: null,
    olympiad_id: "oly-1",
    email: null,
    intended_school_role: null,
    used_by_id: null,
    expires_at: FUTURE,
    ...overrides,
  });

  const arrange = (inv) => {
    prisma.invitations.findUnique.mockResolvedValue(inv);
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ id: "auth-1" });
  };

  it("looks the invitation up by code", async () => {
    arrange(invitation());
    await authService.registerWithCode(input());
    expect(prisma.invitations.findUnique).toHaveBeenCalledWith({
      where: { code: "EDU-AAAA-BBBB" },
      include: { schools: true, olympiads: true },
    });
  });

  it("looks the invitation up by the hash of an emailed link token", async () => {
    arrange(invitation());
    await authService.registerWithCode(input({ code: undefined, invite_token: "abc" }));
    expect(prisma.invitations.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token_hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
      }),
    );
  });

  it.each([
    ["an unknown invitation", null, 400, "Invalid invitation code"],
    ["a used invitation", invitation({ used_by_id: "someone" }), 409, "Invitation already used"],
    ["an expired invitation", invitation({ expires_at: PAST }), 400, "Invitation expired"],
    [
      "an invitation issued to a different email",
      invitation({ email: "other@school.test" }),
      400,
      "This invitation was issued for a different email",
    ],
    ["a non-school invitation without a school", invitation({ type: "student", school_id: null }), 400, "Invitation is missing a school"],
    [
      "a pending school invitation without a school name",
      invitation({ type: "school", school_id: null, school_name: null }),
      400,
      "School invitation is missing a school name",
    ],
  ])("rejects %s", async (_label, inv, statusCode, message) => {
    prisma.invitations.findUnique.mockResolvedValue(inv);
    await expect(authService.registerWithCode(input())).rejects.toMatchObject({ statusCode, message });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("matches the invitation email case-insensitively", async () => {
    arrange(invitation({ email: "SIPHO@School.test" }));
    await expect(authService.registerWithCode(input({ email: "sipho@SCHOOL.TEST" }))).resolves.toBeDefined();
  });

  it("rejects an email that is already registered", async () => {
    prisma.invitations.findUnique.mockResolvedValue(invitation());
    prisma.users.findUnique.mockResolvedValue({ id: "existing" });
    await expect(authService.registerWithCode(input())).rejects.toMatchObject({ statusCode: 409 });
  });

  it("creates the school, registration and coordinator on a pending school invitation", async () => {
    arrange(
      invitation({
        type: "school",
        school_id: null,
        school_name: "Parktown High",
        intended_school_role: "coordinator",
      }),
    );
    prisma.schools.create.mockResolvedValue({ id: "school-new" });

    await authService.registerWithCode(input());

    expect(prisma.schools.create).toHaveBeenCalledWith({ data: { name: "Parktown High" } });
    expect(prisma.school_registrations.create).toHaveBeenCalledWith({
      data: { school_id: "school-new", olympiad_id: "oly-1", status: "approved" },
    });
    expect(prisma.users.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "educator" }) }),
    );
    expect(prisma.educators.create).toHaveBeenCalledWith({ data: { user_id: "auth-1", school_id: "school-new" } });
    expect(prisma.school_memberships.upsert).toHaveBeenCalledWith({
      where: { user_id_school_id: { user_id: "auth-1", school_id: "school-new" } },
      update: { status: "active", role: "coordinator" },
      create: { user_id: "auth-1", school_id: "school-new", role: "coordinator" },
    });
    expect(prisma.school_registrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { school_id_olympiad_id: { school_id: "school-new", olympiad_id: "oly-1" } },
      }),
    );
  });

  it("joins an educator to the invitation's existing school with the default role", async () => {
    arrange(invitation());

    await authService.registerWithCode(input());

    expect(prisma.schools.create).not.toHaveBeenCalled();
    expect(prisma.educators.create).toHaveBeenCalledWith({ data: { user_id: "auth-1", school_id: "school-1" } });
    expect(prisma.school_memberships.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { user_id: "auth-1", school_id: "school-1", role: "educator" } }),
    );
    expect(prisma.school_registrations.upsert).not.toHaveBeenCalled();
    expect(prisma.entrants.findFirst).not.toHaveBeenCalled();
  });

  it("links a student to the oldest unclaimed entrant at their school", async () => {
    arrange(invitation({ type: "student" }));
    prisma.entrants.findFirst.mockResolvedValue({ id: "ent-9" });

    await authService.registerWithCode(input());

    expect(prisma.entrants.findFirst).toHaveBeenCalledWith({
      where: { school_id: "school-1", user_id: null },
      orderBy: { created_at: "asc" },
    });
    expect(prisma.entrants.update).toHaveBeenCalledWith({
      where: { id: "ent-9" },
      data: { user_id: "auth-1", full_name: "Sipho Dlamini" },
    });
    expect(prisma.entrants.create).not.toHaveBeenCalled();
    expect(prisma.educators.create).not.toHaveBeenCalled();
  });

  it("creates a new entrant when the school has none unclaimed", async () => {
    arrange(invitation({ type: "student" }));
    prisma.entrants.findFirst.mockResolvedValue(null);

    await authService.registerWithCode(input());
    expect(prisma.entrants.create).toHaveBeenCalledWith({
      data: { user_id: "auth-1", school_id: "school-1", full_name: "Sipho Dlamini" },
    });
  });

  it("marks the invitation as used by the new account", async () => {
    arrange(invitation());
    await expect(authService.registerWithCode(input())).resolves.toEqual({ user: { id: "auth-1" } });
    expect(prisma.invitations.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { used_by_id: "auth-1", accepted_at: expect.any(Date) },
    });
  });

  it("deletes the Supabase user again if the registration transaction fails", async () => {
    arrange(invitation());
    const txError = new Error("tx failed");
    prisma.$transaction.mockRejectedValue(txError);

    await expect(authService.registerWithCode(input())).rejects.toBe(txError);
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
  });
});

describe("validateInvitationCode", () => {
  it.each([
    [null, 404, "Invalid invitation code"],
    [{ used_by_id: "u", expires_at: FUTURE }, 400, "Invitation already used"],
    [{ used_by_id: null, expires_at: PAST }, 400, "Invitation expired"],
  ])("rejects %p", async (inv, statusCode, message) => {
    prisma.invitations.findUnique.mockResolvedValue(inv);
    await expect(authService.validateInvitationCode("C")).rejects.toMatchObject({ statusCode, message });
  });

  it("describes a valid invitation", async () => {
    prisma.invitations.findUnique.mockResolvedValue({
      type: "student",
      email: null,
      used_by_id: null,
      expires_at: FUTURE,
      schools: { id: "s", name: "Parktown" },
      olympiads: null,
    });
    await expect(authService.validateInvitationCode("C")).resolves.toEqual({
      valid: true,
      type: "student",
      email: null,
      school: { id: "s", name: "Parktown" },
      olympiad: null,
    });
  });
});

describe("validateInvitationToken", () => {
  it.each([
    ["missing", null],
    ["used", { used_by_id: "u", expires_at: FUTURE }],
    ["expired", { used_by_id: null, expires_at: PAST }],
  ])("gives one generic 404 for a %s link", async (_label, inv) => {
    prisma.invitations.findUnique.mockResolvedValue(inv);
    await expect(authService.validateInvitationToken("t")).rejects.toMatchObject({
      statusCode: 404,
      message: "This invitation link is invalid, expired, or has already been used",
    });
  });

  it("falls back to the pending school name before the school exists", async () => {
    prisma.invitations.findUnique.mockResolvedValue({
      type: "school",
      email: "head@school.test",
      school_name: "Parktown High",
      schools: null,
      olympiads: { id: "o", name: "Maths" },
      used_by_id: null,
      expires_at: FUTURE,
    });
    await expect(authService.validateInvitationToken("t")).resolves.toEqual({
      valid: true,
      type: "school",
      email: "head@school.test",
      school: { name: "Parktown High" },
      olympiad: { id: "o", name: "Maths" },
    });
  });

  it("returns a null school when there is no school or name", async () => {
    prisma.invitations.findUnique.mockResolvedValue({
      type: "student",
      schools: null,
      school_name: null,
      olympiads: null,
      used_by_id: null,
      expires_at: FUTURE,
    });
    await expect(authService.validateInvitationToken("t")).resolves.toMatchObject({ school: null });
  });
});

describe("deleteAccount", () => {
  it("removes the Supabase user, then soft-deletes the account", async () => {
    await authService.deleteAccount("user-1");
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("refuses when Supabase isn't configured", async () => {
    // Load a fresh copy of the service that sees no Supabase client. The
    // copy used by the other tests keeps its original references.
    jest.resetModules();
    jest.doMock("../../../src/config/supabase", () => null);
    const unconfigured = require("../../../src/services/authService");

    await expect(unconfigured.deleteAccount("user-1")).rejects.toMatchObject({
      statusCode: 400,
      message: "Supabase is not configured on the server",
    });
  });
});

describe("inviteSchool", () => {
  const input = {
    schoolName: "Parktown High",
    contactEmail: "head@school.test",
    olympiadId: "oly-1",
    organiserId: "org-1",
  };

  beforeEach(() => {
    prisma.olympiads.findFirst.mockResolvedValue({ id: "oly-1", name: "Maths Olympiad" });
    prisma.invitations.create.mockImplementation(async ({ data }) => ({ id: "inv-1", ...data }));
  });

  it("rejects an olympiad the organiser doesn't own", async () => {
    prisma.olympiads.findFirst.mockResolvedValue(null);
    await expect(authService.inviteSchool(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.olympiads.findFirst).toHaveBeenCalledWith({
      where: { id: "oly-1", organiser_id: "org-1" },
      select: { id: true, name: true },
    });
  });

  it("stores only the hash of the link token and a 7-day coordinator invitation", async () => {
    invitations.generateInvitationCode.mockReturnValue("SCH-AB12");
    await authService.inviteSchool(input);

    expect(invitations.generateInvitationCode).toHaveBeenCalledWith("school");
    expect(invitations.getInvitationExpiry).toHaveBeenCalledWith("school");
    expect(prisma.invitations.create).toHaveBeenCalledWith({
      data: {
        code: "SCH-AB12",
        token_hash: invitations.hashInviteToken("token-1"),
        type: "school",
        intended_school_role: "coordinator",
        school_name: "Parktown High",
        olympiad_id: "oly-1",
        email: "head@school.test",
        created_by_id: "org-1",
        expires_at: EXPIRY,
      },
    });
  });

  it("emails a registration link on the configured frontend", async () => {
    invitations.generateInvitationCode.mockReturnValue("SCH-AB12");
    mailer.sendSchoolInviteEmail.mockResolvedValue({ delivered: false });

    const result = await authService.inviteSchool(input);

    expect(mailer.sendSchoolInviteEmail).toHaveBeenCalledWith({
      to: "head@school.test",
      schoolName: "Parktown High",
      olympiadName: "Maths Olympiad",
      inviteCode: "SCH-AB12",
      registrationUrl: "https://frontend.test/register?token=token-1",
    });
    expect(result).toMatchObject({
      code: "SCH-AB12",
      registrationUrl: "https://frontend.test/register?token=token-1",
      emailDelivered: false,
    });
  });

  it("retries with a fresh code when the code collides", async () => {
    invitations.generateInvitationCode.mockReturnValueOnce("SCH-DUPE").mockReturnValueOnce("SCH-NEW1");
    prisma.invitations.create
      .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
      .mockImplementationOnce(async ({ data }) => ({ id: "inv-1", ...data }));

    const result = await authService.inviteSchool(input);
    expect(prisma.invitations.create).toHaveBeenCalledTimes(2);
    expect(result.code).toBe("SCH-NEW1");
  });

  it("gives up after five collisions", async () => {
    const collision = Object.assign(new Error("unique"), { code: "P2002" });
    prisma.invitations.create.mockRejectedValue(collision);

    await expect(authService.inviteSchool(input)).rejects.toBe(collision);
    expect(prisma.invitations.create).toHaveBeenCalledTimes(5);
    expect(mailer.sendSchoolInviteEmail).not.toHaveBeenCalled();
  });

  it("does not retry other database errors", async () => {
    const other = Object.assign(new Error("fk"), { code: "P2003" });
    prisma.invitations.create.mockRejectedValue(other);

    await expect(authService.inviteSchool(input)).rejects.toBe(other);
    expect(prisma.invitations.create).toHaveBeenCalledTimes(1);
  });
});

describe("inviteEducator", () => {
  const input = { email: "teacher@school.test", schoolId: "school-1", olympiadId: "oly-1", createdById: "u-1" };

  it("rejects a school that isn't registered for the olympiad", async () => {
    prisma.school_registrations.findUnique.mockResolvedValue(null);
    await expect(authService.inviteEducator(input)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("creates an educator invitation and emails the link", async () => {
    prisma.school_registrations.findUnique.mockResolvedValue({ olympiads: { name: "Maths" } });
    prisma.invitations.create.mockResolvedValue({ id: "inv-2" });
    invitations.generateInvitationCode.mockReturnValue("EDU-1111-2222");

    const result = await authService.inviteEducator(input);

    expect(prisma.invitations.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: "EDU-1111-2222",
        type: "educator",
        intended_school_role: "educator",
        school_id: "school-1",
        email: "teacher@school.test",
      }),
    });
    expect(mailer.sendEducatorInviteEmail).toHaveBeenCalledWith({
      to: "teacher@school.test",
      olympiadName: "Maths",
      inviteCode: "EDU-1111-2222",
      registrationUrl: "https://frontend.test/register?token=token-1",
    });
    expect(result).toEqual({
      invitation: { id: "inv-2" },
      code: "EDU-1111-2222",
      registrationUrl: "https://frontend.test/register?token=token-1",
      emailDelivered: true,
    });
  });
});

describe("generateStudentCodes", () => {
  const input = { count: 3, schoolId: "school-1", olympiadId: "oly-1", createdById: "u-1" };

  it("rejects a school that isn't registered for the olympiad", async () => {
    prisma.school_registrations.findUnique.mockResolvedValue(null);
    await expect(authService.generateStudentCodes(input)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("creates the requested number of 30-day student codes", async () => {
    prisma.school_registrations.findUnique.mockResolvedValue({ id: "reg" });
    invitations.generateInvitationCode
      .mockReturnValueOnce("STU-1")
      .mockReturnValueOnce("STU-2")
      .mockReturnValueOnce("STU-3");

    await expect(authService.generateStudentCodes(input)).resolves.toEqual([
      { code: "STU-1" },
      { code: "STU-2" },
      { code: "STU-3" },
    ]);
    expect(prisma.invitations.create).toHaveBeenCalledTimes(3);
    expect(invitations.getInvitationExpiry).toHaveBeenCalledWith("student");
  });
});

describe("listEducatorOlympiads", () => {
  it("returns the olympiads from the school's approved registrations", async () => {
    prisma.school_registrations.findMany.mockResolvedValue([
      { olympiads: { id: "o1", name: "Maths" } },
      { olympiads: { id: "o2", name: "Science" } },
    ]);
    await expect(authService.listEducatorOlympiads("school-1")).resolves.toEqual([
      { id: "o1", name: "Maths" },
      { id: "o2", name: "Science" },
    ]);
    expect(prisma.school_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { school_id: "school-1", status: "approved" } }),
    );
  });
});

describe("inviteStudent", () => {
  const input = { email: "learner@school.test", schoolId: "school-1", olympiadId: "oly-1", createdById: "u-1" };

  it("rejects a school that isn't registered for the olympiad", async () => {
    prisma.school_registrations.findUnique.mockResolvedValue(null);
    await expect(authService.inviteStudent(input)).rejects.toMatchObject({
      statusCode: 404,
      message: "Your school is not registered for this olympiad",
    });
  });

  it("retries a colliding code and emails the student", async () => {
    prisma.school_registrations.findUnique.mockResolvedValue({ olympiads: { name: "Maths" } });
    invitations.generateInvitationCode.mockReturnValueOnce("STU-DUPE").mockReturnValueOnce("STU-OK");
    prisma.invitations.create
      .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
      .mockImplementationOnce(async ({ data }) => ({ id: "inv-3", ...data }));

    const result = await authService.inviteStudent(input);

    expect(mailer.sendStudentInviteEmail).toHaveBeenCalledWith({
      to: "learner@school.test",
      olympiadName: "Maths",
      inviteCode: "STU-OK",
      registrationUrl: "https://frontend.test/register?token=token-1",
    });
    expect(result).toMatchObject({ code: "STU-OK", emailDelivered: true });
  });
});

describe("listStudentInvitations", () => {
  it("summarises each invitation's status", async () => {
    prisma.invitations.findMany.mockResolvedValue([
      { id: "1", email: "a@t", code: "A", used_by_id: "u", expires_at: PAST, olympiads: { name: "Maths" } },
      { id: "2", email: "b@t", code: "B", used_by_id: null, expires_at: PAST, olympiads: null },
      { id: "3", email: "c@t", code: "C", used_by_id: null, expires_at: FUTURE, olympiads: { name: "Science" } },
    ]);

    await expect(authService.listStudentInvitations("school-1")).resolves.toEqual([
      { id: "1", email: "a@t", olympiadName: "Maths", code: "A", status: "accepted" },
      { id: "2", email: "b@t", olympiadName: "Olympiad", code: "B", status: "expired" },
      { id: "3", email: "c@t", olympiadName: "Science", code: "C", status: "pending" },
    ]);
    expect(prisma.invitations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { school_id: "school-1", type: "student" } }),
    );
  });
});
