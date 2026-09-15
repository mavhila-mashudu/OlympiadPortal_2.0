import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

// The client is cached in module state, so each test loads a fresh copy
const loadSupabase = async (env: { url?: string; key?: string }) => {
  vi.stubEnv("VITE_SUPABASE_URL", env.url ?? "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", env.key ?? "");
  vi.resetModules();
  const { createClient } = await import("@supabase/supabase-js");
  const module = await import("../../../src/lib/supabase");
  return { ...module, createClient: vi.mocked(createClient) };
};

describe("getSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["the URL", { key: "anon-key" }],
    ["the anon key", { url: "https://project.supabase.co" }],
  ])("throws a clear error when %s is missing", async (_label, env) => {
    const { getSupabaseClient, createClient } = await loadSupabase(env);
    expect(() => getSupabaseClient()).toThrow("Supabase frontend environment variables are missing");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates the client from the environment", async () => {
    const { getSupabaseClient, createClient } = await loadSupabase({
      url: "https://project.supabase.co",
      key: "anon-key",
    });

    const client = getSupabaseClient();
    expect(createClient).toHaveBeenCalledWith("https://project.supabase.co", "anon-key");
    expect(client).toEqual({ auth: {} });
  });

  it("reuses one client instead of creating a new one per call", async () => {
    const { getSupabaseClient, createClient } = await loadSupabase({
      url: "https://project.supabase.co",
      key: "anon-key",
    });

    const first = getSupabaseClient();
    const second = getSupabaseClient();
    expect(second).toBe(first);
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
