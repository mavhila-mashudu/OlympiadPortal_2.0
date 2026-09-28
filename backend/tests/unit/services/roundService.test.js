jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/services/markingService", () => ({
  autoMarkRoundInternal: jest.fn(),
  generateResults: jest.fn(),
}));
// The real one calls a public-holiday API over the internet
jest.mock("../../../src/services/holidayService", () => ({
  checkDatesForHolidays: jest.fn().mockResolvedValue([]),
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const { autoMarkRoundInternal, generateResults } = require("../../../src/services/markingService");
const { checkDatesForHolidays } = require("../../../src/services/holidayService");
const {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound,
  setRoundState,
} = require("../../../src/services/roundService");

const ownedOlympiad = { id: "oly-1", organiser_id: "org-1", timezone: "Africa/Johannesburg" };

const storedRound = (overrides = {}) => ({
  id: "round-1",
  name: "Round 1",
  state: "scheduled",
  opens_at: new Date("2026-06-01T08:00:00Z"),
  closes_at: new Date("2026-06-01T10:00:00Z"),
  olympiads: ownedOlympiad,
  ...overrides,
});

let consoleLog;
let consoleError;
beforeEach(() => {
  resetPrismaMock();
  autoMarkRoundInternal.mockReset();
  generateResults.mockReset();
  consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleLog.mockRestore();
  consoleError.mockRestore();
});

describe("createRound", () => {
  const input = (overrides = {}) => ({
    olympiadId: "oly-1",
    organiserId: "org-1",
    name: "Round 1",
    notes: "Bring pencils",
    opensAt: "2026-06-01T08:00:00Z",
    closesAt: "2026-06-01T10:00:00Z",
    ...overrides,
  });

  beforeEach(() => prisma.olympiads.findUnique.mockResolvedValue(ownedOlympiad));

  it("rejects an olympiad that doesn't exist", async () => {
    prisma.olympiads.findUnique.mockResolvedValue(null);
    await expect(createRound(input())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an olympiad owned by someone else", async () => {
    await expect(createRound(input({ organiserId: "org-2" }))).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.rounds.create).not.toHaveBeenCalled();
  });

  it("rejects dates that can't be parsed", async () => {
    await expect(createRound(input({ opensAt: "not a date" }))).rejects.toMatchObject({
      statusCode: 400,
      message: "opens_at and closes_at must be valid dates",
    });
  });

  it.each([
    ["before", "2026-06-01T07:00:00Z"],
    ["equal to", "2026-06-01T08:00:00Z"],
  ])("rejects a close time %s the open time", async (_label, closesAt) => {
    await expect(createRound(input({ closesAt }))).rejects.toMatchObject({
      message: "closes_at must be after opens_at",
    });
  });

  it("creates the round with parsed dates", async () => {
    prisma.rounds.create.mockResolvedValue({ id: "round-new" });

    await expect(createRound(input({ qualifyingThreshold: 60 }))).resolves.toEqual({
      round: { id: "round-new" },
      warnings: [],
    });
    expect(prisma.rounds.create).toHaveBeenCalledWith({
      data: {
        olympiad_id: "oly-1",
        name: "Round 1",
        notes: "Bring pencils",
        opens_at: new Date("2026-06-01T08:00:00Z"),
        closes_at: new Date("2026-06-01T10:00:00Z"),
        qualifying_threshold: 60,
      },
    });
  });

  it.each([undefined, ""])("stores no threshold when it is %p", async (qualifyingThreshold) => {
    await createRound(input({ qualifyingThreshold }));
    expect(prisma.rounds.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qualifying_threshold: null }) }),
    );
  });
});

describe("listRounds", () => {
  it("lists the olympiad's rounds by opening time for its owner", async () => {
    prisma.olympiads.findUnique.mockResolvedValue(ownedOlympiad);
    prisma.rounds.findMany.mockResolvedValue([{ id: "r1" }]);

    await expect(listRounds("oly-1", "org-1")).resolves.toEqual([{ id: "r1" }]);
    expect(prisma.rounds.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { olympiad_id: "oly-1" }, orderBy: { opens_at: "asc" } }),
    );
  });
});

