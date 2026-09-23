jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/config/supabase", () => ({
  auth: { admin: { createUser: jest.fn(), deleteUser: jest.fn() } },
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const supabase = require("../../../src/config/supabase");
const authService = require("../../../src/services/authService");

const input = (overrides = {}) => ({
  full_name: "Thandi Mokoena",
  email: "thandi@test.com",
  password: "Secret123",
  role: "organiser",
  ...overrides,
});

beforeEach(() => {
  resetPrismaMock();
  supabase.auth.admin.createUser.mockReset().mockResolvedValue({
    data: { user: { id: "auth-1" } },
    error: null,
  });
  supabase.auth.admin.deleteUser.mockReset().mockResolvedValue({});
  prisma.users.findUnique.mockResolvedValue(null);
  prisma.users.create.mockResolvedValue({ id: "auth-1", role: "organiser" });
});

describe("register", () => {
  it("rejects an unknown role before touching Supabase", async () => {
    await expect(authService.register(input({ role: "admin" }))).rejects.toMatchObject({
      statusCode: 400,
      message: "Unknown account type",
    });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects an email that is already registered", async () => {
    prisma.users.findUnique.mockResolvedValue({ id: "existing" });

    await expect(authService.register(input())).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already registered",
    });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase failure as a 400", async () => {
    supabase.auth.admin.createUser.mockResolvedValue({ data: null, error: { message: "weak password" } });

    await expect(authService.register(input())).rejects.toMatchObject({
      statusCode: 400,
      message: "weak password",
    });
  });

  describe("organiser", () => {
    it("creates a confirmed Supabase user and the account with the same id", async () => {
      const { user } = await authService.register(input());

      expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
        email: "thandi@test.com",
        password: "Secret123",
        email_confirm: true,
      });
      expect(prisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: "auth-1", auth_provider_id: "auth-1", role: "organiser" }),
        }),
      );
      expect(user).toEqual({ id: "auth-1", role: "organiser" });
      expect(prisma.educators.create).not.toHaveBeenCalled();
      expect(prisma.entrants.create).not.toHaveBeenCalled();
    });

    it("deletes the Supabase login again if the account row cannot be written", async () => {
      prisma.users.create.mockRejectedValue(new Error("db down"));

      await expect(authService.register(input())).rejects.toThrow("db down");
      expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
    });
  });

  describe("educator", () => {
    const educatorInput = (overrides) => input({ role: "educator", ...overrides });

    beforeEach(() => {
      prisma.users.create.mockResolvedValue({ id: "auth-1", role: "educator" });
      prisma.schools.findUnique.mockResolvedValue({ id: "school-1" });
      prisma.schools.findFirst.mockResolvedValue(null);
      prisma.school_memberships.findFirst.mockResolvedValue(null);
    });

    it("requires a school", async () => {
      await expect(authService.register(educatorInput())).rejects.toMatchObject({
        statusCode: 400,
        message: "Select your school, or enter its name",
      });
      expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it("joins the chosen school and coordinates it when it has no coordinator yet", async () => {
      await authService.register(educatorInput({ school_id: "school-1" }));

      expect(prisma.educators.create).toHaveBeenCalledWith({
        data: { user_id: "auth-1", school_id: "school-1" },
      });
      expect(prisma.school_memberships.create).toHaveBeenCalledWith({
        data: { user_id: "auth-1", school_id: "school-1", role: "coordinator" },
      });
    });

    it("joins as an ordinary member when the school already has a coordinator", async () => {
      prisma.school_memberships.findFirst.mockResolvedValue({ id: "membership-1" });

      await authService.register(educatorInput({ school_id: "school-1" }));

      expect(prisma.school_memberships.create).toHaveBeenCalledWith({
        data: { user_id: "auth-1", school_id: "school-1", role: "educator" },
      });
    });

    it("rejects a school id that does not exist", async () => {
      prisma.schools.findUnique.mockResolvedValue(null);

      await expect(authService.register(educatorInput({ school_id: "missing" }))).rejects.toMatchObject({
        statusCode: 404,
        message: "School not found",
      });
      expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
    });

    it("creates a school that is not on the platform yet, trimming its name", async () => {
      prisma.schools.create.mockResolvedValue({ id: "school-new" });

      await authService.register(educatorInput({ school_name: "  Parktown Boys High " }));

      expect(prisma.schools.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: "Parktown Boys High", mode: "insensitive" } },
        select: { id: true },
      });
      expect(prisma.schools.create).toHaveBeenCalledWith({ data: { name: "Parktown Boys High" } });
      expect(prisma.educators.create).toHaveBeenCalledWith({
        data: { user_id: "auth-1", school_id: "school-new" },
      });
    });

    it("reuses a school whose name matches apart from case", async () => {
      prisma.schools.findFirst.mockResolvedValue({ id: "school-1" });

      await authService.register(educatorInput({ school_name: "parktown BOYS high" }));

      expect(prisma.schools.create).not.toHaveBeenCalled();
      expect(prisma.educators.create).toHaveBeenCalledWith({
        data: { user_id: "auth-1", school_id: "school-1" },
      });
    });
  });

  describe("student", () => {
    const studentInput = (overrides) => input({ role: "student", ...overrides });

    beforeEach(() => {
      prisma.users.create.mockResolvedValue({ id: "auth-1", role: "student" });
      prisma.schools.findUnique.mockResolvedValue({ id: "school-1" });
      prisma.entrants.findFirst.mockResolvedValue(null);
    });

    it("must pick a school from the list, and may not name a new one", async () => {
      await expect(authService.register(studentInput({ school_name: "Somewhere New" }))).rejects.toMatchObject({
        statusCode: 400,
        message: "Select your school from the list",
      });
      expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it("creates an entrant at the chosen school", async () => {
      await authService.register(studentInput({ school_id: "school-1" }));

      expect(prisma.entrants.create).toHaveBeenCalledWith({
        data: { user_id: "auth-1", school_id: "school-1", full_name: "Thandi Mokoena" },
      });
    });

    it("claims an entrant the educator already listed under the same name", async () => {
      prisma.entrants.findFirst.mockResolvedValue({ id: "entrant-1" });

      await authService.register(studentInput({ school_id: "school-1" }));

      expect(prisma.entrants.findFirst).toHaveBeenCalledWith({
        where: { school_id: "school-1", user_id: null, full_name: "Thandi Mokoena" },
        orderBy: { created_at: "asc" },
      });
      expect(prisma.entrants.update).toHaveBeenCalledWith({
        where: { id: "entrant-1" },
        data: { user_id: "auth-1" },
      });
      expect(prisma.entrants.create).not.toHaveBeenCalled();
    });
  });
});

