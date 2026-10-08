// /auth: open registration in all three roles, the public school list, the
// current user, and account deletion.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { supabase } = require("../integration/helpers/externalMocks");
const { api, as, expectError, expectOk } = require("./helpers/api");

const PASSWORD = "Secret123";

describe("POST /auth/register", () => {
  const body = (overrides = {}) => ({
    full_name: "Thandi Mokoena",
    email: "thandi@olympiad.test",
    password: PASSWORD,
    role: "organiser",
    ...overrides,
  });

  it("creates the Supabase login and the organiser, returning only safe fields", async () => {
    const res = await api().post("/auth/register").send(body());

    const { user } = expectOk(res, 201);
    expect(user).toEqual({
      id: expect.any(String),
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      role: "organiser",
      created_at: expect.any(String),
    });
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith({
      email: "thandi@olympiad.test",
      password: PASSWORD,
      email_confirm: true,
    });
    expect(await prisma.users.findUnique({ where: { id: user.id } })).toMatchObject({
      role: "organiser",
      auth_provider_id: user.id,
    });
  });

  it("keeps the address the user typed (only lowercased), so they can log in with it", async () => {
    const res = await api().post("/auth/register").send(body({ email: "  First.Last+Olympiad@Gmail.com " }));
    expect(expectOk(res, 201).user.email).toBe("first.last+olympiad@gmail.com");
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "first.last+olympiad@gmail.com" }),
    );
  });

  it.each([
    ["a missing name", { full_name: "  " }, "Full name is required"],
    ["an invalid email", { email: "not-an-email" }, "Valid email required"],
    ["a short password", { password: "Ab1" }, "Min 8 characters"],
    ["a password without an uppercase letter", { password: "secret123" }, "Needs uppercase"],
    ["a password without a number", { password: "SecretPass" }, "Needs a number"],
    ["an unknown role", { role: "admin" }, "Choose organiser, educator or student"],
  ])("responds 422 for %s", async (_label, overrides, message) => {
    expectError(await api().post("/auth/register").send(body(overrides)), 422, message);
  });

  it("rejects an address that is already registered", async () => {
    const existing = await f.createOrganiser();
    expectError(
      await api().post("/auth/register").send(body({ email: existing.email })),
      409,
      "Email already registered",
    );
  });

  describe("as an educator", () => {
    it("joins an existing school as an ordinary member when it already has a coordinator", async () => {
      const school = await f.createSchool();
      await f.createEducator({ school, membershipRole: "coordinator" });

      const { user } = expectOk(
        await api()
          .post("/auth/register")
          .send(body({ email: "colleague@school.test", role: "educator", school_id: school.id })),
        201,
      );

      expect(user.role).toBe("educator");
      expect(await prisma.educators.findUnique({ where: { user_id: user.id } })).toMatchObject({
        school_id: school.id,
      });
      expect(
        await prisma.school_memberships.findUnique({
          where: { user_id_school_id: { user_id: user.id, school_id: school.id } },
        }),
      ).toMatchObject({ role: "educator", status: "active" });
    });

    it("creates a school that is not listed yet and makes the educator its coordinator", async () => {
      const { user } = expectOk(
        await api()
          .post("/auth/register")
          .send(body({ email: "first@newschool.test", role: "educator", school_name: "  Parktown Boys High " })),
        201,
      );

      const educator = await prisma.educators.findUnique({ where: { user_id: user.id } });
      const school = await prisma.schools.findUnique({ where: { id: educator.school_id } });
      expect(school.name).toBe("Parktown Boys High");
      expect(
        await prisma.school_memberships.findUnique({
          where: { user_id_school_id: { user_id: user.id, school_id: school.id } },
        }),
      ).toMatchObject({ role: "coordinator" });
    });

    it("reuses a school whose name differs only in case, rather than creating a duplicate", async () => {
      const school = await f.createSchool({ name: "Parktown Boys High" });

      const { user } = expectOk(
        await api()
          .post("/auth/register")
          .send(body({ email: "second@newschool.test", role: "educator", school_name: "parktown BOYS high" })),
        201,
      );

      expect(await prisma.educators.findUnique({ where: { user_id: user.id } })).toMatchObject({
        school_id: school.id,
      });
      expect(await prisma.schools.count({ where: { name: { equals: "Parktown Boys High", mode: "insensitive" } } })).toBe(1);
    });

    it("requires a school", async () => {
      expectError(
        await api().post("/auth/register").send(body({ role: "educator" })),
        422,
        "Select your school, or enter its name",
      );
    });
  });

  describe("as a student", () => {
    it("creates the entrant record at the chosen school", async () => {
      const school = await f.createSchool();

      const { user } = expectOk(
        await api()
          .post("/auth/register")
          .send(body({ email: "learner@school.test", role: "student", school_id: school.id })),
        201,
      );

      expect(user.role).toBe("student");
      expect(await prisma.entrants.findUnique({ where: { user_id: user.id } })).toMatchObject({
        school_id: school.id,
        full_name: "Thandi Mokoena",
      });
    });

    it("claims the entrant an educator already listed under the same name", async () => {
      const school = await f.createSchool();
      const listed = await f.createEntrant({ school, full_name: "Thandi Mokoena", grade: "11" });

      const { user } = expectOk(
        await api()
          .post("/auth/register")
          .send(body({ email: "learner2@school.test", role: "student", school_id: school.id })),
        201,
      );

      expect(await prisma.entrants.findUnique({ where: { id: listed.id } })).toMatchObject({
        user_id: user.id,
        grade: "11",
      });
      expect(await prisma.entrants.count({ where: { school_id: school.id } })).toBe(1);
    });

    it("must pick a school from the list", async () => {
      expectError(
        await api().post("/auth/register").send(body({ role: "student", school_name: "Somewhere New" })),
        422,
        "Select your school from the list",
      );
    });

    it("rejects a school id that does not exist", async () => {
      expectError(
        await api()
          .post("/auth/register")
          .send(body({ role: "student", school_id: "00000000-0000-4000-8000-000000000000" })),
        404,
        "School not found",
      );
    });
  });

  it("removes the Supabase login again when the database write fails", async () => {
    const school = await f.createSchool();
    const spy = jest.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db down"));

    await api().post("/auth/register").send(body({ role: "student", school_id: school.id }));

    expect(supabase.auth.admin.deleteUser).toHaveBeenCalled();
    expect(await prisma.users.findUnique({ where: { email: "thandi@olympiad.test" } })).toBeNull();
    spy.mockRestore();
  });
});

