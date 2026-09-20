jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/services/authService", () => ({
  registerOrganiser: jest.fn(),
  registerWithCode: jest.fn(),
  validateInvitationCode: jest.fn(),
  validateInvitationToken: jest.fn(),
  deleteAccount: jest.fn(),
  inviteSchool: jest.fn(),
  inviteEducator: jest.fn(),
  generateStudentCodes: jest.fn(),
  listEducatorOlympiads: jest.fn(),
  inviteStudent: jest.fn(),
  listStudentInvitations: jest.fn(),
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const authService = require("../../../src/services/authService");
const controller = require("../../../src/controllers/authController");
const { mockReq, run } = require("../helpers/http");
const { describeControllerCases } = require("../helpers/controllerCases");

const user = { userId: "user-1", role: "educator" };
const ok = (data) => ({ success: true, data });

beforeEach(() => {
  resetPrismaMock();
  prisma.educators.findUnique.mockResolvedValue({ school_id: "school-1" });
});

describeControllerCases(controller, [
  {
    handler: "registerOrganiser",
    service: authService,
    method: "registerOrganiser",
    req: mockReq({ body: { full_name: "Thandi", email: "t@test.com", password: "Secret123", role: "admin" } }),
    args: [{ full_name: "Thandi", email: "t@test.com", password: "Secret123" }],
    status: 201,
    result: { user: { id: "auth-1", role: "organiser" } },
    json: () => ok({ user: { id: "auth-1", role: "organiser" } }),
  },
  {
    handler: "registerWithCode",
    service: authService,
    method: "registerWithCode",
    req: mockReq({
      body: { full_name: "Sipho", email: "s@test.com", password: "Secret123", code: "EDU-1", invite_token: "tok" },
    }),
    args: [{ full_name: "Sipho", email: "s@test.com", password: "Secret123", code: "EDU-1", invite_token: "tok" }],
    status: 201,
    result: { user: { id: "auth-2", role: "educator" } },
    json: () => ok({ user: { id: "auth-2", role: "educator" } }),
  },
  {
    handler: "validateCode",
    service: authService,
    method: "validateInvitationCode",
    req: mockReq({ params: { code: "SCH-AB12" } }),
    args: ["SCH-AB12"],
    json: (result) => ok(result),
  },
  {
    handler: "validateInviteToken",
    service: authService,
    method: "validateInvitationToken",
    req: mockReq({ params: { token: "link-token" } }),
    args: ["link-token"],
    json: (result) => ok(result),
  },
  {
    handler: "deleteAccount",
    service: authService,
    method: "deleteAccount",
    req: mockReq({ user }),
    args: ["user-1"],
    json: () => ok({ message: "Account deleted" }),
  },
  {
    handler: "inviteSchool",
    service: authService,
    method: "inviteSchool",
    req: mockReq({
      user: { userId: "org-1", role: "organiser" },
      body: { school_name: "Parktown", contact_email: "head@p.test", olympiad_id: "oly-1" },
    }),
    args: [{ schoolName: "Parktown", contactEmail: "head@p.test", olympiadId: "oly-1", organiserId: "org-1" }],
    status: 201,
    json: (result) => ok(result),
  },
  {
    handler: "inviteEducator",
    service: authService,
    method: "inviteEducator",
    req: mockReq({ user, body: { email: "t@school.test", olympiad_id: "oly-1" } }),
    args: [{ email: "t@school.test", schoolId: "school-1", olympiadId: "oly-1", createdById: "user-1" }],
    status: 201,
    json: (result) => ok(result),
  },
  {
    handler: "generateStudentCodes",
    service: authService,
    method: "generateStudentCodes",
    req: mockReq({ user, body: { count: "25", olympiad_id: "oly-1" } }),
    args: [{ count: 25, schoolId: "school-1", olympiadId: "oly-1", createdById: "user-1" }],
    status: 201,
    json: (result) => ok({ codes: result }),
  },
  {
    handler: "getEducatorOlympiads",
    service: authService,
    method: "listEducatorOlympiads",
    req: mockReq({ user }),
    args: ["school-1"],
    json: (result) => ok({ olympiads: result }),
  },
  {
    handler: "inviteStudent",
    service: authService,
    method: "inviteStudent",
    req: mockReq({ user, body: { email: "l@school.test", olympiad_id: "oly-1" } }),
    args: [{ email: "l@school.test", olympiadId: "oly-1", schoolId: "school-1", createdById: "user-1" }],
    status: 201,
    json: (result) => ok(result),
  },
  {
    handler: "getStudentInvitations",
    service: authService,
    method: "listStudentInvitations",
    req: mockReq({ user }),
    args: ["school-1"],
    json: (result) => ok({ invitations: result }),
  },
]);

describe.each([
  ["inviteEducator", "inviteEducator"],
  ["generateStudentCodes", "generateStudentCodes"],
  ["getEducatorOlympiads", "listEducatorOlympiads"],
  ["inviteStudent", "inviteStudent"],
  ["getStudentInvitations", "listStudentInvitations"],
])("%s without an educator profile", (handler, method) => {
  it("responds 401 and doesn't call the service", async () => {
    prisma.educators.findUnique.mockResolvedValue(null);
    authService[method].mockReset();

    const { res, next } = await run(controller[handler], mockReq({ user, body: { count: "1" } }));

    expect(prisma.educators.findUnique).toHaveBeenCalledWith({ where: { user_id: "user-1" } });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, message: "Educator profile not found" });
    expect(authService[method]).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("me", () => {
  it("returns the signed-in user's profile with school details", async () => {
    const profile = { id: "user-1", full_name: "Sipho", role: "educator" };
    prisma.users.findUnique.mockResolvedValue(profile);

    const { res, next } = await run(controller.me, mockReq({ user }));

    expect(prisma.users.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: expect.objectContaining({
        id: true,
        email: true,
        role: true,
        school_memberships: expect.objectContaining({ where: { status: "active" } }),
        educators: expect.any(Object),
        entrants: expect.any(Object),
      }),
    });
    expect(res.json).toHaveBeenCalledWith(ok({ user: profile }));
    expect(next).not.toHaveBeenCalled();
  });

  it("passes a database error to the error handler", async () => {
    const err = new Error("db down");
    prisma.users.findUnique.mockRejectedValue(err);
    const { next } = await run(controller.me, mockReq({ user }));
    expect(next).toHaveBeenCalledWith(err);
  });
});