describe("getRound", () => {
  it("rejects an unknown round", async () => {
    prisma.rounds.findUnique.mockResolvedValue(null);
    await expect(getRound("x", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an organiser who doesn't own it", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await expect(getRound("round-1", "org-2")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns the round to its owner", async () => {
    const r = storedRound();
    prisma.rounds.findUnique.mockResolvedValue(r);
    await expect(getRound("round-1", "org-1")).resolves.toBe(r);
  });
});

describe("public holiday warnings", () => {
  const input = (overrides = {}) => ({
    olympiadId: "oly-1",
    organiserId: "org-1",
    name: "Round 1",
    opensAt: "2026-06-01T08:00:00Z",
    closesAt: "2026-06-01T10:00:00Z",
    ...overrides,
  });

  beforeEach(() => {
    prisma.olympiads.findUnique.mockResolvedValue(ownedOlympiad);
    checkDatesForHolidays.mockReset().mockResolvedValue([]);
  });

  it("returns a warning when a round starts or ends on a public holiday", async () => {
    checkDatesForHolidays.mockResolvedValue(["2026-06-16 falls on a public holiday: Youth Day"]);
    prisma.rounds.create.mockResolvedValue({ id: "round-new" });

    const result = await createRound(input());

    expect(result.warnings).toEqual(["2026-06-16 falls on a public holiday: Youth Day"]);
    // Checked on the olympiad's own calendar
    expect(checkDatesForHolidays).toHaveBeenCalledWith(
      [new Date("2026-06-01T08:00:00Z"), new Date("2026-06-01T10:00:00Z")],
      "Africa/Johannesburg",
    );
    // The round is still created; the warning is advice, not a refusal
    expect(prisma.rounds.create).toHaveBeenCalled();
  });

  it("warns on the dates an edit moves a round to", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    prisma.rounds.update.mockResolvedValue({ id: "round-1" });
    checkDatesForHolidays.mockResolvedValue(["2026-12-16 falls on a public holiday: Day of Reconciliation"]);

    const result = await updateRound("round-1", "org-1", { name: "Final" });

    expect(result).toEqual({
      round: { id: "round-1" },
      warnings: ["2026-12-16 falls on a public holiday: Day of Reconciliation"],
    });
    expect(checkDatesForHolidays).toHaveBeenCalledWith(expect.any(Array), "Africa/Johannesburg");
  });
});

describe("updateRound", () => {
  it("refuses to edit a round that has already opened", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "open" }));
    await expect(updateRound("round-1", "org-1", { name: "x" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Only a round that hasn't opened yet can be edited",
    });
  });

  it("updates just the name without touching the schedule", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await updateRound("round-1", "org-1", { name: "Final" });
    expect(prisma.rounds.update).toHaveBeenCalledWith({ where: { id: "round-1" }, data: { name: "Final" } });
  });

  it.each([
    ["", null],
    [null, null],
    [75, 75],
  ])("stores threshold %p as %p", async (qualifyingThreshold, stored) => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await updateRound("round-1", "org-1", { qualifyingThreshold });
    expect(prisma.rounds.update).toHaveBeenCalledWith({
      where: { id: "round-1" },
      data: { qualifying_threshold: stored },
    });
  });

  it("validates a new close time against the existing open time", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await expect(
      updateRound("round-1", "org-1", { closesAt: "2026-06-01T07:59:00Z" }),
    ).rejects.toMatchObject({ message: "closes_at must be after opens_at" });
  });

  it("rejects an unparseable new date", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await expect(updateRound("round-1", "org-1", { opensAt: "soon" })).rejects.toMatchObject({
      message: "opens_at and closes_at must be valid dates",
    });
  });

  it("saves both dates when one of them changes", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await updateRound("round-1", "org-1", { closesAt: "2026-06-01T12:00:00Z" });
    expect(prisma.rounds.update).toHaveBeenCalledWith({
      where: { id: "round-1" },
      data: {
        opens_at: new Date("2026-06-01T08:00:00Z"),
        closes_at: new Date("2026-06-01T12:00:00Z"),
      },
    });
  });
});

