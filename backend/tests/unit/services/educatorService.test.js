jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/config/supabase", () => {
  const bucket = { createSignedUrl: jest.fn() };
  return { storage: { from: jest.fn(() => bucket), bucket } };
});
jest.mock("../../../src/services/resultRecalculationService", () => ({
  recalculateRoundResults: jest.fn(),
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const supabase = require("../../../src/config/supabase");
const { recalculateRoundResults } = require("../../../src/services/resultRecalculationService");
const svc = require("../../../src/services/educatorService");

const educator = { id: "edu-1", user_id: "u", school_id: "school-1", schools: { id: "school-1", name: "Parktown High" } };

const round = (overrides = {}) => ({
  id: "round-2",
  name: "Round 2",
  olympiad_id: "oly-1",
  opens_at: new Date("2026-07-01T08:00:00Z"),
  closes_at: new Date("2026-07-01T10:00:00Z"),
  state: "scheduled",
  olympiads: { id: "oly-1", name: "Maths Olympiad" },
  papers: [],
  ...overrides,
});

beforeEach(() => {
  resetPrismaMock();
  prisma.educators.findUnique.mockResolvedValue(educator);
  prisma.school_registrations.findFirst.mockResolvedValue({ id: "reg" });
  supabase.storage.bucket.createSignedUrl
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: "https://signed.test/paper" }, error: null });
});

// Every educator entry point resolves the educator profile first and most
// check the school is registered for the olympiad. Cover those guards once
// for each function that has them.
describe("shared educator guards", () => {
  const roundScoped = [
    ["getEducatorRoundDetail", () => svc.getEducatorRoundDetail("round-2", "u")],
    ["registerEntrants", () => svc.registerEntrants("round-2", "u", [])],
    ["listPastPapers", () => svc.listPastPapers("round-2", "u")],
    ["getPaperDownloadUrl", () => svc.getPaperDownloadUrl("round-2", "u", "paper")],
    ["getProgressionInfo", () => svc.getProgressionInfo("round-2", "u")],
  ];
  const olympiadScoped = [
    ["registerEntrantsForOlympiad", () => svc.registerEntrantsForOlympiad("oly-1", "u", [])],
    ["listOlympiadEntrants", () => svc.listOlympiadEntrants("oly-1", "u")],
    ["getOlympiadProgressionInfo", () => svc.getOlympiadProgressionInfo("oly-1", "u")],
  ];
  const all = [
    ...roundScoped,
    ...olympiadScoped,
    ["listEducatorRounds", () => svc.listEducatorRounds("u")],
    ["listEntrants", () => svc.listEntrants("round-2", "u")],
    ["getResults", () => svc.getResults("round-2", "u")],
    ["listAllResults", () => svc.listAllResults("u")],
  ];

  it.each(all)("%s rejects a user with no educator profile", async (_name, call) => {
    prisma.educators.findUnique.mockResolvedValue(null);
    await expect(call()).rejects.toMatchObject({ statusCode: 403, message: "Educator profile not found" });
  });

  it.each([...roundScoped, ["getResults", () => svc.getResults("round-2", "u")]])(
    "%s rejects an unknown round",
    async (_name, call) => {
      prisma.rounds.findUnique.mockResolvedValue(null);
      await expect(call()).rejects.toMatchObject({ statusCode: 404, message: "Round not found" });
    },
  );

  it.each(olympiadScoped)("%s rejects an unknown olympiad", async (_name, call) => {
    prisma.olympiads.findUnique.mockResolvedValue(null);
    await expect(call()).rejects.toMatchObject({ statusCode: 404, message: "Olympiad not found" });
  });

  it.each([...roundScoped, ...olympiadScoped])(
    "%s rejects a school not registered for the olympiad",
    async (_name, call) => {
      prisma.rounds.findUnique.mockResolvedValue(round({ state: "open" }));
      prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1" });
      prisma.school_registrations.findFirst.mockResolvedValue(null);
      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        message: "Your school is not registered for this olympiad",
      });
      expect(prisma.school_registrations.findFirst).toHaveBeenCalledWith({
        where: { school_id: "school-1", olympiad_id: "oly-1" },
      });
    },
  );
});

