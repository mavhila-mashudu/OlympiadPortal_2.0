jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/services/markingService", () => ({
  autoMarkRoundInternal: jest.fn(),
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const { autoMarkRoundInternal } = require("../../../src/services/markingService");
const {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound,
  setRoundState,
} = require("../../../src/services/roundService");

const ownedOlympiad = { id: "oly-1", organiser_id: "org-1" };

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

    await expect(createRound(input({ qualifyingThreshold: 60 }))).resolves.toEqual({ id: "round-new" });
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
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: from }));
    prisma.rounds.update.mockResolvedValue({ id: "round-1", state: to });
    autoMarkRoundInternal.mockResolvedValue({ total: 0 });

    await expect(setRoundState("round-1", "org-1", to)).resolves.toEqual({ id: "round-1", state: to });
    expect(prisma.rounds.update).toHaveBeenCalledWith({ where: { id: "round-1" }, data: { state: to } });
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

  it("archives the round's papers when results are released", async () => {
    prisma.rounds.findUnique.mockResolvedValue(storedRound({ state: "marking" }));
    await setRoundState("round-1", "org-1", "results_released");
    expect(prisma.papers.updateMany).toHaveBeenCalledWith({
      where: { round_id: "round-1" },
      data: { is_archived: true, released_at: expect.any(Date) },
    });
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
