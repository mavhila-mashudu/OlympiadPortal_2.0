// /auth: registration, invitation codes and links, the current user, account
// deletion, and the invitation endpoints for organisers and educators.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { supabase, mailer } = require("../integration/helpers/externalMocks");
const { hashInviteToken } = require("../../src/utils/invitations");
const { api, as, expectError, expectOk } = require("./helpers/api");

const PASSWORD = "Secret123";

// An olympiad with one registered school whose coordinator is `educatorUser`
const schoolWorld = () => f.createOlympiadWithSchool();

// Invites a school through the API and returns the code and emailed token
const inviteSchool = async (organiser, olympiad, overrides = {}) => {
  const data = expectOk(
    await as(organiser)
      .post("/auth/invite-school")
      .send({ school_name: "Parktown High", contact_email: "head@parktown.test", olympiad_id: olympiad.id, ...overrides }),
    201,
  );
  return { ...data, token: new URL(data.registrationUrl).searchParams.get("token") };
};

describe("POST /auth/register/organiser", () => {
  const body = (overrides = {}) => ({ full_name: "Thandi Mokoena", email: "thandi@olympiad.test", password: PASSWORD, ...overrides });

  it("creates the Supabase login and the organiser, returning only safe fields", async () => {
    const res = await api().post("/auth/register/organiser").send(body());

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
    expect(await prisma.users.findUnique({ where: { id: user.id } })).toMatchObject({ role: "organiser", auth_provider_id: user.id });
  });

  it("keeps the address the user typed (only lowercased), so they can log in with it", async () => {
    const res = await api().post("/auth/register/organiser").send(body({ email: "  First.Last+Olympiad@Gmail.com " }));
    expect(expectOk(res, 201).user.email).toBe("first.last+olympiad@gmail.com");
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "first.last+olympiad@gmail.com" }));
  });

  it.each([
    ["a missing name", { full_name: "  " }, "Full name is required"],
    ["an invalid email", { email: "not-an-email" }, "Valid email required"],
    ["a short password", { password: "Ab1" }, "Min 8 characters"],
    ["a password without an uppercase letter", { password: "secret123" }, "Needs uppercase"],
    ["a password without a number", { password: "SecretPass" }, "Needs a number"],
  ])("responds 422 for %s", async (_label, overrides, message) => {
    expectError(await api().post("/auth/register/organiser").send(body(overrides)), 422, message);
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("reports every validation problem at once", async () => {
    const res = await api().post("/auth/register/organiser").send({});
    expect(res.status).toBe(422);
    expect(res.body.error.split(", ")).toEqual(
      expect.arrayContaining(["Full name is required", "Valid email required", "Min 8 characters", "Needs uppercase", "Needs a number"]),
    );
  });

  it("responds 409 for an email that is already registered", async () => {
    await f.createOrganiser({ email: "thandi@olympiad.test" });
    expectError(await api().post("/auth/register/organiser").send(body()), 409, "Email already registered");
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("responds 400 with Supabase's reason when it refuses the account, creating nothing", async () => {
    supabase.auth.admin.createUser.mockResolvedValueOnce({ data: null, error: { message: "Password is known to be weak" } });
    expectError(await api().post("/auth/register/organiser").send(body()), 400, "Password is known to be weak");
    expect(await prisma.users.count()).toBe(0);
  });
});

describe("POST /auth/register (invited users)", () => {
  const body = (overrides = {}) => ({ full_name: "Sipho Dlamini", email: "head@parktown.test", password: PASSWORD, ...overrides });

  it("registers a school's coordinator from the emailed link, creating and registering the school", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { token, invitation } = await inviteSchool(organiser, olympiad);

    const { user } = expectOk(await api().post("/auth/register").send(body({ invite_token: token })), 201);

    expect(user).toMatchObject({ role: "educator", email: "head@parktown.test" });
    const educator = await prisma.educators.findUnique({ where: { user_id: user.id }, include: { schools: true } });
    expect(educator.schools.name).toBe("Parktown High");
    expect(await prisma.school_memberships.findFirst({ where: { user_id: user.id } })).toMatchObject({ role: "coordinator", status: "active" });
    expect(await prisma.school_registrations.findFirst({ where: { school_id: educator.school_id } })).toMatchObject({
      olympiad_id: olympiad.id,
      status: "approved",
    });
    expect(await prisma.invitations.findUnique({ where: { id: invitation.id } })).toMatchObject({ used_by_id: user.id });
  });

  it("registers an invited educator with the typed code", async () => {
    const { olympiad, educatorUser, school } = await schoolWorld();
    const { code } = expectOk(
      await as(educatorUser).post("/auth/invite-educator").send({ email: "colleague@parktown.test", olympiad_id: olympiad.id }),
      201,
    );

    const { user } = expectOk(await api().post("/auth/register").send(body({ email: "colleague@parktown.test", code })), 201);

    expect(user.role).toBe("educator");
    expect(await prisma.educators.findUnique({ where: { user_id: user.id } })).toMatchObject({ school_id: school.id });
    expect(await prisma.school_memberships.findFirst({ where: { user_id: user.id } })).toMatchObject({ role: "educator" });
  });

  it("registers a student with a generated code and links them to an unclaimed learner record", async () => {
    const { olympiad, educatorUser, school } = await schoolWorld();
    const learner = await f.createEntrant({ school, full_name: "A. Khumalo" });
    const { codes } = expectOk(
      await as(educatorUser).post("/auth/generate-student-codes").send({ count: 1, olympiad_id: olympiad.id }),
      201,
    );

    const res = await api().post("/auth/register").send(body({ full_name: "Ayanda Khumalo", email: "ayanda@parktown.test", code: codes[0].code }));

    const { user } = expectOk(res, 201);
    expect(user.role).toBe("student");
    expect(await prisma.entrants.findUnique({ where: { id: learner.id } })).toMatchObject({ user_id: user.id, full_name: "Ayanda Khumalo" });
  });

  it("responds 422 without a code or invitation link", async () => {
    expectError(await api().post("/auth/register").send(body()), 422, "Invitation link or code required");
  });

  it("responds 400 for an unknown code or link", async () => {
    expectError(await api().post("/auth/register").send(body({ code: "SCH-NOPE" })), 400, "Invalid invitation code");
    expectError(await api().post("/auth/register").send(body({ invite_token: "forged" })), 400, "Invalid invitation code");
  });

  it("responds 409 when the invitation was already used", async () => {
    const organiser = await f.createOrganiser();
    const { token } = await inviteSchool(organiser, await f.createOlympiad({ organiser }));
    expectOk(await api().post("/auth/register").send(body({ invite_token: token })), 201);

    const res = await api().post("/auth/register").send(body({ email: "someone.else@parktown.test", invite_token: token }));
    expectError(res, 409, "Invitation already used");
  });

  it("responds 400 when the invitation has expired", async () => {
    const school = await f.createSchool();
    const invitation = await f.createInvitation({ school_id: school.id, expires_at: f.hoursFromNow(-1) });
    expectError(await api().post("/auth/register").send(body({ code: invitation.code })), 400, "Invitation expired");
  });

  it("responds 400 when someone else uses an invitation issued to an email address", async () => {
    const organiser = await f.createOrganiser();
    const { code } = await inviteSchool(organiser, await f.createOlympiad({ organiser }));
    const res = await api().post("/auth/register").send(body({ email: "intruder@elsewhere.test", code }));
    expectError(res, 400, "This invitation was issued for a different email");
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("matches the invited email regardless of letter case", async () => {
    const organiser = await f.createOrganiser();
    const { code } = await inviteSchool(organiser, await f.createOlympiad({ organiser }), { contact_email: "Head@Parktown.test" });
    expectOk(await api().post("/auth/register").send(body({ email: "HEAD@parktown.test", code })), 201);
  });

  it("responds 409 when the email already has an account", async () => {
    const school = await f.createSchool();
    const invitation = await f.createInvitation({ school_id: school.id });
    await f.createUser("student", { email: "taken@parktown.test" });
    const res = await api().post("/auth/register").send(body({ email: "taken@parktown.test", code: invitation.code }));
    expectError(res, 409, "Email already registered");
  });
});

describe("GET /auth/validate-code/:code", () => {
  it("describes a valid invitation", async () => {
    const { olympiad, school } = await schoolWorld();
    const invitation = await f.createInvitation({ school_id: school.id, olympiad_id: olympiad.id, email: "learner@parktown.test" });

    expect(expectOk(await api().get(`/auth/validate-code/${invitation.code}`))).toEqual({
      valid: true,
      type: "student",
      email: "learner@parktown.test",
      school: { id: school.id, name: school.name },
      olympiad: { id: olympiad.id, name: olympiad.name },
    });
  });

  it("responds 404 for an unknown code", async () => {
    expectError(await api().get("/auth/validate-code/STU-0000-0000"), 404, "Invalid invitation code");
  });

  it("responds 400 for a used or expired code", async () => {
    const user = await f.createUser("student");
    const used = await f.createInvitation({ used_by_id: user.id });
    const expired = await f.createInvitation({ expires_at: f.hoursFromNow(-1) });
    expectError(await api().get(`/auth/validate-code/${used.code}`), 400, "Invitation already used");
    expectError(await api().get(`/auth/validate-code/${expired.code}`), 400, "Invitation expired");
  });
});

describe("GET /auth/validate-invite/:token", () => {
  it("describes a pending school invitation by its link token", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { token } = await inviteSchool(organiser, olympiad);

    expect(expectOk(await api().get(`/auth/validate-invite/${token}`))).toEqual({
      valid: true,
      type: "school",
      email: "head@parktown.test",
      school: { name: "Parktown High" },
      olympiad: { id: olympiad.id, name: olympiad.name },
    });
  });

  it("responds 404 for an unknown, used or expired link without saying which", async () => {
    const message = "This invitation link is invalid, expired, or has already been used";
    const user = await f.createUser("student");
    await f.createInvitation({ token_hash: hashInviteToken("used-token"), used_by_id: user.id });
    await f.createInvitation({ token_hash: hashInviteToken("old-token"), expires_at: f.hoursFromNow(-1) });

    for (const token of ["unknown-token", "used-token", "old-token"]) {
      expectError(await api().get(`/auth/validate-invite/${token}`), 404, message);
    }
  });
});

describe("GET /auth/me", () => {
  it("returns an educator with their active school memberships only", async () => {
    const { educatorUser, school } = await schoolWorld();
    const oldSchool = await f.createSchool();
    await prisma.school_memberships.create({ data: { user_id: educatorUser.id, school_id: oldSchool.id, role: "educator", status: "removed" } });

    const { user } = expectOk(await as(educatorUser).get("/auth/me"));

    expect(user).toMatchObject({
      id: educatorUser.id,
      role: "educator",
      school_memberships: [{ school_id: school.id, role: "coordinator", schools: { name: school.name } }],
      educators: { school_id: school.id, schools: expect.objectContaining({ name: school.name }) },
      entrants: null,
    });
    expect(user).not.toHaveProperty("auth_provider_id");
  });

  it("returns a student with their school", async () => {
    const school = await f.createSchool({ name: "Northview College" });
    const { user: student } = await f.createStudent({ school });
    const { user } = expectOk(await as(student).get("/auth/me"));
    expect(user).toMatchObject({ role: "student", educators: null, entrants: { school_id: school.id, schools: { name: "Northview College" } } });
  });
});

describe("DELETE /auth/account", () => {
  it("removes the Supabase login, soft-deletes the account and locks it out", async () => {
    const organiser = await f.createOrganiser();

    expect(expectOk(await as(organiser).delete("/auth/account"))).toEqual({ message: "Account deleted" });

    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith(organiser.id);
    expect((await prisma.users.findUnique({ where: { id: organiser.id } })).deleted_at).toBeInstanceOf(Date);
    expectError(await as(organiser).get("/auth/me"), 401, "Account not found or deleted");
  });
});

describe("POST /auth/invite-school", () => {
  it("creates a coordinator invitation, emails the link and returns the code", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser, name: "Maths Olympiad 2026" });

    const data = await inviteSchool(organiser, olympiad);

    expect(data).toMatchObject({
      code: expect.stringMatching(/^SCH-[A-Z2-9]{4}$/),
      registrationUrl: expect.stringMatching(/^https:\/\/olympiad\.test\/register\?token=[\w-]{43}$/),
      emailDelivered: true,
      invitation: expect.objectContaining({ type: "school", intended_school_role: "coordinator", olympiad_id: olympiad.id }),
    });
    expect(mailer.sendSchoolInviteEmail).toHaveBeenCalledWith({
      to: "head@parktown.test",
      schoolName: "Parktown High",
      olympiadName: "Maths Olympiad 2026",
      inviteCode: data.code,
      registrationUrl: data.registrationUrl,
    });
    // Only the hash of the link token is stored, and it isn't sent back
    expect(await prisma.invitations.findFirst({ where: { token_hash: hashInviteToken(data.token) } })).not.toBeNull();
    expect(data.invitation).not.toHaveProperty("token_hash");
  });

  it("reports when the email couldn't be delivered, still returning the code", async () => {
    mailer.sendSchoolInviteEmail.mockResolvedValueOnce({ delivered: false });
    const organiser = await f.createOrganiser();
    const data = await inviteSchool(organiser, await f.createOlympiad({ organiser }));
    expect(data).toMatchObject({ emailDelivered: false, code: expect.any(String) });
  });

  it("responds 404 for another organiser's olympiad", async () => {
    const olympiad = await f.createOlympiad();
    const res = await as(await f.createOrganiser())
      .post("/auth/invite-school")
      .send({ school_name: "S", contact_email: "a@b.test", olympiad_id: olympiad.id });
    expectError(res, 404, "Olympiad not found");
    expect(mailer.sendSchoolInviteEmail).not.toHaveBeenCalled();
  });

  it.each([
    [{ school_name: "" }, "School name required"],
    [{ contact_email: "nope" }, "Valid email required"],
    [{ olympiad_id: "" }, "Olympiad ID required"],
  ])("responds 422 for %o", async (overrides, message) => {
    const organiser = await f.createOrganiser();
    const res = await as(organiser)
      .post("/auth/invite-school")
      .send({ school_name: "S", contact_email: "a@b.test", olympiad_id: (await f.createOlympiad({ organiser })).id, ...overrides });
    expectError(res, 422, message);
  });
});

