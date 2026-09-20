import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EducatorRound } from "../../../../src/lib/educatorApi";
import {
  getCountdown,
  getRoundNote,
  getSecondaryAction,
} from "../../../../src/pages/educator/dashboardHelpers";

const round = (overrides: Partial<EducatorRound> = {}): EducatorRound => ({
  id: "r1",
  name: "Round 1",
  olympiad_id: "o1",
  olympiad_name: "Maths",
  opens_at: "2026-06-01T08:00:00Z",
  closes_at: "2026-06-01T10:00:00Z",
  state: "open",
  status: "open",
  has_paper: true,
  submission_count: 0,
  entrant_count: 10,
  ...overrides,
});

describe("getCountdown", () => {
  const NOW = new Date("2026-06-01T08:00:00Z");
  const inFuture = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["a time in the past", inFuture(-MIN)],
    ["right now", inFuture(0)],
  ])("is empty for %s", (_label, iso) => {
    expect(getCountdown(iso)).toBe("");
  });

  it("shows days and hours when more than a day away", () => {
    expect(getCountdown(inFuture(3 * DAY + 5 * HOUR + 59 * MIN))).toBe("3d 5h");
  });

  it("shows hours and minutes when under a day away", () => {
    expect(getCountdown(inFuture(7 * HOUR + 12 * MIN))).toBe("7h 12m");
  });

  it("shows zero hours when under an hour away", () => {
    expect(getCountdown(inFuture(45 * MIN))).toBe("0h 45m");
  });
});

describe("getRoundNote", () => {
  it.each([
    ["an open round without a submission", { status: "open", submission_count: 0 }, "Closes in"],
    ["an open round with a submission", { status: "open", submission_count: 2 }, "Submission received"],
    ["an upcoming round", { status: "upcoming", submission_count: 0 }, "Opens in"],
    ["a closed round without a submission", { status: "closed", submission_count: 0 }, "Closed"],
    ["a closed round with a submission", { status: "closed", submission_count: 1 }, "Submission received"],
  ] as const)("labels %s as '%s'", (_label, overrides, note) => {
    expect(getRoundNote(round(overrides))).toBe(note);
  });
});

describe("getSecondaryAction", () => {
  it.each([
    ["closed", "View results"],
    ["upcoming", "Register entrants"],
    ["open", null],
  ] as const)("offers %s rounds: %p", (status, action) => {
    expect(getSecondaryAction(round({ status }))).toBe(action);
  });
});
