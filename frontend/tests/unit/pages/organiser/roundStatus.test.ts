import { describe, expect, it } from "vitest";
import { toBadgeStatus } from "../../../../src/pages/organiser/roundStatus";

describe("toBadgeStatus", () => {
  it.each([
    ["scheduled", "upcoming"],
    ["open", "open"],
    ["closed", "closed"],
    ["marking", "closed"],
    ["results_released", "closed"],
  ] as const)("shows a %s round as %s", (state, badge) => {
    expect(toBadgeStatus(state)).toBe(badge);
  });
});
