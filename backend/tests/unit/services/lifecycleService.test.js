jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));
jest.mock("../../../src/services/markingService", () => ({
  autoMarkRoundInternal: jest.fn(),
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const { autoMarkRoundInternal } = require("../../../src/services/markingService");
const { runLifecycleTick } = require("../../../src/services/lifecycleService");

const NOW = new Date("2026-06-01T09:00:00Z");

let consoleLog;
let consoleError;
beforeEach(() => {
  resetPrismaMock();
  prisma.rounds.updateMany.mockResolvedValue({ count: 1 });
  autoMarkRoundInternal.mockReset().mockResolvedValue({ total: 0 });
  jest.useFakeTimers().setSystemTime(NOW);
  consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  consoleLog.mockRestore();
  consoleError.mockRestore();
});

// findMany is called twice per tick: first for rounds to open, then for rounds to close
const arrange = ({ toOpen = [], toClose = [] }) => {
  prisma.rounds.findMany.mockResolvedValueOnce(toOpen).mockResolvedValueOnce(toClose);
};

describe("runLifecycleTick", () => {
  it("does nothing when no round is due", async () => {
    arrange({});
    await expect(runLifecycleTick()).resolves.toEqual({ opened: 0, closed: 0 });
    expect(prisma.rounds.updateMany).not.toHaveBeenCalled();
    expect(autoMarkRoundInternal).not.toHaveBeenCalled();
  });

  it("looks for scheduled rounds past their open time and open rounds past their close time", async () => {
    arrange({});
    await runLifecycleTick();
    expect(prisma.rounds.findMany).toHaveBeenNthCalledWith(1, {
      where: { state: "scheduled", opens_at: { lte: NOW } },
      select: { id: true, name: true, olympiad_id: true },
    });
    expect(prisma.rounds.findMany).toHaveBeenNthCalledWith(2, {
      where: { state: "open", closes_at: { lte: NOW } },
      select: { id: true, name: true, olympiad_id: true },
    });
  });

  it("opens each due round and logs the transition", async () => {
    arrange({ toOpen: [{ id: "r1", name: "A" }, { id: "r2", name: "B" }] });
    await expect(runLifecycleTick()).resolves.toEqual({ opened: 2, closed: 0 });
    expect(prisma.rounds.updateMany).toHaveBeenCalledWith({ where: { id: "r1", state: "scheduled", opens_at: { lte: NOW } }, data: { state: "open" } });
    expect(prisma.round_events.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ kind: "round_opened" })] }));
  });

  it("closes due rounds and auto-marks each one", async () => {
    arrange({ toClose: [{ id: "r3", name: "C" }, { id: "r4", name: "D" }] });
    await expect(runLifecycleTick()).resolves.toEqual({ opened: 0, closed: 2 });
    expect(prisma.rounds.updateMany).toHaveBeenCalledWith({ where: { id: "r3", state: "open", closes_at: { lte: NOW } }, data: { state: "closed" } });
    expect(autoMarkRoundInternal.mock.calls).toEqual([["r3"], ["r4"]]);
  });

  it("keeps marking the other rounds if one fails", async () => {
    arrange({ toClose: [{ id: "r3", name: "C" }, { id: "r4", name: "D" }] });
    autoMarkRoundInternal.mockRejectedValueOnce(new Error("bad data")).mockResolvedValueOnce({ total: 1 });

    await expect(runLifecycleTick()).resolves.toEqual({ opened: 0, closed: 2 });
    expect(autoMarkRoundInternal).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("bad data"));
  });

  it("opens and closes in the same tick", async () => {
    arrange({ toOpen: [{ id: "r1", name: "A" }], toClose: [{ id: "r2", name: "B" }] });
    await expect(runLifecycleTick()).resolves.toEqual({ opened: 1, closed: 1 });
    expect(prisma.rounds.updateMany).toHaveBeenCalledTimes(2);
  });
});
