// Registration, invitations and access control against the real database.
// Supabase Auth and email are the only fakes.
jest.mock("../../src/config/supabase", () => require("./helpers/externalMocks").supabase);
jest.mock("../../src/lib/mailer", () => require("./helpers/externalMocks").mailer);

const prisma = require("../../src/config/database").default;
const authService = require("../../src/services/authService");
const { requireAuth, requireSchoolMembership } = require("../../src/middlewares/auth");
const { supabase, mailer, resetExternalMocks, signInAs } = require("./helpers/externalMocks");
const f = require("./helpers/factories");

const tokenFromEmail = (sendMock) => new URL(sendMock.mock.calls.at(-1)[0].registrationUrl).searchParams.get("token");

const runMiddleware = async (middleware, req) => {
  const next = jest.fn();
  await middleware(req, {}, next);
  return next.mock.calls[0]?.[0];
};

beforeEach(() => {
  resetExternalMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("organiser sign-up", () => {
  it("creates the account with the Supabase user's id", async () => {
    const { user } = await authService.registerOrganiser({
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      password: "Secret123",
    });

    const stored = await prisma.users.findUnique({ where: { email: "thandi@olympiad.test" } });
    const authUserId = (await supabase.auth.admin.createUser.mock.results[0].value).data.user.id;
    expect(stored).toMatchObject({ id: authUserId, auth_provider_id: authUserId, role: "organiser", deleted_at: null });
    expect(user).toEqual({
      id: authUserId,
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      role: "organiser",
      created_at: expect.any(Date),
    });
  });

  it("rejects an email that already has an account without creating a Supabase user", async () => {
    await f.createOrganiser({ email: "taken@olympiad.test" });
    await expect(
      authService.registerOrganiser({ full_name: "X", email: "taken@olympiad.test", password: "Secret123" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
    expect(await prisma.users.count()).toBe(1);
  });
});

describe("the invitation chain: organiser → school → educator → student", () => {
  it("builds a working school from emailed invitation links", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser, name: "Maths Olympiad" });

    // 1. Organiser invites a school; nothing exists for the school yet
    const schoolInvite = await authService.inviteSchool({
      schoolName: "Parktown High",
      contactEmail: "head@parktown.test",
      olympiadId: olympiad.id,
      organiserId: organiser.id,
    });
    expect(await prisma.schools.count()).toBe(0);
    const schoolToken = tokenFromEmail(mailer.sendSchoolInviteEmail);
    expect(schoolInvite.registrationUrl).toBe(`https://olympiad.test/register?token=${schoolToken}`);

    // Only the hash of the emailed token is stored
    const storedInvite = await prisma.invitations.findUnique({ where: { id: schoolInvite.invitation.id } });
    expect(storedInvite.token_hash).not.toBe(schoolToken);
    await expect(authService.validateInvitationToken(schoolToken)).resolves.toMatchObject({
      type: "school",
      school: { name: "Parktown High" },
      olympiad: { id: olympiad.id, name: "Maths Olympiad" },
    });

    // 2. The head registers from the link and becomes the coordinator
    const { user: head } = await authService.registerWithCode({
      full_name: "Head Teacher",
      email: "head@parktown.test",
      password: "Secret123",
      invite_token: schoolToken,
    });
    const school = await prisma.schools.findFirst({ where: { name: "Parktown High" } });
    expect(await prisma.school_registrations.findFirst({ where: { school_id: school.id } })).toMatchObject({
      olympiad_id: olympiad.id,
      status: "approved",
    });
    expect(await prisma.educators.findUnique({ where: { user_id: head.id } })).toMatchObject({ school_id: school.id });
    expect(
      await prisma.school_memberships.findUnique({
        where: { user_id_school_id: { user_id: head.id, school_id: school.id } },
      }),
    ).toMatchObject({ role: "coordinator", status: "active" });
    expect(await prisma.invitations.findUnique({ where: { id: storedInvite.id } })).toMatchObject({
      used_by_id: head.id,
      accepted_at: expect.any(Date),
    });

    // The link can't be used twice
    await expect(authService.validateInvitationToken(schoolToken)).rejects.toMatchObject({ statusCode: 404 });

    // 3. The coordinator invites a teacher, who registers with the code
    const teacherInvite = await authService.inviteEducator({
      email: "teacher@parktown.test",
      schoolId: school.id,
      olympiadId: olympiad.id,
      createdById: head.id,
    });
    const { user: teacher } = await authService.registerWithCode({
      full_name: "Class Teacher",
      email: "teacher@parktown.test",
      password: "Secret123",
      code: teacherInvite.code,
    });
    expect(
      await prisma.school_memberships.findUnique({
        where: { user_id_school_id: { user_id: teacher.id, school_id: school.id } },
      }),
    ).toMatchObject({ role: "educator" });

    // 4. The teacher invites a learner, who registers from their link
    await authService.inviteStudent({
      email: "learner@parktown.test",
      schoolId: school.id,
      olympiadId: olympiad.id,
      createdById: teacher.id,
    });
    const { user: learner } = await authService.registerWithCode({
      full_name: "Ayanda Khumalo",
      email: "learner@parktown.test",
      password: "Secret123",
      invite_token: tokenFromEmail(mailer.sendStudentInviteEmail),
    });
    expect(await prisma.entrants.findUnique({ where: { user_id: learner.id } })).toMatchObject({
      school_id: school.id,
      full_name: "Ayanda Khumalo",
    });

    // The school's invitation list reflects what happened
    expect(await authService.listStudentInvitations(school.id)).toEqual([
      expect.objectContaining({ email: "learner@parktown.test", olympiadName: "Maths Olympiad", status: "accepted" }),
    ]);
    expect(await prisma.users.count()).toBe(4);
  });
});

describe("registering with an invitation", () => {
  const register = (overrides = {}) =>
    authService.registerWithCode({
      full_name: "New Person",
      email: "new@school.test",
      password: "Secret123",
      ...overrides,
    });

  it("links a student to an entrant the teacher already registered", async () => {
    const school = await f.createSchool();
    const waiting = await f.createEntrant({ school, full_name: "Placeholder name" });
    const invite = await f.createInvitation({ type: "student", school_id: school.id });

    const { user } = await register({ code: invite.code, full_name: "Real Name" });

    expect(await prisma.entrants.count()).toBe(1);
    expect(await prisma.entrants.findUnique({ where: { id: waiting.id } })).toMatchObject({
      user_id: user.id,
      full_name: "Real Name",
    });
  });

  it("rejects an expired invitation and creates nothing", async () => {
    const school = await f.createSchool();
    const invite = await f.createInvitation({ school_id: school.id, expires_at: f.hoursFromNow(-1) });

    await expect(register({ code: invite.code })).rejects.toMatchObject({ message: "Invitation expired" });
    expect(await prisma.users.count()).toBe(0);
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects an invitation that was issued to someone else's email", async () => {
    const school = await f.createSchool();
    const invite = await f.createInvitation({ school_id: school.id, email: "intended@school.test" });
    await expect(register({ code: invite.code })).rejects.toMatchObject({
      message: "This invitation was issued for a different email",
    });
  });

  it("rolls everything back, including the Supabase user, if a step fails part-way", async () => {
    // A pending school invitation with no olympiad: the school is created
    // inside the transaction, then registering it for the olympiad fails.
    const invite = await f.createInvitation({ type: "school", school_name: "Half-made School", olympiad_id: null });

    await expect(register({ code: invite.code })).rejects.toThrow();

    expect(await prisma.schools.count()).toBe(0);
    expect(await prisma.users.count()).toBe(0);
    expect((await prisma.invitations.findUnique({ where: { id: invite.id } })).used_by_id).toBeNull();
    const createdAuthId = (await supabase.auth.admin.createUser.mock.results[0].value).data.user.id;
    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith(createdAuthId);
  });

  it("validates a typed invitation code without using it up", async () => {
    const school = await f.createSchool({ name: "Northview" });
    const invite = await f.createInvitation({ type: "educator", school_id: school.id });

    await expect(authService.validateInvitationCode(invite.code)).resolves.toMatchObject({
      valid: true,
      type: "educator",
      school: { id: school.id, name: "Northview" },
    });
    expect((await prisma.invitations.findUnique({ where: { id: invite.id } })).used_by_id).toBeNull();
  });
});

describe("educator invitation tools", () => {
  it("only lets a school invite for olympiads it is registered in", async () => {
    const olympiad = await f.createOlympiad();
    const { user, school } = await f.createEducator();

    await expect(
      authService.inviteStudent({ email: "l@s.test", schoolId: school.id, olympiadId: olympiad.id, createdById: user.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.invitations.count()).toBe(0);
  });

  it("generates a batch of unique 30-day student codes", async () => {
    const { olympiad, school, educatorUser } = await f.createOlympiadWithSchool();

    const codes = await authService.generateStudentCodes({
      count: 25,
      schoolId: school.id,
      olympiadId: olympiad.id,
      createdById: educatorUser.id,
    });

    const stored = await prisma.invitations.findMany({ where: { school_id: school.id } });
    expect(codes).toHaveLength(25);
    expect(new Set(stored.map((i) => i.code)).size).toBe(25);
    expect(new Set(stored.map((i) => i.token_hash)).size).toBe(25);
    const days = (stored[0].expires_at - stored[0].created_at) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("lists only olympiads the school's registration is approved for", async () => {
    const { user, school } = await f.createEducator();
    const approved = await f.createOlympiad({ name: "Approved" });
    const pending = await f.createOlympiad({ name: "Pending" });
    await f.registerSchool(school, approved);
    await f.registerSchool(school, pending, { status: "pending" });

    const olympiads = await authService.listEducatorOlympiads(school.id);
    expect(olympiads).toEqual([{ id: approved.id, name: "Approved" }]);
    expect(user).toBeDefined();
  });
});

describe("request authentication", () => {
  const bearer = (extra = {}) => ({ headers: { authorization: "Bearer token" }, ...extra });

  it("loads the signed-in educator's school from the database", async () => {
    const { user, school, educator } = await f.createEducator();
    signInAs(user);

    const req = bearer();
    expect(await runMiddleware(requireAuth, req)).toBeUndefined();
    expect(req.user).toMatchObject({
      userId: user.id,
      role: "educator",
      schoolId: school.id,
      educator: { id: educator.id, school_id: school.id },
    });
  });

  it("loads a student's entrant record", async () => {
    const school = await f.createSchool();
    const { user, entrant } = await f.createStudent({ school });
    signInAs(user);

    const req = bearer();
    await runMiddleware(requireAuth, req);
    expect(req.user).toMatchObject({ role: "student", schoolId: school.id, entrant: { id: entrant.id } });
  });

  it("locks out a deleted account even with a valid Supabase session", async () => {
    const organiser = await f.createOrganiser();
    await authService.deleteAccount(organiser.id);

    expect(supabase.auth.admin.deleteUser).toHaveBeenCalledWith(organiser.id);
    expect((await prisma.users.findUnique({ where: { id: organiser.id } })).deleted_at).toBeInstanceOf(Date);

    signInAs(organiser);
    expect(await runMiddleware(requireAuth, bearer())).toMatchObject({
      statusCode: 401,
      message: "Account not found or deleted",
    });
  });

  it("rejects a Supabase user that has no account here", async () => {
    signInAs({ id: "00000000-0000-4000-8000-000000000000", email: "ghost@test" });
    expect(await runMiddleware(requireAuth, bearer())).toMatchObject({ statusCode: 401 });
  });

  it("checks school roles against real memberships", async () => {
    const school = await f.createSchool();
    const coordinator = await f.createEducator({ school, membershipRole: "coordinator" });
    const teacher = await f.createEducator({ school, membershipRole: "educator" });
    const removed = await f.createEducator({ school, membershipRole: "coordinator" });
    await prisma.school_memberships.update({ where: { id: removed.membership.id }, data: { status: "removed" } });

    const coordinatorOnly = requireSchoolMembership("coordinator");
    const asUser = (u) => ({ user: { userId: u.user.id, schoolId: school.id }, params: {} });

    const coordinatorReq = asUser(coordinator);
    expect(await runMiddleware(coordinatorOnly, coordinatorReq)).toBeUndefined();
    expect(coordinatorReq.schoolMembership).toMatchObject({ role: "coordinator" });
    expect(await runMiddleware(coordinatorOnly, asUser(teacher))).toMatchObject({ statusCode: 403 });
    expect(await runMiddleware(coordinatorOnly, asUser(removed))).toMatchObject({ statusCode: 403 });
    expect(await runMiddleware(requireSchoolMembership("coordinator", "educator"), asUser(teacher))).toBeUndefined();
  });

  it("won't let an educator act on a different school", async () => {
    const mine = await f.createEducator();
    const otherSchool = await f.createSchool();
    const req = { user: { userId: mine.user.id, schoolId: mine.school.id }, params: { schoolId: otherSchool.id } };
    expect(await runMiddleware(requireSchoolMembership(), req)).toMatchObject({ statusCode: 403 });
  });
});
