jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const {
  getRegisteredRounds,
  getStudentRoundDetail,
  getStudentResults,
} = require("../../../src/services/studentRoundService");

beforeEach(resetPrismaMock);

const round = (overrides = {}) => ({
  id: "round-1",
  name: "Round 1",
  state: "open",
  exam_status: "live",
  opens_at: "2026-06-01T08:00:00Z",
  closes_at: "2026-06-01T10:00:00Z",
  olympiads: { name: "Maths Olympiad" },
  papers: [
    {
      title: "Paper 1",
      file_url: "rounds/round-1/paper-123-maths.pdf",
      questions: [{ max_points: "4" }, { max_points: 6 }, { max_points: null }],
    },
  ],
  submissions: [],
  results: [],
  ...overrides,
});

describe("getRegisteredRounds", () => {
  it("loads the entrant's registrations in opening order", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([]);
    await getRegisteredRounds("ent-1");
    expect(prisma.entrant_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entrant_id: "ent-1" },
        orderBy: { rounds: { opens_at: "asc" } },
        include: {
          rounds: {
            include: expect.objectContaining({
              results: expect.objectContaining({ where: { entrant_id: "ent-1" } }),
              submissions: expect.objectContaining({ where: { entrant_id: "ent-1" } }),
            }),
          },
        },
      }),
    );
  });

  it("summarises each round for the dashboard", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([{ rounds: round() }]);

    const { rounds, stats } = await getRegisteredRounds("ent-1");
    expect(rounds).toEqual([
      {
        id: "round-1",
        title: "Round 1",
        olympiadTitle: "Maths Olympiad",
        opens_at: "2026-06-01T08:00:00Z",
        closes_at: "2026-06-01T10:00:00Z",
        status: "open",
        paperFile: "paper-123-maths.pdf",
        paperTitle: "Paper 1",
        hasSubmitted: false,
        result: null,
      },
    ]);
    expect(stats).toEqual({ roundsEntered: 1, resultsAvailable: 0, certificatesEarned: 0 });
  });

  it.each([
    ["scheduled", "upcoming"],
    ["open", "open"],
    ["closed", "closed"],
    ["marking", "closed"],
    ["results_released", "closed"],
  ])("shows a %s round as %s", async (state, status) => {
    prisma.entrant_registrations.findMany.mockResolvedValue([{ rounds: round({ state }) }]);
    const { rounds } = await getRegisteredRounds("ent-1");
    expect(rounds[0].status).toBe(status);
  });

  it("hides results until they are released", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([
      { rounds: round({ state: "marking", results: [{ total_points: 7, rank: 1, qualified: true }] }) },
    ]);
    const { rounds, stats } = await getRegisteredRounds("ent-1");
    expect(rounds[0].result).toBeNull();
    expect(stats.resultsAvailable).toBe(0);
  });

  it("formats released results and counts certificates", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([
      {
        rounds: round({
          id: "r1",
          state: "results_released",
          submissions: [{ id: "s" }],
          results: [{ total_points: "7.5", rank: 2, qualified: true }],
        }),
      },
      {
        rounds: round({
          id: "r2",
          state: "results_released",
          results: [{ total_points: 1, rank: null, qualified: false }],
        }),
      },
    ]);

    const { rounds, stats } = await getRegisteredRounds("ent-1");
    expect(rounds[0]).toMatchObject({
      hasSubmitted: true,
      result: { score: "7.5 / 10", percentage: "75%", rankInSchool: 2, hasCertificate: true },
    });
    expect(rounds[1].result).toEqual({
      score: "1 / 10",
      percentage: "10%",
      rankInSchool: null,
      hasCertificate: false,
    });
    expect(stats).toEqual({ roundsEntered: 2, resultsAvailable: 2, certificatesEarned: 1 });
  });

  it("copes with a round that has no paper or olympiad", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([
      { rounds: round({ papers: [], olympiads: null, state: "results_released", results: [{ total_points: 3 }] }) },
    ]);
    const { rounds } = await getRegisteredRounds("ent-1");
    expect(rounds[0]).toMatchObject({
      olympiadTitle: "",
      paperFile: null,
      paperTitle: null,
      result: { score: "3 / 0", percentage: "0%" },
    });
  });
});