describe("deleteRound", () => {
  it("deletes a round that hasn't opened", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await deleteRound("round-1", "org-1");
    expect(prisma.rounds.delete).toHaveBeenCalledWith({ where: { id: "round-1" } });
  });

  it("removes the round's paper and registrations with it, in one transaction", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound());
    await deleteRound("round-1", "org-1");
    expect(prisma.entrant_registrations.deleteMany).toHaveBeenCalledWith({ where: { round_id: "round-1" } });
    expect(prisma.papers.deleteMany).toHaveBeenCalledWith({ where: { round_id: "round-1" } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("refuses to delete a round that has opened", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "closed" }));
    await expect(deleteRound("round-1", "org-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.rounds.delete).not.toHaveBeenCalled();
    expect(prisma.papers.deleteMany).not.toHaveBeenCalled();
  });
});

describe("setRoundState", () => {
  it.each([
    ["scheduled", "open"],
    ["open", "closed"],
    ["closed", "marking"],
    ["marking", "results_released"],
  ])("allows %s → %s", async (from, to) => {
    prisma.rounds.findUnique.mockResolvedValueOnce(storedRound({ state: from }));
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: to }));
    prisma.rounds.update.mockResolvedValue({ id: "round-1", state: to });
    autoMarkRoundInternal.mockResolvedValue({ total: 0 });
    generateResults.mockResolvedValue({ state: "results_released" });

    if (to === "results_released") {
      await expect(setRoundState("round-1", "org-1", to)).resolves.toMatchObject({ id: "round-1", state: to });
      expect(generateResults).toHaveBeenCalledWith("round-1", "org-1", "organiser");
      expect(prisma.rounds.update).not.toHaveBeenCalled();
    } else {
      await expect(setRoundState("round-1", "org-1", to)).resolves.toEqual({ id: "round-1", state: to });
      expect(prisma.rounds.update).toHaveBeenCalledWith({ where: { id: "round-1" }, data: { state: to } });
    }
  });

  it.each([
    ["scheduled", "closed"],
    ["open", "scheduled"],
    ["closed", "open"],
    ["marking", "closed"],
    ["results_released", "open"],
  ])("rejects %s → %s", async (from, to) => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: from }));
    await expect(setRoundState("round-1", "org-1", to)).rejects.toMatchObject({
      statusCode: 400,
      message: `Cannot transition from "${from}" to "${to}"`,
    });
    expect(prisma.rounds.update).not.toHaveBeenCalled();
  });

  it("routes manual release through the results service", async () => {
    prisma.rounds.findUnique.mockResolvedValueOnce(storedRound({ state: "marking" }));
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "results_released" }));
    generateResults.mockResolvedValue({ state: "results_released" });
    await setRoundState("round-1", "org-1", "results_released");
    expect(generateResults).toHaveBeenCalledWith("round-1", "org-1", "organiser");
  });

  it("auto-marks submissions when the round is closed", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "open" }));
    autoMarkRoundInternal.mockResolvedValue({ total: 4 });

    await setRoundState("round-1", "org-1", "closed");
    expect(autoMarkRoundInternal).toHaveBeenCalledWith("round-1");
    expect(prisma.papers.updateMany).not.toHaveBeenCalled();
  });

  it("still closes the round if auto-marking fails", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "open" }));
    prisma.rounds.update.mockResolvedValue({ state: "closed" });
    autoMarkRoundInternal.mockRejectedValue(new Error("marking crashed"));

    await expect(setRoundState("round-1", "org-1", "closed")).resolves.toEqual({ state: "closed" });
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("marking crashed"));
  });

  it("does not auto-mark on other transitions", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "scheduled" }));
    await setRoundState("round-1", "org-1", "open");
    expect(autoMarkRoundInternal).not.toHaveBeenCalled();
  });
});