describe("POST /auth/register/organiser", () => {
  it("still registers an organiser, so existing sign-up links keep working", async () => {
    const { user } = expectOk(
      await api()
        .post("/auth/register/organiser")
        .send({ full_name: "Sipho Dlamini", email: "sipho@olympiad.test", password: PASSWORD }),
      201,
    );
    expect(user.role).toBe("organiser");
  });
});

describe("GET /auth/schools", () => {
  it("lists the schools by name without a token, so the signup form can offer them", async () => {
    await f.createSchool({ name: "Zeta College" });
    await f.createSchool({ name: "Alpha Academy" });

    const { schools } = expectOk(await api().get("/auth/schools"));

    expect(schools.map((s) => s.name)).toEqual(["Alpha Academy", "Zeta College"]);
    expect(schools[0]).toEqual({ id: expect.any(String), name: "Alpha Academy" });
  });
});

describe("POST /auth/forgot-password", () => {
  const SAME_REPLY = { message: "If an account exists for that address, a reset link is on its way." };
  const EMAILJS = {
    EMAILJS_SERVICE_ID: "service_1",
    EMAILJS_TEMPLATE_ID: "template_1",
    EMAILJS_USER_ID: "user_1",
    EMAILJS_PRIVATE_KEY: "private_1",
  };
  const realFetch = global.fetch;

  beforeEach(() => {
    require("../../src/services/passwordResetService").resetPasswordResetThrottle();
  });

  afterEach(() => {
    global.fetch = realFetch;
    for (const key of Object.keys(EMAILJS)) process.env[key] = "";
  });

  describe("with EmailJS set up, as in production", () => {
    beforeEach(() => {
      Object.assign(process.env, EMAILJS);
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    });

    const emailed = () => global.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).template_params);

    it("emails a reset link through EmailJS, so Supabase's email limit doesn't apply", async () => {
      await f.createOrganiser({ email: "thandi@olympiad.test" });

      expect(expectOk(await api().post("/auth/forgot-password").send({ email: " Thandi@Olympiad.test " }))).toEqual(SAME_REPLY);

      expect(supabase.auth.admin.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "thandi@olympiad.test" });
      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
      const [email] = emailed();
      expect(email).toMatchObject({ to_email: "thandi@olympiad.test", subject: "Reset your Olympiad Portal password" });
      expect(email.html_content).toContain(
        "https://olympiad.test/reset-password?token_hash=hashed-thandi%40olympiad.test&type=recovery",
      );
    });

    it("gives the same reply for an address without an account, and sends nothing", async () => {
      expect(expectOk(await api().post("/auth/forgot-password").send({ email: "nobody@olympiad.test" }))).toEqual(SAME_REPLY);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("doesn't send to a deleted account", async () => {
      const organiser = await f.createOrganiser({ email: "thandi@olympiad.test" });
      expectOk(await as(organiser).delete("/auth/account"));

      expectOk(await api().post("/auth/forgot-password").send({ email: "thandi@olympiad.test" }));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("sends one email a minute to the same address, however often the form is sent", async () => {
      await f.createOrganiser({ email: "thandi@olympiad.test" });

      for (let i = 0; i < 3; i += 1) {
        expect(expectOk(await api().post("/auth/forgot-password").send({ email: "thandi@olympiad.test" }))).toEqual(SAME_REPLY);
      }
      expect(emailed()).toHaveLength(1);
    });
  });

  it("uses Supabase's sender when EmailJS isn't set up", async () => {
    await f.createOrganiser({ email: "thandi@olympiad.test" });

    expectOk(await api().post("/auth/forgot-password").send({ email: "thandi@olympiad.test" }));

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("thandi@olympiad.test", {
      redirectTo: "https://olympiad.test/reset-password",
    });
  });

  it("responds 422 for an invalid email", async () => {
    expectError(await api().post("/auth/forgot-password").send({ email: "not-an-email" }), 422, "Valid email required");
  });
});

describe("GET /auth/me", () => {
  it("returns the educator with their school and membership", async () => {
    const { educatorUser, school } = await f.createOlympiadWithSchool();

    const { user } = expectOk(await as(educatorUser).get("/auth/me"));

    expect(user).toMatchObject({ id: educatorUser.id, role: "educator" });
    expect(user.educators.school_id).toBe(school.id);
    expect(user.school_memberships).toEqual([
      { school_id: school.id, role: "coordinator", schools: { name: school.name } },
    ]);
  });

  it("returns the student with their entrant school", async () => {
    const school = await f.createSchool();
    const { user: studentUser } = await f.createStudent({ school });

    const { user } = expectOk(await as(studentUser).get("/auth/me"));

    expect(user.entrants.school_id).toBe(school.id);
  });
});

describe("GET /auth/educator-olympiads", () => {
  it("lists only the olympiads the educator's school is approved for", async () => {
    const { olympiad, school, educatorUser } = await f.createOlympiadWithSchool();
    const other = await f.createOlympiad();
    await f.registerSchool(school, other, { status: "pending" });

    const { olympiads } = expectOk(await as(educatorUser).get("/auth/educator-olympiads"));

    expect(olympiads).toEqual([{ id: olympiad.id, name: olympiad.name }]);
  });
});

describe("POST /auth/logout", () => {
  it("ends the session in Supabase and stops the token working at once", async () => {
    const organiser = await f.createOrganiser();
    const organiserApi = as(organiser);

    expectOk(await organiserApi.post("/auth/logout"));

    // The token the request carried is the one revoked
    expect(supabase.auth.admin.signOut).toHaveBeenCalledWith(expect.any(String), "local");
    const [token] = supabase.auth.admin.signOut.mock.calls[0];
    expect(token.length).toBeGreaterThan(0);
  });

  it("still logs out when Supabase can't end the session", async () => {
    const organiser = await f.createOrganiser();
    supabase.auth.admin.signOut.mockResolvedValue({ data: null, error: { message: "network down" } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    expectOk(await as(organiser).post("/auth/logout"));
    expect(warn).toHaveBeenCalledWith("[auth] Supabase could not end the session: network down");
    warn.mockRestore();
  });

  it("tells the browser not to keep responses", async () => {
    const res = await as(await f.createOrganiser()).get("/auth/me");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("DELETE /auth/account", () => {
  it("removes the Supabase login and the person's details, keeping the account row", async () => {
    const organiser = await f.createOrganiser({ email: "thandi@olympiad.test", full_name: "Thandi Mokoena" });

    expectOk(await as(organiser).delete("/auth/account"));

    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith(organiser.id);
    expect(await prisma.users.findUnique({ where: { id: organiser.id } })).toMatchObject({
      deleted_at: expect.any(Date),
      email: `deleted-${organiser.id}@deleted.invalid`,
      full_name: "Deleted user",
    });
  });

  it("frees the email, so the person can register again", async () => {
    const organiser = await f.createOrganiser({ email: "thandi@olympiad.test" });
    expectOk(await as(organiser).delete("/auth/account"));

    const res = await api().post("/auth/register").send({ full_name: "Thandi Mokoena", email: "thandi@olympiad.test", password: PASSWORD, role: "organiser" });
    expect(res.status).toBe(201);
  });

  it("unlinks a student's login from their learner record, which stays with the school", async () => {
    const { school } = await f.createOlympiadWithSchool();
    const { user, entrant } = await f.createStudent({ school });

    expectOk(await as(user).delete("/auth/account"));

    expect(await prisma.entrants.findUnique({ where: { id: entrant.id } })).toMatchObject({ user_id: null, school_id: school.id });
  });

  it("ends an educator's school membership", async () => {
    const { educatorUser } = await f.createOlympiadWithSchool();

    expectOk(await as(educatorUser).delete("/auth/account"));

    const memberships = await prisma.school_memberships.findMany({ where: { user_id: educatorUser.id } });
    expect(memberships.map((m) => m.status)).toEqual(["removed"]);
  });

  it("refuses an organiser whose olympiad is still running, and changes nothing", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser, name: "Maths Olympiad" });
    await f.createRound({ olympiad, state: "results_released" });
    await f.createRound({ olympiad, state: "open" });

    expectError(
      await as(organiser).delete("/auth/account"),
      409,
      "You can’t delete your account while “Maths Olympiad” is still running. Release the results of all its rounds first.",
    );
    expect(supabase.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect((await prisma.users.findUnique({ where: { id: organiser.id } })).deleted_at).toBeNull();
  });

  it("lets an organiser go once every round of their olympiads has released results", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    await f.createRound({ olympiad, state: "results_released" });

    expectOk(await as(organiser).delete("/auth/account"));
    // The finished olympiad stays, for the archive and standings
    expect(await prisma.olympiads.findUnique({ where: { id: olympiad.id } })).not.toBeNull();
  });

  it("keeps the account as it was when Supabase can't delete the login", async () => {
    const organiser = await f.createOrganiser({ email: "thandi@olympiad.test" });
    supabase.auth.admin.deleteUser.mockResolvedValue({ data: null, error: { status: 500, message: "Database error" } });

    expectError(await as(organiser).delete("/auth/account"), 502, "We couldn’t delete your account. Please try again.");
    expect(await prisma.users.findUnique({ where: { id: organiser.id } })).toMatchObject({
      deleted_at: null,
      email: "thandi@olympiad.test",
    });
  });

  it("stops the account's token working afterwards", async () => {
    const organiser = await f.createOrganiser();
    const organiserApi = as(organiser);
    expectOk(await organiserApi.delete("/auth/account"));

    expectError(await organiserApi.get("/auth/me"), 401, "Account not found or deleted");
  });
});
