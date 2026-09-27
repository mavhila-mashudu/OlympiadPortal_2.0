import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  formatDateInZone,
  formatDateTimeInZone,
  isoToZonedInput,
  timeZoneLabel,
  zonedInputToIso,
} from "../../../src/lib/time";

describe("zonedInputToIso", () => {
  it("reads the typed time as the olympiad's local time", () => {
    // 14:00 in Johannesburg (UTC+2) is 12:00 UTC, not 14:00 UTC
    expect(zonedInputToIso("2026-10-01T14:00", "Africa/Johannesburg")).toBe("2026-10-01T12:00:00.000Z");
    expect(zonedInputToIso("2026-10-01T14:00", "UTC")).toBe("2026-10-01T14:00:00.000Z");
    expect(zonedInputToIso("2026-10-01T14:00", "Asia/Kolkata")).toBe("2026-10-01T08:30:00.000Z");
  });

  it("crosses midnight into the previous UTC day", () => {
    expect(zonedInputToIso("2026-06-16T00:30", "Africa/Johannesburg")).toBe("2026-06-15T22:30:00.000Z");
  });

  it("follows daylight saving", () => {
    expect(zonedInputToIso("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedInputToIso("2026-12-01T09:00", "Europe/London")).toBe("2026-12-01T09:00:00.000Z");
    // The day the clocks go back (25 October 2026): 09:00 is after the change
    expect(zonedInputToIso("2026-10-25T09:00", "Europe/London")).toBe("2026-10-25T09:00:00.000Z");
  });

  it("treats a missing time as midnight", () => {
    expect(zonedInputToIso("2026-10-01", "Africa/Johannesburg")).toBe("2026-09-30T22:00:00.000Z");
  });

  it("doesn't depend on the device's own timezone", () => {
    // Same answer whatever process.env.TZ is; only the olympiad's zone counts
    const zones = ["Africa/Johannesburg", "Europe/London", "Asia/Kolkata"];
    for (const zone of zones) {
      expect(isoToZonedInput(zonedInputToIso("2026-03-10T08:15", zone), zone)).toBe("2026-03-10T08:15");
    }
  });
});

describe("isoToZonedInput", () => {
  it("shows a stored instant as the olympiad's local time, for editing", () => {
    expect(isoToZonedInput("2026-10-01T12:00:00.000Z", "Africa/Johannesburg")).toBe("2026-10-01T14:00");
    expect(isoToZonedInput("2026-06-15T22:30:00.000Z", "Africa/Johannesburg")).toBe("2026-06-16T00:30");
  });
});

describe("formatting", () => {
  it("labels a time with the zone", () => {
    expect(formatDateTimeInZone("2026-10-01T12:00:00.000Z", "Africa/Johannesburg")).toBe("01 Oct 2026, 14:00 SAST");
    expect(formatDateTimeInZone("2026-10-01T12:00:00.000Z", "UTC")).toBe("01 Oct 2026, 12:00 UTC");
  });

  it("gives the date on the olympiad's calendar", () => {
    expect(formatDateInZone("2026-06-15T22:30:00.000Z", "Africa/Johannesburg")).toBe("16 Jun 2026");
    expect(formatDateInZone("2026-06-15T22:30:00.000Z", "UTC")).toBe("15 Jun 2026");
  });

  it("names the zone for form labels", () => {
    expect(timeZoneLabel("Africa/Johannesburg")).toBe("SAST");
    expect(timeZoneLabel("Europe/London", new Date("2026-07-01T12:00:00Z"))).toBe("GMT+1");
  });
});

describe("timezone choices", () => {
  it("defaults to South Africa, which is listed first", () => {
    expect(DEFAULT_TIMEZONE).toBe("Africa/Johannesburg");
    expect(TIMEZONE_OPTIONS[0].value).toBe(DEFAULT_TIMEZONE);
  });

  it("only offers zones the browser can use", () => {
    for (const { value } of TIMEZONE_OPTIONS) {
      expect(() => new Intl.DateTimeFormat("en-ZA", { timeZone: value })).not.toThrow();
    }
  });
});
