const { DEFAULT_TIMEZONE, isValidTimeZone, localDate, formatInTimeZone } = require("../../../src/utils/timezones");

describe("isValidTimeZone", () => {
  it.each(["Africa/Johannesburg", "Europe/London", "Asia/Kolkata", "UTC"])("accepts %s", (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each([["a made-up zone", "Mars/Olympus"], ["an offset", "+02:00"], ["an empty string", ""], ["a number", 2], ["nothing", undefined]])(
    "rejects %s",
    (_label, zone) => {
      expect(isValidTimeZone(zone)).toBe(false);
    },
  );

  it("defaults to South African time", () => {
    expect(DEFAULT_TIMEZONE).toBe("Africa/Johannesburg");
  });
});

describe("localDate", () => {
  it("gives the calendar date in the olympiad's timezone, not UTC's", () => {
    // 00:30 on 16 June in Johannesburg is still 15 June in UTC
    const instant = new Date("2026-06-15T22:30:00Z");
    expect(localDate(instant, "Africa/Johannesburg")).toBe("2026-06-16");
    expect(localDate(instant, "UTC")).toBe("2026-06-15");
  });

  it("uses South African time when no zone is given", () => {
    expect(localDate(new Date("2026-06-15T22:30:00Z"))).toBe("2026-06-16");
  });
});

describe("formatInTimeZone", () => {
  it("writes the time in the zone, labelled", () => {
    const instant = new Date("2026-10-01T12:00:00Z");
    expect(formatInTimeZone(instant, "Africa/Johannesburg")).toBe("01 Oct 2026, 14:00 SAST");
    expect(formatInTimeZone(instant, "UTC")).toBe("01 Oct 2026, 12:00 UTC");
  });

  it("follows daylight saving", () => {
    expect(formatInTimeZone(new Date("2026-07-01T12:00:00Z"), "Europe/London")).toBe("01 Jul 2026, 13:00 GMT+1");
    expect(formatInTimeZone(new Date("2026-12-01T12:00:00Z"), "Europe/London")).toBe("01 Dec 2026, 12:00 GMT");
  });
});
