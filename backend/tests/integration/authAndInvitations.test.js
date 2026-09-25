// Open registration, in-app invitations and access control against the real
// database. Supabase Auth is the only fake.
jest.mock("../../src/config/supabase", () => require("./helpers/externalMocks").supabase);

const prisma = require("../../src/config/database").default;
const authService = require("../../src/services/authService");
const inviteService = require("../../src/services/inviteService");
const { requireAuth, requireSchoolMembership } = require("../../src/middlewares/auth");
const { supabase, resetExternalMocks, signInAs } = require("./helpers/externalMocks");
const f = require("./helpers/factories");

const runMiddleware = async (middleware, req) => {
  const next = jest.fn();
  await middleware(req, {}, next);
  return next.mock.calls[0]?.[0];
};

const signUp = (overrides) =>
  authService.register({
    full_name: "Thandi Mokoena",
    email: "thandi@olympiad.test",
    password: "Secret123",
    role: "organiser",
    ...overrides,
  });

beforeEach(() => {
  resetExternalMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("organiser sign-up", () => {
  it("creates the account with the Supabase user's id", async () => {
    const { user } = await signUp();

    const stored = await prisma.users.findUnique({ where: { email: "thandi@olympiad.test" } });
    const authUserId = (await supabase.auth.admin.createUser.mock.results[0].value).data.user.id;
    expect(stored).toMatchObject({
      id: authUserId,
      auth_provider_id: authUserId,
      role: "organiser",
      deleted_at: null,
    });
    expect(user).toEqual({
      id: authUserId,
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      role: "organiser",
      created_at: expect.any(Date),
    });
  });

  it("refuses an address that is already taken", async () => {
    await signUp();
    await expect(signUp({ full_name: "Someone Else" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("educator sign-up without an invitation", () => {
  it("brings a new school onto the platform and makes the first educator its coordinator", async () => {
    const { user } = await signUp({ role: "educator", school_name: "Parktown Boys High" });

    const educator = await prisma.educators.findUnique({ where: { user_id: user.id } });
    const school = await prisma.schools.findUnique({ where: { id: educator.school_id } });
    expect(school.name).toBe("Parktown Boys High");
    expect(
      await prisma.school_memberships.findUnique({
        where: { user_id_school_id: { user_id: user.id, school_id: school.id } },
      }),
    ).toMatchObject({ role: "coordinator", status: "active" });
  });

  it("joins a school that already has a coordinator as an ordinary member", async () => {
    const { school } = await f.createEducator({ membershipRole: "coordinator" });

    const { user } = await signUp({ role: "educator", email: "second@school.test", school_id: school.id });

    expect(
      await prisma.school_memberships.findUnique({
        where: { user_id_school_id: { user_id: user.id, school_id: school.id } },
      }),
    ).toMatchObject({ role: "educator" });
  });
});

describe("student sign-up without an invitation", () => {
  it("creates an entrant at the chosen school", async () => {
    const school = await f.createSchool();

    const { user } = await signUp({ role: "student", email: "learner@school.test", school_id: school.id });

    expect(await prisma.entrants.findUnique({ where: { user_id: user.id } })).toMatchObject({
      school_id: school.id,
      full_name: "Thandi Mokoena",
    });
  });

  it("will not join a school that does not exist", async () => {
    await expect(
      signUp({ role: "student", school_id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("leaves no orphaned Supabase login behind when the database write fails", async () => {
    const school = await f.createSchool();
    jest.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db down"));

    await expect(signUp({ role: "student", school_id: school.id })).rejects.toThrow("db down");

    expect(supabase.auth.admin.deleteUser).toHaveBeenCalled();
    expect(await prisma.users.findUnique({ where: { email: "thandi@olympiad.test" } })).toBeNull();
    prisma.$transaction.mockRestore();
  });
});

describe("the invitation chain: organiser -> educator -> student", () => {
  it("registers the school only once the educator accepts", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { user: educatorUser, school } = await f.createEducator();

    const invite = await inviteService.createInvite({
      olympiadId: olympiad.id,
      inviteeId: educatorUser.id,
      inviterId: organiser.id,
      inviterRole: "organiser",
    });

    // Pending: the educator sees it, but the school is not in the olympiad yet
    expect((await inviteService.listMyInvites(educatorUser.id)).map((i) => i.id)).toEqual([invite.id]);
    expect(await authService.listEducatorOlympiads(school.id)).toEqual([]);

    await inviteService.respondToInvite({ inviteId: invite.id, userId: educatorUser.id, accept: true });

    expect(await authService.listEducatorOlympiads(school.id)).toEqual([
      { id: olympiad.id, name: olympiad.name },
    ]);
  });

  it("lets the educator pass the olympiad on to a student, who is enrolled on accepting", async () => {
    const { olympiad, school, educatorUser, educator } = await f.createOlympiadWithSchool();
    const round = await f.createRound({ olympiad, state: "open" });
    const { user: studentUser, entrant } = await f.createStudent({ school });

    const invite = await inviteService.createInvite({
      olympiadId: olympiad.id,
      inviteeId: studentUser.id,
      inviterId: educatorUser.id,
      inviterRole: "educator",
    });

    expect(await prisma.entrant_registrations.count({ where: { entrant_id: entrant.id } })).toBe(0);

    await inviteService.respondToInvite({ inviteId: invite.id, userId: studentUser.id, accept: true });

    expect(await prisma.entrant_registrations.findFirst({ where: { entrant_id: entrant.id } })).toMatchObject({
      round_id: round.id,
      registered_by: educator.id,
      status: "registered",
    });
  });

  it("changes nothing when the invitation is rejected", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { user: educatorUser, school } = await f.createEducator();

    const invite = await inviteService.createInvite({
      olympiadId: olympiad.id,
      inviteeId: educatorUser.id,
      inviterId: organiser.id,
      inviterRole: "organiser",
    });
    const answered = await inviteService.respondToInvite({
      inviteId: invite.id,
      userId: educatorUser.id,
      accept: false,
    });

    expect(answered.status).toBe("rejected");
    expect(await authService.listEducatorOlympiads(school.id)).toEqual([]);
  });

  it("will not let someone answer an invitation that is not theirs", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { user: educatorUser } = await f.createEducator();
    const intruder = (await f.createEducator()).user;

    const invite = await inviteService.createInvite({
      olympiadId: olympiad.id,
      inviteeId: educatorUser.id,
      inviterId: organiser.id,
      inviterRole: "organiser",
    });

    await expect(
      inviteService.respondToInvite({ inviteId: invite.id, userId: intruder.id, accept: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("will not answer the same invitation twice", async () => {
    const organiser = await f.createOrganiser();
    const olympiad = await f.createOlympiad({ organiser });
    const { user: educatorUser } = await f.createEducator();

    const invite = await inviteService.createInvite({
      olympiadId: olympiad.id,
      inviteeId: educatorUser.id,
      inviterId: organiser.id,
      inviterRole: "organiser",
    });
    await inviteService.respondToInvite({ inviteId: invite.id, userId: educatorUser.id, accept: true });

    await expect(
      inviteService.respondToInvite({ inviteId: invite.id, userId: educatorUser.id, accept: false }),
    ).rejects.toMatchObject({ statusCode: 400 });
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
