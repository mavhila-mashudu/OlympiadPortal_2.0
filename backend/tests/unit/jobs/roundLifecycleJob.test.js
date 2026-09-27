jest.mock("../../../src/services/lifecycleService", () => ({
  runLifecycleTick: jest.fn(),
}));

jest.mock("../../../src/services/notificationDeliveryService", () => ({
  deliverDueNotifications: jest.fn().mockResolvedValue(0),
}));

// The interval is read once at load time and the timer is module state, so
// each test loads a fresh copy of the job.
const loadJob = (intervalEnv) => {
  jest.resetModules();
  if (intervalEnv === undefined) delete process.env.LIFECYCLE_INTERVAL_MS;
  else process.env.LIFECYCLE_INTERVAL_MS = intervalEnv;
  return {
    job: require("../../../src/jobs/roundLifecycleJob"),
    runLifecycleTick: require("../../../src/services/lifecycleService").runLifecycleTick,
  };
};

const originalInterval = process.env.LIFECYCLE_INTERVAL_MS;
let consoleLog;
let consoleError;
let current;

beforeEach(() => {
  jest.useFakeTimers();
  consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  current?.job.stop();
  jest.useRealTimers();
  consoleLog.mockRestore();
  consoleError.mockRestore();
  if (originalInterval === undefined) delete process.env.LIFECYCLE_INTERVAL_MS;
  else process.env.LIFECYCLE_INTERVAL_MS = originalInterval;
});

describe("roundLifecycleJob", () => {
  it("runs a tick every 30 seconds by default", async () => {
    current = loadJob();
    current.runLifecycleTick.mockResolvedValue({});

    current.job.start();
    expect(current.runLifecycleTick).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_000);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(3);
  });

  it("uses LIFECYCLE_INTERVAL_MS when set", async () => {
    current = loadJob("5000");
    current.runLifecycleTick.mockResolvedValue({});

    current.job.start();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(1);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("every 5s"));
  });

  it("falls back to 30 seconds for an invalid interval", async () => {
    current = loadJob("not-a-number");
    current.runLifecycleTick.mockResolvedValue({});

    current.job.start();
    await jest.advanceTimersByTimeAsync(29_999);
    expect(current.runLifecycleTick).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(1);
  });

  it("ignores a second start instead of running two timers", async () => {
    current = loadJob();
    current.runLifecycleTick.mockResolvedValue({});

    current.job.start();
    current.job.start();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(1);
  });

  it("logs a failed tick and keeps running", async () => {
    current = loadJob();
    current.runLifecycleTick.mockRejectedValueOnce(new Error("db dropped")).mockResolvedValue({});

    current.job.start();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(consoleError).toHaveBeenCalledWith("[lifecycle] tick failed:", "db dropped");

    await jest.advanceTimersByTimeAsync(30_000);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(2);
  });

  it("stops ticking after stop, and can start again", async () => {
    current = loadJob();
    current.runLifecycleTick.mockResolvedValue({});

    current.job.start();
    current.job.stop();
    await jest.advanceTimersByTimeAsync(90_000);
    expect(current.runLifecycleTick).not.toHaveBeenCalled();

    current.job.start();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(current.runLifecycleTick).toHaveBeenCalledTimes(1);
  });

  it("allows stop to be called when the job isn't running", () => {
    current = loadJob();
    expect(() => current.job.stop()).not.toThrow();
  });

  it("doesn't keep the process alive on its own", () => {
    current = loadJob();
    const unref = jest.fn();
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue({ unref });

    current.job.start();
    expect(unref).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    // The "timer" here is a stub, so skip stop(); this module copy is discarded
    current = null;
  });
});
