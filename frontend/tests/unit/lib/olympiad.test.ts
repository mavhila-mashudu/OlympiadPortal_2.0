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

  it("returns nothing for an organiser who has none, so the page can prompt them", async () => {
    get.mockResolvedValue({ olympiads: [] });

    await expect(getCurrentOlympiad()).resolves.toBeNull();
    // Nothing is created behind the organiser's back
    expect(post).not.toHaveBeenCalled();
  });

  it("propagates an API failure", async () => {
    get.mockRejectedValue(new Error("Not authenticated"));
    await expect(getCurrentOlympiad()).rejects.toThrow("Not authenticated");
  });
});
