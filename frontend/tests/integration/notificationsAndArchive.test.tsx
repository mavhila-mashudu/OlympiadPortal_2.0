import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fx from "./support/fixtures";
import { mockApi, mockApiError, mockNetworkFailure } from "./support/network";
import { renderApp } from "./support/renderApp";

// A notification_rules row as the backend returns it
const rule = (overrides: Record<string, unknown> = {}) => ({
  id: fx.id("rule"),
  olympiad_id: "oly-1",
  name: "Round opening reminder",
  trigger: "round_opens",
  offset_minutes: 60,
  recipient: "registered_educators",
  action: "notify_recipients",
  // The backend only creates in-app rules
  channel: "in_app",
  condition: null,
  enabled: true,
  created_at: "2026-01-10T08:00:00.000Z",
  ...overrides,
});

describe("announcement rules", () => {
  // Serves the rules list from a mutable array so writes show up on reload
  const mockRules = (initial: ReturnType<typeof rule>[]) => {
    const state = { rules: initial };
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/notification-rules", () => ({ rules: state.rules }));
    // The page also lists rounds, so a rule can be tested against one
    mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
    return state;
  };

  it("lists rules with readable trigger, recipients and timing", async () => {
    mockRules([
      rule({ name: "Opening reminder" }),
      rule({ name: "Results out", trigger: "results_released", recipient: "qualifying_entrants", offset_minutes: 0, condition: "Only rounds with submissions", enabled: false }),
    ]);
    renderApp("/organiser/notifications");

    const opening = (await screen.findByText("Opening reminder")).closest("tr")!;
    expect(within(opening).getAllByRole("cell").slice(1, 5).map((c) => c.textContent)).toEqual([
      "Round opens",
      "Registered educators",
      "60 min before",
      "Enabled",
    ]);
    const results = screen.getByText("Results out").closest("tr")!;
    expect(within(results).getByText("Only rounds with submissions")).toBeInTheDocument();
    expect(within(results).getByText("At trigger")).toBeInTheDocument();
    expect(within(results).getByRole("button", { name: "Enable" })).toBeInTheDocument();
    expect(screen.getByText("Send announcements for Maths Olympiad 2026.")).toBeInTheDocument();
  });

  it("creates a rule from the form, closes the form and shows it without an error", async () => {
    const state = mockRules([]);
    const creates = mockApi(
      "post",
      "/olympiads/oly-1/notification-rules",
      (req) => {
        const created = rule({ ...(req.body as object), id: "rule-new" });
        state.rules = [created];
        return { rule: created };
      },
      { status: 201 },
    );
    const { user } = renderApp("/organiser/notifications");

    expect(await screen.findByText("No announcements configured.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send announcement" }));
    await user.type(screen.getByLabelText("Announcement name"), "Closing soon");
    await user.selectOptions(screen.getByLabelText("Trigger"), "round_closes");
    await user.clear(screen.getByLabelText("Minutes before trigger"));
    await user.type(screen.getByLabelText("Minutes before trigger"), "30");
    await user.selectOptions(screen.getByLabelText("Recipients"), "registered_schools");
    await user.selectOptions(screen.getByLabelText("Condition (optional)"), "Only rounds with submissions");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    const row = (await screen.findByText("Closing soon")).closest("tr")!;
    expect(within(row).getByText("30 min before")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New in-app announcement" })).not.toBeInTheDocument();
    // No error card, e.g. from touching the form after React released the event
    expect(document.querySelector("main [class*='error']")).toBeNull();
    expect(creates[0].body).toEqual({
      name: "Closing soon",
      trigger: "round_closes",
      offset_minutes: 30,
      recipient: "registered_schools",
      action: "notify_recipients",
      condition: "Only rounds with submissions",
    });
  });

  it("keeps the form open and shows the backend's validation error", async () => {
    mockRules([]);
    mockApiError("post", "/olympiads/oly-1/notification-rules", 400, "Invalid trigger");
    const { user } = renderApp("/organiser/notifications");

    await user.click(await screen.findByRole("button", { name: "Send announcement" }));
    await user.type(screen.getByLabelText("Announcement name"), "Broken");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    expect(await screen.findByText("Invalid trigger")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New in-app announcement" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rule" })).toBeEnabled();
  });

  it("disables an enabled rule", async () => {
    const state = mockRules([rule({ id: "rule-1", name: "Opening reminder" })]);
    const patches = mockApi("patch", "/olympiads/oly-1/notification-rules/:ruleId", (req) => {
      state.rules = state.rules.map((r) => ({ ...r, ...(req.body as object) }));
      return { rule: state.rules[0] };
    });
    const { user } = renderApp("/organiser/notifications");

    const row = (await screen.findByText("Opening reminder")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Disable" }));

    expect(await within(row).findByText("Disabled")).toBeInTheDocument();
    expect(patches.map((p) => [p.path, p.body])).toEqual([["/olympiads/oly-1/notification-rules/rule-1", { enabled: false }]]);
  });

  it("deletes a rule only after the organiser confirms", async () => {
    const state = mockRules([rule({ id: "rule-1", name: "Opening reminder" })]);
    const deletes = mockApi("delete", "/olympiads/oly-1/notification-rules/:ruleId", () => {
      state.rules = [];
      return { deleted: true };
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user } = renderApp("/organiser/notifications");

    const deleteButton = await screen.findByRole("button", { name: "Delete Opening reminder" });
    await user.click(deleteButton);
    expect(confirm).toHaveBeenCalledWith("Delete this notification rule?");
    expect(deletes).toHaveLength(0);

    await user.click(deleteButton);
    expect(await screen.findByText("No announcements configured.")).toBeInTheDocument();
    expect(deletes[0].path).toBe("/olympiads/oly-1/notification-rules/rule-1");
  });

  it("shows why a rule couldn't be loaded", async () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
    mockApiError("get", "/olympiads/oly-1/notification-rules", 403, "You do not own this olympiad");
    renderApp("/organiser/notifications");
    expect(await screen.findByText("You do not own this olympiad")).toBeInTheDocument();
  });
});