describe("listEducatorRounds", () => {
  it("flattens rounds across olympiads, removes duplicates and sorts by opening time", async () => {
    const r = (id, opens, extra = {}) => ({
      id,
      name: id,
      olympiad_id: "oly",
      opens_at: opens,
      closes_at: opens,
      state: "scheduled",
      papers: [],
      _count: { submissions: 0, entrant_registrations: 0 },
      ...extra,
    });
    prisma.school_registrations.findMany.mockResolvedValue([
      { olympiads: { name: "Maths", rounds: [r("late", "2026-09-01"), r("shared", "2026-05-01")] } },
      {
        olympiads: {
          name: "Science",
          rounds: [
            r("shared", "2026-05-01"),
            r("early", "2026-01-01", {
              state: "open",
              papers: [{ id: "p", file_url: "x.pdf" }],
              _count: { submissions: 2, entrant_registrations: 9 },
            }),
          ],
        },
      },
    ]);

    const { rounds, school } = await svc.listEducatorRounds("u");

    expect(rounds.map((x) => x.id)).toEqual(["early", "shared", "late"]);
    expect(rounds[0]).toEqual({
      id: "early",
      name: "early",
      olympiad_id: "oly",
      olympiad_name: "Science",
      opens_at: "2026-01-01",
      closes_at: "2026-01-01",
      state: "open",
      status: "open",
      has_paper: true,
      submission_count: 2,
      entrant_count: 9,
    });
    expect(rounds[1]).toMatchObject({ olympiad_name: "Maths", status: "upcoming", has_paper: false });
    expect(school).toEqual({ id: "school-1", name: "Parktown High" });
  });

  it("doesn't count a paper row without an uploaded file", async () => {
    prisma.school_registrations.findMany.mockResolvedValue([
      {
        olympiads: {
          name: "Maths",
          rounds: [
            {
              id: "r",
              state: "results_released",
              opens_at: "2026-01-01",
              papers: [{ id: "p", file_url: null }],
              _count: { submissions: 0, entrant_registrations: 0 },
            },
          ],
        },
      },
    ]);
    const { rounds } = await svc.listEducatorRounds("u");
    expect(rounds[0]).toMatchObject({ has_paper: false, status: "closed" });
  });
});

describe("getEducatorRoundDetail", () => {
  it("returns the round with paper, submission and school details", async () => {
    prisma.rounds.findUnique.mockResolvedValue(
      round({
        state: "marking",
        results_release_at: null,
        papers: [{ id: "paper-1", title: "Paper", file_url: "p.pdf", memo_file_url: null }],
      }),
    );
    prisma.submissions.findMany.mockResolvedValue([
      {
        id: "sub-1",
        received_at: "2026-07-01T09:00:00Z",
        status: "received",
        route: "offline",
        entrants: { id: "ent-1", full_name: "Ayanda Khumalo" },
      },
    ]);

    const detail = await svc.getEducatorRoundDetail("round-2", "u");

    // Every submission for the school's learners, whoever captured it
    expect(prisma.submissions.findMany).toHaveBeenCalledWith({
      where: { round_id: "round-2", entrants: { school_id: "school-1" } },
      include: { entrants: { select: { id: true, full_name: true } } },
      orderBy: { received_at: "desc" },
    });
    expect(detail).toMatchObject({
      id: "round-2",
      olympiad_name: "Maths Olympiad",
      status: "closed",
      paper: { id: "paper-1", title: "Paper", has_paper: true, has_memo: false },
      submissions: [
        {
          id: "sub-1",
          entrant: { id: "ent-1", full_name: "Ayanda Khumalo" },
          received_at: "2026-07-01T09:00:00Z",
          status: "received",
          route: "offline",
        },
      ],
      // Still being marked, so there are no results to fetch yet
      results_available: false,
      school: { id: "school-1", name: "Parktown High" },
    });
  });

  it("reports results as available once they are released", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round({ state: "results_released" }));
    prisma.submissions.findMany.mockResolvedValue([]);
    expect((await svc.getEducatorRoundDetail("round-2", "u")).results_available).toBe(true);
  });

  it("reports no paper, no submission and no results for a new round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.submissions.findMany.mockResolvedValue([]);

    const detail = await svc.getEducatorRoundDetail("round-2", "u");
    expect(detail).toMatchObject({
      status: "upcoming",
      paper: null,
      submissions: [],
      results_available: false,
    });
  });
});

