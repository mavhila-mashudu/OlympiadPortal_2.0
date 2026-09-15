jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const { listSchools } = require("../../../src/services/schoolService");

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

const school = (id, name, overrides = {}) => ({
  id,
  name,
  address: `${name} Road`,
  _count: { entrants: 12 },
  educators: [{ users: { full_name: "Ms Naidoo", email: "naidoo@school.test" } }],
  ...overrides,
});

beforeEach(() => {
  resetPrismaMock();
  prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1", organiser_id: "org-1" });
  prisma.school_registrations.findMany.mockResolvedValue([]);
  prisma.invitations.findMany.mockResolvedValue([]);
});

describe("listSchools", () => {
  it("rejects an organiser who doesn't own the olympiad", async () => {
    await expect(listSchools("oly-1", "org-2")).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.invitations.findMany).not.toHaveBeenCalled();
  });

  it("shows a pending invitation before the school has registered", async () => {
    prisma.invitations.findMany.mockResolvedValue([
      {
        id: "inv-1",
        school_id: null,
        school_name: "Parktown High",
        schools: null,
        email: "head@parktown.test",
        used_by_id: null,
        expires_at: FUTURE,
      },
    ]);

    await expect(listSchools("oly-1", "org-1")).resolves.toEqual([
      {
        id: "inv-1",
        name: "Parktown High",
        address: null,
        entrants: 0,
        educators: [],
        contactEmail: "head@parktown.test",
        status: "pending",
      },
    ]);
  });

  it("marks accepted and expired invitations", async () => {
    prisma.invitations.findMany.mockResolvedValue([
      { id: "a", school_name: "A", schools: null, used_by_id: "u", expires_at: PAST },
      { id: "b", school_name: "B", schools: null, used_by_id: null, expires_at: PAST },
    ]);

    const rows = await listSchools("oly-1", "org-1");
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["a", "accepted"],
      ["b", "expired"],
    ]);
  });

  it("fills an accepted invitation's details from its school", async () => {
    prisma.invitations.findMany.mockResolvedValue([
      {
        id: "inv-2",
        school_id: "school-1",
        school_name: null,
        schools: school("school-1", "Northview"),
        email: null,
        used_by_id: "u",
        expires_at: PAST,
      },
    ]);

    await expect(listSchools("oly-1", "org-1")).resolves.toEqual([
      {
        id: "inv-2",
        name: "Northview",
        address: "Northview Road",
        entrants: 12,
        educators: [{ name: "Ms Naidoo", email: "naidoo@school.test" }],
        contactEmail: null,
        status: "accepted",
      },
    ]);
  });

  it("names an invitation 'Unnamed school' when nothing else is known", async () => {
    prisma.invitations.findMany.mockResolvedValue([
      { id: "x", school_name: null, schools: null, used_by_id: null, expires_at: FUTURE },
    ]);
    const [row] = await listSchools("oly-1", "org-1");
    expect(row.name).toBe("Unnamed school");
  });

  it("appends schools registered without an invitation, and doesn't repeat invited ones", async () => {
    prisma.invitations.findMany.mockResolvedValue([
      { id: "inv-1", school_id: "school-1", schools: school("school-1", "Northview"), used_by_id: "u", expires_at: PAST },
    ]);
    prisma.school_registrations.findMany.mockResolvedValue([
      { schools: school("school-1", "Northview") },
      {
        schools: school("school-2", "Southgate", {
          _count: { entrants: 3 },
          educators: [{ users: { full_name: "Mr Pillay", email: "pillay@southgate.test" } }],
        }),
      },
    ]);

    const rows = await listSchools("oly-1", "org-1");
    expect(rows.map((r) => r.id)).toEqual(["inv-1", "school-2"]);
    expect(rows[1]).toEqual({
      id: "school-2",
      name: "Southgate",
      address: "Southgate Road",
      entrants: 3,
      educators: [{ name: "Mr Pillay", email: "pillay@southgate.test" }],
      contactEmail: null,
      status: "accepted",
    });
  });

  it("queries only this olympiad's school invitations, newest first", async () => {
    await listSchools("oly-1", "org-1");
    expect(prisma.invitations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { olympiad_id: "oly-1", type: "school" },
        orderBy: { created_at: "desc" },
      }),
    );
    expect(prisma.school_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { olympiad_id: "oly-1" } }),
    );
  });
});
