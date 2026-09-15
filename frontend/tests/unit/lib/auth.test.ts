import { describe, expect, it } from "vitest";
import { dashboardForRole } from "../../../src/lib/auth";

describe("dashboardForRole", () => {
  it.each([
    ["organiser", "/organiser"],
    ["educator", "/educator"],
    ["student", "/student"],
  ] as const)("sends a %s to %s", (role, path) => {
    expect(dashboardForRole(role)).toBe(path);
  });
});