describe("registerOrganiser", () => {
  it("registers with the organiser role, whatever else is passed", async () => {
    const { user } = await authService.registerOrganiser({
      full_name: "Thandi Mokoena",
      email: "thandi@test.com",
      password: "Secret123",
    });

    expect(prisma.users.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "organiser" }) }),
    );
    expect(user).toEqual({ id: "auth-1", role: "organiser" });
  });
});

describe("listSchools", () => {
  it("returns the schools by name, with only the fields the signup form needs", async () => {
    prisma.schools.findMany.mockResolvedValue([{ id: "school-1", name: "Alpha Academy" }]);

    await expect(authService.listSchools()).resolves.toEqual([{ id: "school-1", name: "Alpha Academy" }]);
    expect(prisma.schools.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
});

describe("listEducatorOlympiads", () => {
  it("returns only the approved registrations' olympiads", async () => {
    prisma.school_registrations.findMany.mockResolvedValue([
      { olympiads: { id: "oly-1", name: "Nationals" } },
    ]);

    await expect(authService.listEducatorOlympiads("school-1")).resolves.toEqual([
      { id: "oly-1", name: "Nationals" },
    ]);
    expect(prisma.school_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { school_id: "school-1", status: "approved" } }),
    );
  });
});

describe("deleteAccount", () => {
  it("removes the Supabase login and soft-deletes the row", async () => {
    await authService.deleteAccount("user-1");

    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
