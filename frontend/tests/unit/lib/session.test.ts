import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("../../../src/lib/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({ auth: { signOut } })),
}));
vi.mock("../../../src/lib/student", () => ({ clearStudentProfile: vi.fn() }));

import { clearStudentProfile } from "../../../src/lib/student";
import { getSupabaseClient } from "../../../src/lib/supabase";
import { logout } from "../../../src/lib/session";

describe("logout", () => {
  beforeEach(() => {
    localStorage.clear();
    signOut.mockReset().mockResolvedValue({ error: null });
    vi.mocked(getSupabaseClient).mockImplementation(() => ({ auth: { signOut } }) as never);
  });

  it("forgets the token, the cached student profile and on-device exam progress", () => {
    localStorage.setItem("op_access_token", "jwt");
    localStorage.setItem("exam-answers-round-1", "{}");
    localStorage.setItem("exam-flags-round-1", "[]");
    localStorage.setItem("exam-answers-round-2", "{}");
    localStorage.setItem("theme", "dark");

    logout();

    expect(localStorage.getItem("op_access_token")).toBeNull();
    expect(clearStudentProfile).toHaveBeenCalled();
    expect(Object.keys(localStorage)).toEqual(["theme"]);
  });

  it("ends only this browser's Supabase session", () => {
    logout();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still signs the user out locally when Supabase fails or isn't configured", async () => {
    localStorage.setItem("op_access_token", "jwt");
    signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(() => logout()).not.toThrow();
    expect(localStorage.getItem("op_access_token")).toBeNull();

    localStorage.setItem("op_access_token", "jwt");
    vi.mocked(getSupabaseClient).mockImplementation(() => {
      throw new Error("Supabase frontend environment variables are missing");
    });
    expect(() => logout()).not.toThrow();
    expect(localStorage.getItem("op_access_token")).toBeNull();
  });
});