describe("registerEntrants", () => {
  const learners = [
    { full_name: "Ayanda Khumalo", grade: 10, external_ref: "STU-001" },
    { full_name: "Ben Smith", grade: "11" },
  ];

  beforeEach(() => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.rounds.findFirst.mockResolvedValue(null);
    prisma.entrants.findFirst.mockResolvedValue(null);
    prisma.entrants.create.mockImplementation(async ({ data }) => ({ id: `id-${data.full_name}`, ...data }));
  });

  it.each(["closed", "marking", "results_released"])("refuses registrations once the round is %s", async (state) => {
    prisma.rounds.findUnique.mockResolvedValue(round({ state }));
    await expect(svc.registerEntrants("round-2", "u", learners)).rejects.toMatchObject({
      statusCode: 400,
      message: "Entrants can't be registered once a round has closed",
    });
    expect(prisma.entrant_registrations.upsert).not.toHaveBeenCalled();
  });

  it("still accepts registrations while the round is open", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round({ state: "open" }));
    await svc.registerEntrants("round-2", "u", learners);
    expect(prisma.entrant_registrations.upsert).toHaveBeenCalledTimes(2);
  });

  it("creates new entrants and registers them for the round", async () => {
    const registered = await svc.registerEntrants("round-2", "u", learners);

    expect(prisma.entrants.findFirst).toHaveBeenNthCalledWith(1, {
      where: { school_id: "school-1", external_ref: "STU-001" },
    });
    expect(prisma.entrants.findFirst).toHaveBeenNthCalledWith(2, {
      where: { school_id: "school-1", full_name: "Ben Smith" },
    });
    expect(prisma.entrants.create).toHaveBeenCalledWith({
      data: { school_id: "school-1", full_name: "Ayanda Khumalo", grade: "10", external_ref: "STU-001" },
    });
    expect(prisma.entrants.create).toHaveBeenCalledWith({
      data: { school_id: "school-1", full_name: "Ben Smith", grade: "11", external_ref: null },
    });
    expect(prisma.entrant_registrations.upsert).toHaveBeenCalledWith({
      where: { entrant_id_round_id: { entrant_id: "id-Ben Smith", round_id: "round-2" } },
      update: { status: "registered" },
      create: { entrant_id: "id-Ben Smith", round_id: "round-2", registered_by: "edu-1", status: "registered" },
    });
    expect(registered.map((e) => e.id)).toEqual(["id-Ayanda Khumalo", "id-Ben Smith"]);
  });

  it("updates an entrant that already exists", async () => {
    prisma.entrants.findFirst.mockResolvedValue({ id: "ent-existing" });
    prisma.entrants.update.mockResolvedValue({ id: "ent-existing" });

    await svc.registerEntrants("round-2", "u", [learners[0]]);
    expect(prisma.entrants.update).toHaveBeenCalledWith({
      where: { id: "ent-existing" },
      data: { full_name: "Ayanda Khumalo", grade: "10" },
    });
    expect(prisma.entrants.create).not.toHaveBeenCalled();
  });

  it("looks for the round immediately before this one in the olympiad", async () => {
    await svc.registerEntrants("round-2", "u", []);
    expect(prisma.rounds.findFirst).toHaveBeenCalledWith({
      where: { olympiad_id: "oly-1", opens_at: { lt: new Date("2026-07-01T08:00:00Z") } },
      orderBy: { opens_at: "desc" },
    });
  });

  it("doesn't restrict entry while the previous round's results are unreleased", async () => {
    prisma.rounds.findFirst.mockResolvedValue({ id: "round-1", state: "marking" });
    await expect(svc.registerEntrants("round-2", "u", learners)).resolves.toHaveLength(2);
    expect(prisma.results.findMany).not.toHaveBeenCalled();
  });

  it("only registers entrants who qualified in a released previous round", async () => {
    prisma.rounds.findFirst.mockResolvedValue({ id: "round-1", name: "Round 1", state: "results_released" });
    prisma.results.findMany.mockResolvedValue([{ entrant_id: "id-Ayanda Khumalo" }]);

    await expect(svc.registerEntrants("round-2", "u", learners)).rejects.toMatchObject({
      statusCode: 400,
      message:
        'Ben Smith did not qualify in the previous round ("Round 1") and cannot be registered for this round.',
    });
    expect(prisma.results.findMany).toHaveBeenCalledWith({
      where: { round_id: "round-1", qualified: true, entrants: { school_id: "school-1" } },
      select: { entrant_id: true },
    });
  });

  it("registers entrants who all qualified", async () => {
    prisma.rounds.findFirst.mockResolvedValue({ id: "round-1", state: "results_released" });
    prisma.results.findMany.mockResolvedValue([{ entrant_id: "id-Ayanda Khumalo" }]);
    await expect(svc.registerEntrants("round-2", "u", [learners[0]])).resolves.toHaveLength(1);
  });
});

describe("listEntrants", () => {
  beforeEach(() => {
    prisma.rounds.findUnique.mockResolvedValue({ olympiad_id: "oly-1" });
  });

  it("rejects an unknown round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(null);
    await expect(svc.listEntrants("round-x", "u")).rejects.toMatchObject({ statusCode: 404, message: "Round not found" });
  });

  it("rejects a school that isn't registered for the round's olympiad", async () => {
    prisma.school_registrations.findFirst.mockResolvedValue(null);
    await expect(svc.listEntrants("round-2", "u")).rejects.toMatchObject({
      statusCode: 403,
      message: "Your school is not registered for this olympiad",
    });
    expect(prisma.entrant_registrations.findMany).not.toHaveBeenCalled();
  });

  it("returns the school's registered entrants for the round", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([
      {
        created_at: "2026-06-01",
        entrants: { id: "e1", full_name: "Ayanda", grade: "10", external_ref: "STU-001" },
      },
    ]);

    await expect(svc.listEntrants("round-2", "u")).resolves.toEqual([
      { id: "e1", full_name: "Ayanda", grade: "10", external_ref: "STU-001", registered_at: "2026-06-01" },
    ]);
    expect(prisma.entrant_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { round_id: "round-2", entrants: { school_id: "school-1" } } }),
    );
  });
});

describe("getResults", () => {
  it("refuses until results are released", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round({ state: "marking" }));
    await expect(svc.getResults("round-2", "u")).rejects.toMatchObject({
      statusCode: 400,
      message: 'Results are not yet available — round is "marking"',
    });
  });

  it("returns the school's ranked results", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round({ state: "results_released" }));
    prisma.results.findMany.mockResolvedValue([
      {
        id: "res-1",
        rank: 1,
        total_points: 18,
        qualified: true,
        entrants: { id: "e1", full_name: "Ayanda", grade: "10", external_ref: null },
      },
    ]);

    await expect(svc.getResults("round-2", "u")).resolves.toEqual({
      round: {
        id: "round-2",
        name: "Round 2",
        state: "results_released",
        closes_at: new Date("2026-07-01T10:00:00Z"),
      },
      results: [
        {
          id: "res-1",
          rank: 1,
          total_points: 18,
          qualified: true,
          entrant: { id: "e1", full_name: "Ayanda", grade: "10", external_ref: null },
        },
      ],
    });
    expect(prisma.results.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { round_id: "round-2", entrants: { school_id: "school-1" } },
        orderBy: { rank: "asc" },
      }),
    );
  });
});