describe("educator invitation endpoints", () => {
  // An educator whose membership of their school has been removed
  const removedEducator = async () => {
    const world = await schoolWorld();
    await prisma.school_memberships.updateMany({ where: { user_id: world.educatorUser.id }, data: { status: "removed" } });
    return world;
  };
  const NO_PERMISSION = "You do not have permission to manage this school";

  describe("GET /auth/educator-olympiads", () => {
    it("lists the olympiads the school is approved for", async () => {
      const { olympiad, school, educatorUser } = await schoolWorld();
      const pending = await f.createOlympiad();
      await f.registerSchool(school, pending, { status: "pending" });

      expect(expectOk(await as(educatorUser).get("/auth/educator-olympiads"))).toEqual({
        olympiads: [{ id: olympiad.id, name: olympiad.name }],
      });
    });

    it("responds 403 once the educator's membership is removed", async () => {
      const { educatorUser } = await removedEducator();
      expectError(await as(educatorUser).get("/auth/educator-olympiads"), 403, NO_PERMISSION);
    });

    it("responds 403 for an educator account with no school", async () => {
      const educator = await f.createUser("educator");
      expectError(await as(educator).get("/auth/educator-olympiads"), 403, "No school membership found");
    });
  });

  describe("GET /auth/student-invitations", () => {
    it("lists the school's student invitations with their status", async () => {
      const { olympiad, school, educatorUser } = await schoolWorld();
      const student = await f.createUser("student");
      await f.createInvitation({ school_id: school.id, olympiad_id: olympiad.id, email: "pending@s.test" });
      await f.createInvitation({ school_id: school.id, olympiad_id: olympiad.id, email: "used@s.test", used_by_id: student.id });
      await f.createInvitation({ school_id: school.id, email: "old@s.test", expires_at: f.hoursFromNow(-1) });
      await f.createInvitation({ school_id: (await f.createSchool()).id, email: "other-school@s.test" });

      const { invitations } = expectOk(await as(educatorUser).get("/auth/student-invitations"));

      expect(invitations.map((i) => [i.email, i.status, i.olympiadName]).sort()).toEqual([
        ["old@s.test", "expired", "Olympiad"],
        ["pending@s.test", "pending", olympiad.name],
        ["used@s.test", "accepted", olympiad.name],
      ]);
    });

    it("responds 403 once the educator's membership is removed", async () => {
      const { educatorUser } = await removedEducator();
      expectError(await as(educatorUser).get("/auth/student-invitations"), 403, NO_PERMISSION);
    });
  });

  describe("POST /auth/invite-student", () => {
    it("creates an emailed student invitation for the educator's school", async () => {
      const { olympiad, school, educatorUser } = await schoolWorld();

      const data = expectOk(
        await as(educatorUser).post("/auth/invite-student").send({ email: " Learner@Parktown.test ", olympiad_id: olympiad.id }),
        201,
      );

      expect(data).toMatchObject({
        code: expect.stringMatching(/^STU-[0-9A-F]{4}-[0-9A-F]{4}$/),
        emailDelivered: true,
        invitation: expect.objectContaining({ type: "student", school_id: school.id, email: "learner@parktown.test" }),
      });
      expect(mailer.sendStudentInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "learner@parktown.test", inviteCode: data.code }));
      expect(data.invitation).not.toHaveProperty("token_hash");
      expect(data.invitation).not.toHaveProperty("inviteToken");
    });

    it("responds 404 when the school isn't registered for the olympiad", async () => {
      const { educatorUser } = await schoolWorld();
      const other = await f.createOlympiad();
      const res = await as(educatorUser).post("/auth/invite-student").send({ email: "l@s.test", olympiad_id: other.id });
      expectError(res, 404, "Your school is not registered for this olympiad");
    });

    it("responds 422 for an invalid email or missing olympiad", async () => {
      const { educatorUser } = await schoolWorld();
      expectError(await as(educatorUser).post("/auth/invite-student").send({ email: "nope", olympiad_id: "x" }), 422, "Valid student email required");
      expectError(await as(educatorUser).post("/auth/invite-student").send({ email: "l@s.test" }), 422, "Olympiad ID required");
    });

    it("responds 403 once the educator's membership is removed", async () => {
      const { olympiad, educatorUser } = await removedEducator();
      const res = await as(educatorUser).post("/auth/invite-student").send({ email: "l@s.test", olympiad_id: olympiad.id });
      expectError(res, 403, NO_PERMISSION);
    });
  });

  describe("POST /auth/invite-educator", () => {
    it("lets a coordinator invite a colleague", async () => {
      const { olympiad, school, educatorUser } = await schoolWorld();
      const data = expectOk(
        await as(educatorUser).post("/auth/invite-educator").send({ email: "colleague@parktown.test", olympiad_id: olympiad.id }),
        201,
      );
      expect(data).toMatchObject({
        code: expect.stringMatching(/^EDU-/),
        invitation: expect.objectContaining({ type: "educator", intended_school_role: "educator", school_id: school.id }),
      });
      expect(mailer.sendEducatorInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "colleague@parktown.test" }));
      expect(data.invitation).not.toHaveProperty("token_hash");
    });

    it("responds 403 for an educator who isn't the coordinator", async () => {
      const { olympiad, school } = await schoolWorld();
      const { user } = await f.createEducator({ school, membershipRole: "educator" });
      const res = await as(user).post("/auth/invite-educator").send({ email: "c@s.test", olympiad_id: olympiad.id });
      expectError(res, 403, NO_PERMISSION);
    });

    it("responds 404 when the school isn't registered for the olympiad", async () => {
      const { educatorUser } = await schoolWorld();
      const res = await as(educatorUser).post("/auth/invite-educator").send({ email: "c@s.test", olympiad_id: (await f.createOlympiad()).id });
      expectError(res, 404, "School is not registered for this olympiad");
    });

    it("responds 422 for an invalid email", async () => {
      const { olympiad, educatorUser } = await schoolWorld();
      expectError(await as(educatorUser).post("/auth/invite-educator").send({ email: "x", olympiad_id: olympiad.id }), 422, "Valid email required");
    });
  });

  describe("POST /auth/generate-student-codes", () => {
    it("creates the requested number of unique student codes", async () => {
      const { olympiad, school, educatorUser } = await schoolWorld();

      const { codes } = expectOk(await as(educatorUser).post("/auth/generate-student-codes").send({ count: 3, olympiad_id: olympiad.id }), 201);

      expect(codes).toHaveLength(3);
      expect(new Set(codes.map((c) => c.code)).size).toBe(3);
      expect(await prisma.invitations.count({ where: { school_id: school.id, olympiad_id: olympiad.id, type: "student" } })).toBe(3);
    });

    it.each([0, 201, "lots"])("responds 422 for a count of %p", async (count) => {
      const { olympiad, educatorUser } = await schoolWorld();
      expectError(await as(educatorUser).post("/auth/generate-student-codes").send({ count, olympiad_id: olympiad.id }), 422, "Count 1-200");
    });

    it("responds 404 when the school isn't registered for the olympiad", async () => {
      const { educatorUser } = await schoolWorld();
      const res = await as(educatorUser).post("/auth/generate-student-codes").send({ count: 1, olympiad_id: (await f.createOlympiad()).id });
      expectError(res, 404, "School is not registered for this olympiad");
    });

    it("responds 403 once the educator's membership is removed", async () => {
      const { olympiad, educatorUser } = await removedEducator();
      const res = await as(educatorUser).post("/auth/generate-student-codes").send({ count: 1, olympiad_id: olympiad.id });
      expectError(res, 403, NO_PERMISSION);
      expect(await prisma.invitations.count()).toBe(0);
    });
  });
});
