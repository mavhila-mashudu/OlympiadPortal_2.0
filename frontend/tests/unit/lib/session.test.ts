import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("../../../src/lib/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({ auth: { signOut } })),
}));
vi.mock("../../../src/lib/student", () => ({ clearStudentProfile: vi.fn() }));

import { clearStudentProfile } from "../../../src/lib/student";
import { getSupabaseClient } from "../../../src/lib/supabase";
import { endLocalSession, logout, readSession, startSession } from "../../../src/lib/session";

// A JWT whose "exp" claim is the given moment
const jwtExpiringAt = (date: Date) =>
  `header.${btoa(JSON.stringify({ exp: Math.floor(date.getTime() / 1000) })).replace(/=+$/, "")}.signature`;

let requests: { method: string; path: string; authorization: string | null }[];

beforeEach(() => {
  localStorage.clear();
  signOut.mockReset().mockResolvedValue({ error: null });
  vi.mocked(getSupabaseClient).mockImplementation(() => ({ auth: { signOut } }) as never);
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? "GET",
      path: new URL(url).pathname,
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    return new Response(JSON.stringify({ success: true, data: { message: "Logged out" } }));
  }));
});

describe("readSession", () => {
  it("is active with a token and a role", () => {
    startSession("jwt", "educator");
    expect(readSession()).toEqual({ status: "active", token: "jwt", role: "educator" });
  });

  it("is none without a token or a known role", () => {
    expect(readSession()).toEqual({ status: "none" });
    localStorage.setItem("op_access_token", "jwt");
    expect(readSession()).toEqual({ status: "none" });
    localStorage.setItem("op_role", "admin");
    expect(readSession()).toEqual({ status: "none" });
  });

  it("is expired once the token's exp has passed", () => {
    startSession(jwtExpiringAt(new Date(Date.now() - 1000)), "organiser");
    expect(readSession()).toEqual({ status: "expired" });

    startSession(jwtExpiringAt(new Date(Date.now() + 60_000)), "organiser");
    expect(readSession()).toMatchObject({ status: "active" });
  });
});

describe("endLocalSession", () => {
  it("forgets the token, role, cached profile, exam progress and Supabase's copy of the session", async () => {
    startSession("jwt", "student");
    localStorage.setItem("exam-answers-round-1", "{}");
    localStorage.setItem("exam-flags-round-1", "[]");
    localStorage.setItem("sb-project-auth-token", "{\"refresh_token\":\"r\"}");
    localStorage.setItem("theme", "dark");

    await endLocalSession();

    expect(clearStudentProfile).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(Object.keys(localStorage)).toEqual(["theme"]);
  });

  it("still forgets everything when Supabase fails or isn't configured", async () => {
    startSession("jwt", "student");
    localStorage.setItem("sb-project-auth-token", "{}");
    signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    await endLocalSession();
    expect(Object.keys(localStorage)).toEqual([]);

    startSession("jwt", "student");
    vi.mocked(getSupabaseClient).mockImplementation(() => {
      throw new Error("Supabase frontend environment variables are missing");
    });
    await endLocalSession();
    expect(Object.keys(localStorage)).toEqual([]);
  });
});

describe("logout", () => {
  it("ends the session on the server with its token, then forgets it here", async () => {
    startSession("jwt-thandi", "organiser");

    await logout();

    expect(requests).toEqual([{ method: "POST", path: "/auth/logout", authorization: "Bearer jwt-thandi" }]);
    expect(readSession()).toEqual({ status: "none" });
  });

  it("still logs out when the server can't be reached", async () => {
    startSession("jwt", "organiser");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    await logout();
    expect(readSession()).toEqual({ status: "none" });
  });

  it("doesn't call the server when nobody is signed in", async () => {
    await logout();
    expect(requests).toEqual([]);
  });
});