describe("listAllResults", () => {
  it("returns released rounds from the school's olympiads with their results", async () => {
    prisma.school_registrations.findMany.mockResolvedValue([{ olympiad_id: "oly-1" }, { olympiad_id: "oly-2" }]);
    prisma.rounds.findMany.mockResolvedValue([
      {
        id: "round-1",
        name: "Round 1",
        closes_at: "2026-05-01",
        olympiads: { name: "Maths" },
        results: [
          { id: "res", rank: 2, total_points: 9, qualified: false, entrants: { id: "e", full_name: "Ben", grade: null, external_ref: "X" } },
        ],
      },
    ]);

    await expect(svc.listAllResults("u")).resolves.toEqual([
      {
        id: "round-1",
        name: "Round 1",
        olympiad_name: "Maths",
        closes_at: "2026-05-01",
        results: [
          { id: "res", rank: 2, total_points: 9, qualified: false, entrant: { id: "e", full_name: "Ben", grade: null, external_ref: "X" } },
        ],
      },
    ]);
    expect(prisma.rounds.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { olympiad_id: { in: ["oly-1", "oly-2"] }, state: "results_released" } }),
    );
  });
});

describe("getSchoolOverview", () => {
  const opensA = new Date("2026-05-01T08:00:00Z");
  const closesA = new Date("2026-05-02T08:00:00Z");
  const opensB = new Date("2026-07-01T08:00:00Z");
  const closesB = new Date("2026-07-02T08:00:00Z");

  const arrangeOlympiad = () => {
    prisma.school_registrations.findMany.mockResolvedValue([
      {
        olympiads: {
          id: "oly-1",
          name: "Maths Olympiad",
          rounds: [
            { id: "round-1", olympiad_id: "oly-1", name: "Round 1", state: "results_released", opens_at: opensA, closes_at: closesA },
            { id: "round-2", olympiad_id: "oly-1", name: "Round 2", state: "open", opens_at: opensB, closes_at: closesB },
          ],
        },
      },
    ]);
    prisma.entrant_registrations.findMany.mockResolvedValue([
      { round_id: "round-1", entrants: { id: "e1", full_name: "Zane", grade: "11", external_ref: "S1" } },
      { round_id: "round-1", entrants: { id: "e2", full_name: "Ayanda", grade: "10", external_ref: null } },
      { round_id: "round-2", entrants: { id: "e1", full_name: "Zane", grade: "11", external_ref: "S1" } },
      { round_id: "round-2", entrants: { id: "e2", full_name: "Ayanda", grade: "10", external_ref: null } },
    ]);
    prisma.submissions.findMany.mockResolvedValue([
      { round_id: "round-1", entrant_id: "e1", received_at: "2026-05-01T09:00:00Z" },
      { round_id: "round-1", entrant_id: "e2", received_at: "2026-05-01T09:30:00Z" },
      { round_id: "round-2", entrant_id: "e1", received_at: "2026-07-01T09:00:00Z" },
    ]);
    prisma.results.findMany.mockResolvedValue([
      { round_id: "round-1", entrant_id: "e1", total_points: 10, rank: 1, qualified: true },
      { round_id: "round-1", entrant_id: "e2", total_points: 5, rank: 3, qualified: false },
      // Exists internally, but round 2 hasn't released results yet
      { round_id: "round-2", entrant_id: "e1", total_points: 99, rank: 1, qualified: true },
    ]);
  };

  it("returns an empty overview when the school has no registrations", async () => {
    prisma.school_registrations.findMany.mockResolvedValue([]);

    await expect(svc.getSchoolOverview("u")).resolves.toEqual({
      school: { id: "school-1", name: "Parktown High" },
      olympiads: [],
      entrants: [],
    });
    expect(prisma.entrant_registrations.findMany).not.toHaveBeenCalled();
  });

  it("summarises every round and hides scores until results are released", async () => {
    arrangeOlympiad();

    await expect(svc.getSchoolOverview("u")).resolves.toEqual({
      school: { id: "school-1", name: "Parktown High" },
      olympiads: [
        {
          id: "oly-1",
          name: "Maths Olympiad",
          rounds: [
            {
              id: "round-1",
              name: "Round 1",
              state: "results_released",
              status: "closed",
              opens_at: opensA,
              closes_at: closesA,
              entrant_count: 2,
              submitted_count: 2,
              results_available: true,
              school_average: 7.5,
              qualified_count: 1,
              top_rank: 1,
            },
            {
              id: "round-2",
              name: "Round 2",
              state: "open",
              status: "open",
              opens_at: opensB,
              closes_at: closesB,
              entrant_count: 2,
              submitted_count: 1,
              results_available: false,
              school_average: null,
              qualified_count: null,
              top_rank: null,
            },
          ],
        },
      ],
      entrants: [
        {
          id: "e2",
          full_name: "Ayanda",
          grade: "10",
          external_ref: null,
          rounds: [
            { round_id: "round-1", round_name: "Round 1", olympiad_id: "oly-1", state: "results_released", submitted: true, submitted_at: "2026-05-01T09:30:00Z", score: 5, rank: 3, qualified: false },
            { round_id: "round-2", round_name: "Round 2", olympiad_id: "oly-1", state: "open", submitted: false, submitted_at: null, score: null, rank: null, qualified: null },
          ],
        },
        {
          id: "e1",
          full_name: "Zane",
          grade: "11",
          external_ref: "S1",
          rounds: [
            { round_id: "round-1", round_name: "Round 1", olympiad_id: "oly-1", state: "results_released", submitted: true, submitted_at: "2026-05-01T09:00:00Z", score: 10, rank: 1, qualified: true },
            { round_id: "round-2", round_name: "Round 2", olympiad_id: "oly-1", state: "open", submitted: true, submitted_at: "2026-07-01T09:00:00Z", score: null, rank: null, qualified: null },
          ],
        },
      ],
    });
  });

  it("scopes registrations, submissions and results to the school's entrants", async () => {
    arrangeOlympiad();

    await svc.getSchoolOverview("u");
    expect(prisma.entrant_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rounds: { olympiad_id: { in: ["oly-1"] } }, entrants: { school_id: "school-1" } },
      }),
    );
    expect(prisma.submissions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rounds: { olympiad_id: { in: ["oly-1"] } }, entrants: { school_id: "school-1" } },
      }),
    );
    expect(prisma.results.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rounds: { olympiad_id: { in: ["oly-1"] } }, entrants: { school_id: "school-1" } },
      }),
    );
  });
});

