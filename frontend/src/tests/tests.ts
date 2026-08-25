import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken } from "../lib/api";
import { generateInviteCode } from "../lib/utils";
import {
  olympiads,
  rounds,
  organiserNav,
  educatorNav,
  studentNav,
  stats,
  archiveEntries,
  schools,
  resultRows,
  educatorRoundDetails,
  studentRounds,
  studentResults,
  type RoundStatus,
  type OlympiadStatus,
} from "../lib/mockData";

// ═══════════════════════════════════════════════════════════
//  1. TOKEN MANAGEMENT (lib/api.ts)
// ═══════════════════════════════════════════════════════════
describe("Token management (api.ts)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("stores and retrieves a token", () => {
    setToken("abc123");
    expect(getToken()).toBe("abc123");
  });

  it("overwrites an existing token", () => {
    setToken("first");
    setToken("second");
    expect(getToken()).toBe("second");
  });

  it("removes the token on clearToken", () => {
    setToken("abc123");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("stores the token under the correct localStorage key", () => {
    setToken("xyz");
    expect(localStorage.getItem("op_access_token")).toBe("xyz");
  });

  it("clearToken is safe to call when no token exists", () => {
    expect(() => clearToken()).not.toThrow();
    expect(getToken()).toBeNull();
  });

  it("handles empty string token", () => {
    setToken("");
    expect(getToken()).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════
//  2. INVITATION CODE GENERATOR (lib/utils.ts)
// ═══════════════════════════════════════════════════════════
describe("generateInviteCode (utils.ts)", () => {
  const VALID_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

  it("matches the SCH-XXXX-XXXX format", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^SCH-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("uses only unambiguous characters (no 0, O, 1, I, L)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      const parts = code.replace("SCH-", "");
      for (const ch of parts) {
        if (ch === "-") continue;
        expect(VALID_CHARS).toContain(ch);
      }
    }
  });

  it("generates unique codes", () => {
    const codes = new Set(
      Array.from({ length: 30 }, () => generateInviteCode()),
    );
    expect(codes.size).toBe(30);
  });

  it("always starts with SCH-", () => {
    for (let i = 0; i < 10; i++) {
      expect(generateInviteCode().startsWith("SCH-")).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  3. SUPABASE CLIENT (lib/supabase.ts)
// ═══════════════════════════════════════════════════════════
describe("Supabase client (supabase.ts)", () => {
  it("module exports getSupabaseClient function", async () => {
    const mod = await import("../lib/supabase");
    expect(typeof mod.getSupabaseClient).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════
//  4. MOCK DATA STRUCTURE VALIDATION (lib/mockData.ts)
// ═══════════════════════════════════════════════════════════
describe("Mock data — olympiads", () => {
  it("contains at least one olympiad", () => {
    expect(olympiads.length).toBeGreaterThan(0);
  });

  it("every olympiad has required fields", () => {
    const validStatuses: OlympiadStatus[] = [
      "active",
      "draft",
      "archived",
      "completed",
    ];
    for (const ol of olympiads) {
      expect(ol.id).toBeTruthy();
      expect(ol.name).toBeTruthy();
      expect(typeof ol.year).toBe("number");
      expect(validStatuses).toContain(ol.status);
    }
  });

  it("includes at least one active olympiad", () => {
    expect(olympiads.some((ol) => ol.status === "active")).toBe(true);
  });
});

describe("Mock data — rounds", () => {
  it("contains at least one round", () => {
    expect(rounds.length).toBeGreaterThan(0);
  });

  it("every round has required fields", () => {
    const validStatuses: RoundStatus[] = ["closed", "open", "upcoming"];
    for (const r of rounds) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.opens).toBeTruthy();
      expect(r.closes).toBeTruthy();
      expect(validStatuses).toContain(r.status);
      expect(typeof r.schools).toBe("number");
      expect(typeof r.submissions).toBe("number");
    }
  });

  it("includes rounds in each status", () => {
    const statuses = new Set(rounds.map((r) => r.status));
    expect(statuses.has("closed")).toBe(true);
    expect(statuses.has("open")).toBe(true);
    expect(statuses.has("upcoming")).toBe(true);
  });
});

describe("Mock data — navigation arrays", () => {
  it("organiserNav has entries with label, to, and icon", () => {
    expect(organiserNav.length).toBeGreaterThan(0);
    for (const item of organiserNav) {
      expect(item.label).toBeTruthy();
      expect(item.to).toMatch(/^\//);
      expect(item.icon).toBeDefined();
    }
  });

  it("educatorNav has entries with label, to, and icon", () => {
    expect(educatorNav.length).toBeGreaterThan(0);
    for (const item of educatorNav) {
      expect(item.label).toBeTruthy();
      expect(item.to).toMatch(/^\//);
      expect(item.icon).toBeDefined();
    }
  });

  it("studentNav has entries with label, to, and icon", () => {
    expect(studentNav.length).toBeGreaterThan(0);
    for (const item of studentNav) {
      expect(item.label).toBeTruthy();
      expect(item.to).toMatch(/^\//);
      expect(item.icon).toBeDefined();
    }
  });
});

describe("Mock data — stats", () => {
  it("contains stat cards", () => {
    expect(stats.length).toBeGreaterThan(0);
  });

  it("every stat has label, value, helper, and icon", () => {
    for (const s of stats) {
      expect(s.label).toBeTruthy();
      expect(s.value).toBeTruthy();
      expect(s.helper).toBeTruthy();
      expect(s.icon).toBeDefined();
    }
  });
});

describe("Mock data — archiveEntries", () => {
  it("contains entries", () => {
    expect(archiveEntries.length).toBeGreaterThan(0);
  });

  it("every entry has id, round, closed, paper, and memo", () => {
    for (const a of archiveEntries) {
      expect(a.id).toBeTruthy();
      expect(a.round).toBeTruthy();
      expect(a.closed).toBeTruthy();
      expect(a.paper).toMatch(/\.pdf$/);
      expect(a.memo).toMatch(/\.pdf$/);
    }
  });
});

describe("Mock data — schools", () => {
  it("contains schools", () => {
    expect(schools.length).toBeGreaterThan(0);
  });

  it("every school has name, district, entrants count, and educators", () => {
    for (const s of schools) {
      expect(s.name).toBeTruthy();
      expect(s.district).toBeTruthy();
      expect(typeof s.entrants).toBe("number");
      expect(s.entrants).toBeGreaterThan(0);
      expect(Array.isArray(s.educators)).toBe(true);
      expect(s.educators.length).toBeGreaterThan(0);
    }
  });

  it("every educator has name, role, and email", () => {
    for (const s of schools) {
      for (const e of s.educators) {
        expect(e.name).toBeTruthy();
        expect(e.role).toBeTruthy();
        expect(e.email).toMatch(/@/);
      }
    }
  });
});

describe("Mock data — resultRows", () => {
  it("contains result rows", () => {
    expect(resultRows.length).toBeGreaterThan(0);
  });

  it("ranks are in ascending order", () => {
    for (let i = 1; i < resultRows.length; i++) {
      expect(resultRows[i].rank).toBeGreaterThan(resultRows[i - 1].rank);
    }
  });

  it("every row has required fields", () => {
    for (const r of resultRows) {
      expect(typeof r.rank).toBe("number");
      expect(r.name).toBeTruthy();
      expect(r.studentNumber).toBeTruthy();
      expect(typeof r.grade).toBe("number");
      expect(r.score).toBeTruthy();
      expect(r.percentage).toMatch(/%$/);
    }
  });
});

describe("Mock data — educatorRoundDetails", () => {
  it("contains round details", () => {
    expect(educatorRoundDetails.length).toBeGreaterThan(0);
  });

  it("every entry has paper and memo file references", () => {
    for (const r of educatorRoundDetails) {
      expect(r.paperFile).toMatch(/\.pdf$/);
      expect(r.memoFile).toMatch(/\.pdf$/);
      expect(typeof r.hasSubmitted).toBe("boolean");
    }
  });
});

describe("Mock data — studentRounds", () => {
  it("contains student rounds", () => {
    expect(studentRounds.length).toBeGreaterThan(0);
  });

  it("closed rounds with results have score data", () => {
    const closedWithResult = studentRounds.filter(
      (r) => r.status === "closed" && r.result,
    );
    expect(closedWithResult.length).toBeGreaterThan(0);
    for (const r of closedWithResult) {
      expect(r.result!.score).toBeTruthy();
      expect(r.result!.percentage).toMatch(/%$/);
      expect(typeof r.result!.rankInSchool).toBe("number");
    }
  });
});

describe("Mock data — studentResults", () => {
  it("contains result entries", () => {
    expect(studentResults.length).toBeGreaterThan(0);
  });

  it("result status is either released or pending", () => {
    for (const r of studentResults) {
      expect(["released", "pending"]).toContain(r.resultStatus);
    }
  });

  it("released results have a score", () => {
    const released = studentResults.filter(
      (r) => r.resultStatus === "released",
    );
    expect(released.length).toBeGreaterThan(0);
    for (const r of released) {
      expect(r.score).not.toBe("—");
      expect(r.percentage).not.toBe("—");
    }
  });
});
