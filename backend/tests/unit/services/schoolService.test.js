jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const { listSchools } = require("../../../src/services/schoolService");

const school = (id, name, overrides = {}) => ({
  id,
  name,
  address: `${name} Road`,
  _count: { entrants: 12 },
  educators: [{ users: { full_name: "Ms Naidoo", email: "naidoo@school.test" } }],
  ...overrides,
});

const invite = (id, status, schoolRow, email = null) => ({
  id,
  status,
  school_id: schoolRow?.id ?? null,
  schools: schoolRow,
  invitee: email ? { full_name: "Head Teacher", email } : null,
});

beforeEach(() => {
  resetPrismaMock();
  prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1", organiser_id: "org-1" });
  prisma.school_registrations.findMany.mockResolvedValue([]);
  prisma.olympiad_invites.findMany.mockResolvedValue([]);
});

describe("listSchools", () => {
  it("rejects an organiser who doesn't own the olympiad", async () => {
    await expect(listSchools("oly-1", "org-2")).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.olympiad_invites.findMany).not.toHaveBeenCalled();
  });

  it("lists a registered school as a participant", async () => {
    prisma.school_registrations.findMany.mockResolvedValue([
      { school_id: "school-1", schools: school("school-1", "Northview") },
    ]);

    await expect(listSchools("oly-1", "org-1")).resolves.toEqual([
      {
        id: "school-1",
        name: "Northview",
        address: "Northview Road",
        entrants: 12,
        educators: [{ name: "Ms Naidoo", email: "naidoo@school.test" }],
        contactEmail: null,
        status: "accepted",
      },
    ]);
  });

  it("shows an unanswered invitation as pending, keyed by the invitation", async () => {
    prisma.olympiad_invites.findMany.mockResolvedValue([
      invite("inv-1", "pending", school("school-2", "Parktown High"), "head@parktown.test"),
    ]);

    await expect(listSchools("oly-1", "org-1")).resolves.toEqual([
      {
        id: "inv-1",
        name: "Parktown High",
        address: "Parktown High Road",
        entrants: 12,
        educators: [{ name: "Ms Naidoo", email: "naidoo@school.test" }],
        contactEmail: "head@parktown.test",
        status: "pending",
      },
    ]);
  });

  it("marks a rejected invitation as declined", async () => {
    prisma.olympiad_invites.findMany.mockResolvedValue([
      invite("inv-2", "rejected", school("school-3", "Southgate")),
    ]);

    const [row] = await listSchools("oly-1", "org-1");
    expect(row).toMatchObject({ id: "inv-2", name: "Southgate", status: "declined" });
  });

  it("does not repeat a school that has already accepted through another educator", async () => {
    const northview = school("school-1", "Northview");
    prisma.school_registrations.findMany.mockResolvedValue([
      { school_id: "school-1", schools: northview },
    ]);
    prisma.olympiad_invites.findMany.mockResolvedValue([
      invite("inv-1", "pending", northview),
      invite("inv-2", "pending", school("school-2", "Southgate")),
    ]);

    const rows = await listSchools("oly-1", "org-1");
    expect(rows.map((r) => [r.id, r.name])).toEqual([
      ["school-1", "Northview"],
      ["inv-2", "Southgate"],
    ]);
  });

  it("queries only this olympiad's approved registrations and unanswered educator invites", async () => {
    await listSchools("oly-1", "org-1");

    expect(prisma.school_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { olympiad_id: "oly-1", status: "approved" } }),
    );
    expect(prisma.olympiad_invites.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          olympiad_id: "oly-1",
          role: "educator",
          status: { in: ["pending", "rejected"] },
        },
        orderBy: { created_at: "desc" },
      }),
    );
  });
});