describe("listPastPapers", () => {
  it("lists earlier closed rounds that have an uploaded paper", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round());
    prisma.rounds.findMany.mockResolvedValue([
      {
        id: "round-1",
        name: "Round 1",
        closes_at: "2026-05-01",
        papers: [{ id: "p1", title: "Paper 1", file_url: "p1.pdf", memo_file_url: "m1.pdf" }],
      },
      { id: "round-0", name: "Warm-up", closes_at: "2026-04-01", papers: [{ id: "p0", file_url: null }] },
      { id: "round-x", name: "No paper", closes_at: "2026-03-01", papers: [] },
    ]);

    await expect(svc.listPastPapers("round-2", "u")).resolves.toEqual([
      {
        id: "p1",
        round_id: "round-1",
        round_name: "Round 1",
        title: "Paper 1",
        closed_at: "2026-05-01",
        has_paper: true,
        has_memo: true,
      },
    ]);
    expect(prisma.rounds.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          olympiad_id: "oly-1",
          closes_at: { lt: new Date("2026-07-01T08:00:00Z") },
          state: { in: ["closed", "marking", "results_released"] },
        },
      }),
    );
  });
});

describe("getPaperDownloadUrl", () => {
  const openRound = (papers = [{ file_url: "rounds/round-2/paper.pdf" }]) => round({ state: "open", papers });

  it("blocks downloads before the round opens", async () => {
    prisma.rounds.findUnique.mockResolvedValue(round({ state: "scheduled", papers: [{ file_url: "p" }] }));
    await expect(svc.getPaperDownloadUrl("round-2", "u", "paper")).rejects.toMatchObject({
      statusCode: 400,
      message: "Paper is not available yet — the round has not opened",
    });
  });

  it("reports a round without a paper", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound([]));
    await expect(svc.getPaperDownloadUrl("round-2", "u", "paper")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps the memo organiser-only", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    await expect(svc.getPaperDownloadUrl("round-2", "u", "memo")).rejects.toMatchObject({
      statusCode: 403,
      message: "Only the organiser can download the memo",
    });
  });

  it("reports a paper row without a file", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound([{ file_url: null }]));
    await expect(svc.getPaperDownloadUrl("round-2", "u", "paper")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("signs a 60-second download link", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    await expect(svc.getPaperDownloadUrl("round-2", "u", "paper")).resolves.toBe("https://signed.test/paper");
    expect(supabase.storage.from).toHaveBeenCalledWith("papers");
    expect(supabase.storage.bucket.createSignedUrl).toHaveBeenCalledWith("rounds/round-2/paper.pdf", 60);
  });

  it("reports a signing failure", async () => {
    prisma.rounds.findUnique.mockResolvedValue(openRound());
    supabase.storage.bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(svc.getPaperDownloadUrl("round-2", "u", "paper")).rejects.toMatchObject({
      message: "Could not generate download link: denied",
    });
  });
});

