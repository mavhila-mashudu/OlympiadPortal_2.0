import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "../../../src/lib/api";
import { getCurrentOlympiad } from "../../../src/lib/olympiad";

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

describe("getCurrentOlympiad", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("returns the organiser's first olympiad", async () => {
    const first = { id: "oly-1", name: "Maths", organiser_id: "org-1", created_at: "2026-01-01" };
    get.mockResolvedValue({ olympiads: [first, { ...first, id: "oly-2" }] });

    await expect(getCurrentOlympiad()).resolves.toBe(first);
    expect(get).toHaveBeenCalledWith("/olympiads");
    expect(post).not.toHaveBeenCalled();
  });

  it("creates a Demo Olympiad for an organiser who has none", async () => {
    const created = { id: "oly-new", name: "Demo Olympiad", organiser_id: "org-1", created_at: "2026-01-01" };
    get.mockResolvedValue({ olympiads: [] });
    post.mockResolvedValue({ olympiad: created });

    await expect(getCurrentOlympiad()).resolves.toBe(created);
    expect(post).toHaveBeenCalledWith("/olympiads", { name: "Demo Olympiad" });
  });

  it("propagates an API failure", async () => {
    get.mockRejectedValue(new Error("Not authenticated"));
    await expect(getCurrentOlympiad()).rejects.toThrow("Not authenticated");
  });
});