describe("getStudentRoundDetail", () => {
  const registration = (roundOverrides = {}) => ({
    entrants: { schools: { name: "Parktown High" } },
    rounds: round(roundOverrides),
  });

  it("rejects a round the student isn't registered for", async () => {
    prisma.entrant_registrations.findFirst.mockResolvedValue(null);
    await expect(getStudentRoundDetail("round-1", "ent-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.entrant_registrations.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entrant_id: "ent-1", round_id: "round-1" } }),
    );
  });

  it("describes an open, live round the student can sit online", async () => {
    prisma.entrant_registrations.findFirst.mockResolvedValue(registration());

    await expect(getStudentRoundDetail("round-1", "ent-1")).resolves.toEqual({
      id: "round-1",
      title: "Round 1",
      olympiadTitle: "Maths Olympiad",
      schoolName: "Parktown High",
      opens_at: "2026-06-01T08:00:00Z",
      closes_at: "2026-06-01T10:00:00Z",
      status: "open",
      canSitOnline: true,
      hasSubmitted: false,
      submissionStatus: null,
      paperFile: "paper-123-maths.pdf",
      paperFileUrl: "rounds/round-1/paper-123-maths.pdf",
      paperNote: "Paper is available for download or online sitting.",
      result: null,
    });
  });

  it("doesn't offer online sitting until the exam is live", async () => {
    prisma.entrant_registrations.findFirst.mockResolvedValue(registration({ exam_status: "ready" }));
    const detail = await getStudentRoundDetail("round-1", "ent-1");
    expect(detail.canSitOnline).toBe(false);
  });

  it.each([
    ["scheduled", "Available when the round opens."],
    ["closed", "This round has closed."],
  ])("shows the right note for a %s round", async (state, note) => {
    prisma.entrant_registrations.findFirst.mockResolvedValue(registration({ state }));
    const detail = await getStudentRoundDetail("round-1", "ent-1");
    expect(detail.paperNote).toBe(note);
    expect(detail.canSitOnline).toBe(false);
  });

  it("reports the submission status and a default file name without a paper", async () => {
    prisma.entrant_registrations.findFirst.mockResolvedValue({
      entrants: null,
      rounds: round({ papers: [], submissions: [{ status: "automarked" }] }),
    });
    const detail = await getStudentRoundDetail("round-1", "ent-1");
    expect(detail).toMatchObject({
      schoolName: "School",
      hasSubmitted: true,
      submissionStatus: "automarked",
      paperFile: "question-paper.pdf",
      paperFileUrl: null,
    });
  });
});

describe("getStudentResults", () => {
  it("only loads rounds that have closed, most recent first", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([]);
    await expect(getStudentResults("ent-1")).resolves.toEqual({ results: [] });
    expect(prisma.entrant_registrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entrant_id: "ent-1",
          rounds: { state: { in: ["closed", "marking", "results_released"] } },
        },
        orderBy: { rounds: { closes_at: "desc" } },
      }),
    );
  });

  it("shows released scores and keeps unreleased ones pending", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([
      { rounds: round({ id: "r1", state: "results_released", results: [{ total_points: 5, rank: 3, qualified: true }] }) },
      { rounds: round({ id: "r2", state: "marking", results: [{ total_points: 9, rank: 1, qualified: true }] }) },
      { rounds: round({ id: "r3", state: "results_released", results: [] }) },
    ]);

    const { results } = await getStudentResults("ent-1");
    expect(results).toEqual([
      {
        id: "r1",
        round: "Round 1",
        olympiadTitle: "Maths Olympiad",
        closes_at: "2026-06-01T10:00:00Z",
        resultStatus: "released",
        score: "5 / 10",
        percentage: "50%",
        rank: 3,
        hasCertificate: true,
      },
      expect.objectContaining({ id: "r2", resultStatus: "pending", score: "—", percentage: "—", rank: 1 }),
      expect.objectContaining({ id: "r3", resultStatus: "pending", score: "—", rank: null, hasCertificate: false }),
    ]);
  });

  it("rounds the percentage to a whole number", async () => {
    prisma.entrant_registrations.findMany.mockResolvedValue([
      {
        rounds: round({
          state: "results_released",
          papers: [{ questions: [{ max_points: 3 }] }],
          results: [{ total_points: 2 }],
        }),
      },
    ]);
    const { results } = await getStudentResults("ent-1");
    expect(results[0]).toMatchObject({ score: "2 / 3", percentage: "67%" });
  });
});