describe("getProgressionInfo", () => {
  beforeEach(() => prisma.rounds.findUnique.mockResolvedValue(round()));

  it.each([
    ["there is no previous round", null],
    ["the previous round's results aren't out", { id: "round-1", state: "closed" }],
  ])("requires no qualification when %s", async (_label, previous) => {
    prisma.rounds.findFirst.mockResolvedValue(previous);
    await expect(svc.getProgressionInfo("round-2", "u")).resolves.toEqual({
      requiresQualification: false,
      previousRound: null,
      qualifiedEntrantIds: [],
    });
  });

  it("lists who qualified from a released previous round", async () => {
    prisma.rounds.findFirst.mockResolvedValue({
      id: "round-1",
      name: "Round 1",
      state: "results_released",
      qualifying_threshold: "60.5",
    });
    prisma.results.findMany.mockResolvedValue([{ entrant_id: "e1" }, { entrant_id: "e2" }]);

    await expect(svc.getProgressionInfo("round-2", "u")).resolves.toEqual({
      requiresQualification: true,
      previousRound: { id: "round-1", name: "Round 1", qualifyingThreshold: 60.5 },
      qualifiedEntrantIds: ["e1", "e2"],
    });
  });

  it("reports a null threshold when the previous round had none", async () => {
    prisma.rounds.findFirst.mockResolvedValue({ id: "round-1", state: "results_released", qualifying_threshold: null });
    prisma.results.findMany.mockResolvedValue([]);
    const info = await svc.getProgressionInfo("round-2", "u");
    expect(info.previousRound.qualifyingThreshold).toBeNull();
  });
});

describe("registerEntrantsForOlympiad", () => {
  const rounds = [
    { id: "r1", name: "Round 1", state: "scheduled" },
    { id: "r2", name: "Round 2", state: "scheduled" },
    { id: "r3", name: "Round 3", state: "scheduled" },
  ];

  beforeEach(() => {
    prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1" });
    prisma.rounds.findMany.mockResolvedValue(rounds);
    prisma.entrants.findFirst.mockResolvedValue(null);
    prisma.entrants.create.mockImplementation(async ({ data }) => ({ id: "ent-1", ...data }));
  });

  it("rejects an olympiad with no rounds", async () => {
    prisma.rounds.findMany.mockResolvedValue([]);
    await expect(svc.registerEntrantsForOlympiad("oly-1", "u", [])).rejects.toMatchObject({
      statusCode: 400,
      message: "No rounds found for this olympiad",
    });
  });

  it("skips closed rounds, and a round whose released predecessor wasn't passed", async () => {
    // r1 has released results (closed), and the learner did not qualify in
    // it, so r2 is skipped too. r2 isn't released, so r3 is registered
    // tentatively.
    prisma.rounds.findMany.mockResolvedValue([{ ...rounds[0], state: "results_released" }, rounds[1], rounds[2]]);
    prisma.results.findFirst.mockResolvedValue(null);

    const [entrant] = await svc.registerEntrantsForOlympiad("oly-1", "u", [
      { full_name: "Ayanda", grade: 9, external_ref: "STU-9" },
    ]);

    expect(prisma.results.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.results.findFirst).toHaveBeenCalledWith({
      where: { round_id: "r1", entrant_id: "ent-1", qualified: true },
    });
    expect(entrant).toEqual({
      id: "ent-1",
      full_name: "Ayanda",
      grade: "9",
      external_ref: "STU-9",
      rounds: [{ id: "r3", name: "Round 3" }],
    });
    expect(prisma.entrant_registrations.upsert).toHaveBeenCalledTimes(1);
  });

  it("registers for a later round when the learner qualified", async () => {
    prisma.rounds.findMany.mockResolvedValue([{ ...rounds[0], state: "results_released" }, rounds[1], rounds[2]]);
    prisma.results.findFirst.mockResolvedValue({ id: "res" });
    const [entrant] = await svc.registerEntrantsForOlympiad("oly-1", "u", [{ full_name: "Ayanda" }]);
    expect(entrant.rounds.map((r) => r.id)).toEqual(["r2", "r3"]);
  });

  it("registers for every round while none has released results", async () => {
    const [entrant] = await svc.registerEntrantsForOlympiad("oly-1", "u", [{ full_name: "Ayanda" }]);
    expect(entrant.rounds.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(prisma.results.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an olympiad whose rounds have all closed", async () => {
    prisma.rounds.findMany.mockResolvedValue(rounds.map((r) => ({ ...r, state: "closed" })));
    await expect(svc.registerEntrantsForOlympiad("oly-1", "u", [{ full_name: "A" }])).rejects.toMatchObject({
      statusCode: 400,
      message: "Every round in this olympiad has closed, so no one can be registered",
    });
    expect(prisma.entrants.create).not.toHaveBeenCalled();
  });

  it("updates an existing entrant instead of creating one", async () => {
    prisma.rounds.findMany.mockResolvedValue([rounds[0]]);
    prisma.entrants.findFirst.mockResolvedValue({ id: "ent-old" });
    prisma.entrants.update.mockResolvedValue({ id: "ent-old", full_name: "Ayanda", grade: "10", external_ref: null });

    const [entrant] = await svc.registerEntrantsForOlympiad("oly-1", "u", [{ full_name: "Ayanda", grade: 10 }]);
    expect(prisma.entrants.findFirst).toHaveBeenCalledWith({ where: { school_id: "school-1", full_name: "Ayanda" } });
    expect(prisma.entrants.update).toHaveBeenCalledWith({
      where: { id: "ent-old" },
      data: { full_name: "Ayanda", grade: "10" },
    });
    expect(entrant.id).toBe("ent-old");
  });
});

describe("listOlympiadEntrants", () => {
  it("groups each entrant's registrations across rounds", async () => {
    prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1" });
    prisma.rounds.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    const ayanda = { id: "e1", full_name: "Ayanda", grade: "10", external_ref: null };
    prisma.entrant_registrations.findMany.mockResolvedValue([
      { entrants: ayanda, rounds: { id: "r1", name: "Round 1" } },
      { entrants: { id: "e2", full_name: "Ben", grade: null, external_ref: "X" }, rounds: { id: "r1", name: "Round 1" } },
      { entrants: ayanda, rounds: { id: "r2", name: "Round 2" } },
    ]);

    await expect(svc.listOlympiadEntrants("oly-1", "u")).resolves.toEqual([
      { ...ayanda, rounds: [{ id: "r1", name: "Round 1" }, { id: "r2", name: "Round 2" }] },
      { id: "e2", full_name: "Ben", grade: null, external_ref: "X", rounds: [{ id: "r1", name: "Round 1" }] },
    ]);
    expect(prisma.entrant_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { round_id: { in: ["r1", "r2"] }, entrants: { school_id: "school-1" } } }),
    );
  });
});