// The bell in the page header: in-app notifications the scheduler delivered
describe("notification bell", () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    id: fx.id("note"),
    title: "Round opens soon",
    body: "Qualifier opens at 2026-10-01T11:00:00.000Z.",
    created_at: "2026-10-01T10:00:00.000Z",
    read_at: null as string | null,
    round_id: "round-1",
    ...overrides,
  });

  // Any signed-in page has the bell; the announcements page is a small one
  const renderPage = () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/notification-rules", { rules: [] });
    mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
    return renderApp("/organiser/notifications");
  };

  it("counts the unread notifications and lists them when opened", async () => {
    mockApi("get", "/notifications", {
      notifications: [
        note({ id: "n-1", title: "Round opens soon" }),
        note({ id: "n-2", title: "Results released", body: "Results for Heat 1 are available in the portal.", read_at: "2026-09-30T08:00:00.000Z" }),
      ],
    });
    const { user } = renderPage();

    const bell = await screen.findByRole("button", { name: "Notifications (1)" });
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
    await user.click(bell);

    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(within(panel).getByText("Round opens soon")).toBeInTheDocument();
    expect(within(panel).getByText("Qualifier opens at 2026-10-01T11:00:00.000Z.")).toBeInTheDocument();
    expect(within(panel).getByText("Results for Heat 1 are available in the portal.")).toBeInTheDocument();
    // Only the unread one can be marked read
    expect(within(panel).getAllByRole("button", { name: "Mark read" })).toHaveLength(1);
  });

  it("marks a notification read and updates the count", async () => {
    mockApi("get", "/notifications", { notifications: [note({ id: "n-1" })] });
    const reads = mockApi("patch", "/notifications/:id/read", { message: "Read" });
    const { user } = renderPage();

    await user.click(await screen.findByRole("button", { name: "Notifications (1)" }));
    await user.click(screen.getByRole("button", { name: "Mark read" }));

    expect(await screen.findByRole("button", { name: "Notifications (0)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark read" })).not.toBeInTheDocument();
    expect(reads.map((r) => r.path)).toEqual(["/notifications/n-1/read"]);
  });

  it("says so when there is nothing yet", async () => {
    const { user } = renderPage();

    await user.click(await screen.findByRole("button", { name: "Notifications (0)" }));
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });

  it("leaves the page working when notifications can't be loaded", async () => {
    mockNetworkFailure("get", "/notifications");
    renderPage();

    expect(await screen.findByText("No announcements configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications (0)" })).toBeInTheDocument();
  });
});

describe("paper archive", () => {
  const archived = [
    {
      ...fx.organiserRound({ id: "r-2", name: "Round 2", state: "results_released", closes_at: "2026-06-12T10:00:00.000Z" }),
      papers: [{ id: "paper-2", file_url: "rounds/r-2/paper.pdf", memo_file_url: null, is_archived: true }],
    },
    {
      ...fx.organiserRound({ id: "r-1", name: "Round 1", state: "results_released", closes_at: "2026-03-02T10:00:00.000Z" }),
      papers: [{ id: "paper-1", file_url: "rounds/r-1/paper.pdf", memo_file_url: "rounds/r-1/memo.pdf", is_archived: true }],
    },
  ];

  it("lists archived rounds and enables only the files that exist", async () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/archive", { rounds: archived });
    renderApp("/organiser/archive");

    const round2 = (await screen.findByText("Round 2")).closest("tr")!;
    expect(within(round2).getByText("12 Jun 2026")).toBeInTheDocument();
    expect(within(round2).getByText("Paper on file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download paper for Round 2" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download memo for Round 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download memo for Round 1" })).toBeEnabled();
  });

  it("opens a signed download link for the chosen file", async () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/archive", { rounds: archived });
    const downloads = mockApi("get", "/papers/:id/download", (req) => ({
      url: `https://storage.test/${req.path.split("/")[2]}${req.search}`,
    }));
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderApp("/organiser/archive");

    await user.click(await screen.findByRole("button", { name: "Download memo for Round 1" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://storage.test/paper-1?type=memo", "_blank"));
    expect(downloads.map((d) => d.search)).toEqual(["?type=memo"]);
  });

  it("shows a download failure", async () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/archive", { rounds: archived });
    mockApiError("get", "/papers/:id/download", 404, "Paper file not found");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderApp("/organiser/archive");

    await user.click(await screen.findByRole("button", { name: "Download paper for Round 2" }));

    expect(await screen.findByText("Paper file not found")).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("explains when nothing has been archived yet", async () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/archive", { rounds: [] });
    renderApp("/organiser/archive");
    expect(await screen.findByText("No released rounds have been archived yet.")).toBeInTheDocument();
  });
});