describe("getOlympiadProgressionInfo", () => {
  it("describes each round's qualification requirement", async () => {
    prisma.olympiads.findUnique.mockResolvedValue({ id: "oly-1" });
    prisma.rounds.findMany.mockResolvedValue([
      { id: "r1", name: "Round 1", state: "results_released", qualifying_threshold: "50" },
      { id: "r2", name: "Round 2", state: "open", qualifying_threshold: null },
      { id: "r3", name: "Round 3", state: "scheduled", qualifying_threshold: null },
    ]);
    prisma.results.findMany.mockResolvedValue([{ entrant_id: "e1" }]);

    await expect(svc.getOlympiadProgressionInfo("oly-1", "u")).resolves.toEqual({
      rounds: [
        { roundId: "r1", roundName: "Round 1", requiresQualification: false, previousRound: null, state: "results_released" },
        {
          roundId: "r2",
          roundName: "Round 2",
          requiresQualification: true,
          previousRound: { id: "r1", name: "Round 1", qualifyingThreshold: 50 },
          qualifiedEntrantIds: ["e1"],
          state: "open",
        },
        {
          roundId: "r3",
          roundName: "Round 3",
          requiresQualification: false,
          previousRound: null,
          qualifiedEntrantIds: [],
          state: "scheduled",
        },
      ],
    });
    expect(prisma.results.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("when file storage isn't configured", () => {
  it("getPaperDownloadUrl refuses", async () => {
    jest.resetModules();
    jest.doMock("../../../src/config/supabase", () => null);
    const unconfigured = require("../../../src/services/educatorService");

    await expect(unconfigured.getPaperDownloadUrl("round-2", "u", "paper")).rejects.toMatchObject({
      statusCode: 400,
      message: "File storage is not configured on this server",
    });
  });
});

describe("listRemarks", () => {
  it("lists remarks specifically assigned to this educator", async () => {
    prisma.remark_requests.findMany.mockResolvedValue([
      {
        id: "rem-1",
        reason: "Please check question 3",
        status: "pending",
        review_note: null,
        created_at: new Date("2026-09-25T12:00:00Z"),
        reviewed_at: null,
        results: {
          total_points: 38,
          entrants: { full_name: "John Doe", schools: { name: "Parktown High" } },
          rounds: { name: "Round 1", olympiads: { name: "Maths Olympiad" } },
        },
      },
    ]);

    const result = await svc.listRemarks("u");
    expect(result).toEqual([
      {
        id: "rem-1",
        studentName: "John Doe",
        studentSchool: "Parktown High",
        roundName: "Round 1",
        olympiadName: "Maths Olympiad",
        score: 38,
        reason: "Please check question 3",
        status: "pending",
        review_note: null,
        created_at: expect.any(Date),
        reviewed_at: null,
      },
    ]);
  });
});

describe("resolveRemark", () => {
  it("updates remark status and review note when educator is assigned", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      id: "rem-1",
      reviewer_id: "u",
      status: "pending",
    });
    prisma.remark_requests.update.mockResolvedValue({
      id: "rem-1",
      status: "reviewed",
      review_note: "Recount confirmed, mark adjusted",
    });

    const result = await svc.resolveRemark("rem-1", "u", {
      status: "reviewed",
      review_note: "Recount confirmed, mark adjusted",
    });

    expect(result).toMatchObject({
      id: "rem-1",
      status: "reviewed",
      review_note: "Recount confirmed, mark adjusted",
    });
    expect(prisma.remark_requests.update).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: {
        status: "reviewed",
        review_note: "Recount confirmed, mark adjusted",
        reviewed_at: expect.any(Date),
      },
    });
  });

  it("rejects a remark that has already been concluded", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      id: "rem-1",
      reviewer_id: "u",
      status: "reviewed",
    });

    await expect(
      svc.resolveRemark("rem-1", "u", { status: "reviewed", review_note: "Again" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "This remark has already been reviewed",
    });
    expect(prisma.remark_requests.update).not.toHaveBeenCalled();
  });

  it("rejects an educator who is not assigned to this remark", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      id: "rem-1",
      reviewer_id: "other-user",
    });

    await expect(
      svc.resolveRemark("rem-1", "u", { status: "reviewed", review_note: "Test" }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not assigned to review this remark",
    });
  });

  it("throws NotFoundError if remark does not exist", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue(null);

    await expect(
      svc.resolveRemark("rem-missing", "u", { status: "reviewed" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Remark request not found",
    });
  });
});

describe("getRemarkSubmissionAnswers", () => {
  it("rejects an educator who is not assigned to this remark", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      id: "rem-1",
      reviewer_id: "other-user",
      results: { entrants: { id: "ent-1" }, rounds: { id: "round-1" } },
    });

    await expect(svc.getRemarkSubmissionAnswers("rem-1", "u")).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not assigned to review this remark",
    });
  });

  it("throws NotFoundError if remark does not exist", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue(null);

    await expect(svc.getRemarkSubmissionAnswers("rem-missing", "u")).rejects.toMatchObject({
      statusCode: 404,
      message: "Remark request not found",
    });
  });

  it("returns question-by-question submission answers", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      id: "rem-1",
      reviewer_id: "u",
      result_id: "res-1",
      results: {
        round_id: "round-1",
        entrant_id: "ent-1",
        total_points: 10,
        entrants: { id: "ent-1", full_name: "Ayanda" },
        rounds: { id: "round-1", name: "Round 1" },
      },
    });

    prisma.submissions.findFirst.mockResolvedValue({
      id: "sub-1",
      answers: [
        {
          id: "ans-1",
          question_id: "q-1",
          answer_value: "B",
          points_awarded: 2,
          is_correct: true,
          marked_at: new Date("2026-09-25T10:00:00Z"),
          questions: {
            id: "q-1",
            prompt: "What is 2+2?",
            type: "mcq",
            options: ["2", "4"],
            correct_option: 1,
            correct_answer: null,
            max_points: 2,
          },
        },
      ],
    });

    const result = await svc.getRemarkSubmissionAnswers("rem-1", "u");
    expect(result).toMatchObject({
      remarkId: "rem-1",
      submissionId: "sub-1",
      studentName: "Ayanda",
      roundName: "Round 1",
      totalPoints: 10,
      answers: [
        {
          id: "ans-1",
          questionId: "q-1",
          prompt: "What is 2+2?",
          type: "mcq",
          maxPoints: 2,
          studentAnswer: "B",
          pointsAwarded: 2,
          isCorrect: true,
        },
      ],
    });
  });
});

describe("updateRemarkAnswer", () => {
  const remarkRecord = {
    id: "rem-1",
    reviewer_id: "u",
    status: "pending",
    result_id: "res-1",
    results: { round_id: "round-1", entrant_id: "ent-1" },
  };

  const answerRecord = {
    id: "ans-1",
    submission_id: "sub-1",
    points_awarded: 2,
    submissions: { round_id: "round-1", entrant_id: "ent-1" },
    questions: { max_points: 5 },
  };

  it("rejects non-assigned reviewer", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      ...remarkRecord,
      reviewer_id: "other",
    });

    await expect(
      svc.updateRemarkAnswer("rem-1", "ans-1", "u", { points_awarded: 3 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not assigned to review this remark",
    });
  });

  it.each(["reviewed", "approved", "rejected"])("rejects updating a %s remark", async (status) => {
    prisma.remark_requests.findUnique.mockResolvedValue({
      ...remarkRecord,
      status,
    });

    await expect(
      svc.updateRemarkAnswer("rem-1", "ans-1", "u", { points_awarded: 3 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cannot adjust marks on an already reviewed remark",
    });
  });

  it("rejects an answer not matching the remark submission", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue(remarkRecord);
    prisma.answers.findUnique.mockResolvedValue({
      ...answerRecord,
      submissions: { round_id: "round-different", entrant_id: "ent-1" },
    });

    await expect(
      svc.updateRemarkAnswer("rem-1", "ans-1", "u", { points_awarded: 3 }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Answer not found for this remark request",
    });
  });

  it("updates answer points clamped to maxPoints, logs the change and recalculates the round", async () => {
    prisma.remark_requests.findUnique.mockResolvedValue(remarkRecord);
    prisma.answers.findUnique.mockResolvedValue(answerRecord);
    prisma.answers.update.mockResolvedValue({ id: "ans-1" });
    prisma.results.findUnique.mockResolvedValue({ total_points: "16" });

    const result = await svc.updateRemarkAnswer("rem-1", "ans-1", "u", {
      points_awarded: 10,
    });

    expect(result).toEqual({
      answerId: "ans-1",
      pointsAwarded: 5,
      isCorrect: true,
      totalPoints: 16,
    });

    expect(prisma.marking_reviews.create).toHaveBeenCalledWith({
      data: {
        answer_id: "ans-1",
        reviewer_id: "u",
        original_points: 2,
        revised_points: 5,
        comment: "Re-marked in a remark review",
      },
    });

    expect(prisma.answers.update).toHaveBeenCalledWith({
      where: { id: "ans-1" },
      data: {
        points_awarded: 5,
        is_correct: true,
        marked_by: "u",
        marked_at: expect.any(Date),
      },
    });

    // Ranks, qualification and next-round enrolment all follow the new total
    expect(recalculateRoundResults).toHaveBeenCalledWith(prisma, "round-1");
  });
});


