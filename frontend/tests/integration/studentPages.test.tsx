import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "./support/fixtures";
import { mockApi, mockApiError } from "./support/network";
import { renderApp } from "./support/renderApp";

// Every student page asks /auth/me for the name and school in the sidebar
beforeEach(() => {
  mockApi("get", "/auth/me", fx.me("student"));
});

// GET /rounds/registered item
const registeredRound = (overrides: Record<string, unknown> = {}) => ({
  id: fx.id("round"),
  title: "Round 1",
  olympiadTitle: "Maths Olympiad 2026",
  opens_at: fx.inHours(-1),
  closes_at: fx.inHours(2),
  status: "open",
  paperFile: "paper.pdf",
  paperTitle: "Paper 1",
  hasSubmitted: false,
  result: null,
  ...overrides,
});

describe("student dashboard", () => {
  it("shows the student's stats and what they can do in each round", async () => {
    mockApi("get", "/rounds/registered", {
      stats: { roundsEntered: 4, resultsAvailable: 1, certificatesEarned: 1 },
      rounds: [
        registeredRound({ id: "r-open", title: "Round 2 — Regional" }),
        registeredRound({ id: "r-done", title: "Round 3 — Provincial", status: "open", hasSubmitted: true }),
        registeredRound({ id: "r-next", title: "Round 4 — National", status: "upcoming", opens_at: fx.inHours(24 * 2 + 3), closes_at: fx.inHours(24 * 2 + 5) }),
        registeredRound({ id: "r-closed", title: "Round 1 — School", status: "closed", result: { score: "17 / 20", percentage: "85%", rankInSchool: 1, hasCertificate: true } }),
      ],
    });
    // The round detail page the dashboard links to loads its own round
    mockApi("get", "/rounds/r-open/details", { round: { id: "r-open", title: "Round 2 — Regional", status: "open" } });
    const { user, currentPath } = renderApp("/student");

    const card = async (title: string) => (await screen.findByRole("heading", { name: title })).closest("section")!;

    const open = await card("Round 2 — Regional");
    expect(within(open).getByText("Round is open for exam sitting")).toBeInTheDocument();
    expect(within(open).getByRole("link", { name: "Sit exam online" })).toHaveAttribute("href", "/student/rounds/r-open/exam");

    const submitted = await card("Round 3 — Provincial");
    expect(within(submitted).getByText("Exam submitted · Awaiting marking")).toBeInTheDocument();
    expect(within(submitted).queryByRole("link", { name: "Sit exam online" })).not.toBeInTheDocument();

    const upcoming = await card("Round 4 — National");
    expect(within(upcoming).getByText(/^2d [23]h \d+m$/)).toBeInTheDocument();
    expect(within(upcoming).getByRole("button", { name: "Paper not yet available" })).toBeDisabled();

    const closed = await card("Round 1 — School");
    expect(within(closed).getByText("Your score: 17 / 20 · Certificate earned")).toBeInTheDocument();
    expect(within(closed).getByRole("link", { name: "View results" })).toHaveAttribute("href", "/student/results");

    const stat = (label: string) => screen.getByText(label).closest("section")!;
    expect(within(stat("Rounds entered")).getByText("4")).toBeInTheDocument();
    expect(within(stat("Certificates earned")).getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Ayanda Khumalo · Parktown High")).toBeInTheDocument();

    await user.click(within(open).getByRole("link", { name: "Round detail" }));
    expect(currentPath()).toBe("/student/rounds/r-open");
  });

  it("explains when the student isn't registered for any rounds", async () => {
    mockApi("get", "/rounds/registered", { rounds: [], stats: { roundsEntered: 0, resultsAvailable: 0, certificatesEarned: 0 } });
    renderApp("/student");
    expect(await screen.findByText("You have not been registered for any rounds yet.")).toBeInTheDocument();
  });

  it("shows why the dashboard couldn't be loaded", async () => {
    mockApiError("get", "/rounds/registered", 403, "Only students can view registered rounds");
    renderApp("/student");
    expect(await screen.findByText("Only students can view registered rounds")).toBeInTheDocument();
  });
});

describe("student round page", () => {
  // GET /rounds/:id/details
  const details = (overrides: Record<string, unknown> = {}) => ({
    id: "round-1",
    title: "Round 2 — Regional",
    olympiadTitle: "Maths Olympiad 2026",
    schoolName: "Parktown High",
    opens_at: fx.inHours(-1),
    closes_at: fx.inHours(2),
    status: "open",
    canSitOnline: true,
    hasSubmitted: false,
    submissionStatus: null,
    paperFile: "regional.pdf",
    hasPaper: true,
    paperNote: "Paper is available for download or online sitting.",
    result: null,
    ...overrides,
  });

  it("offers the online exam while the round is open", async () => {
    mockApi("get", "/rounds/round-1/details", { round: details() });
    // The exam page the link opens loads the paper itself; sitting it is covered in examSitting
    mockApi("get", "/rounds/round-1/exam", {
      round: { id: "round-1", name: "Round 2 — Regional", opens_at: fx.inHours(-1), closes_at: fx.inHours(2), state: "open" },
      questions: [],
      total_points: 0,
      server_time: new Date().toISOString(),
      submission: null,
    });
    const { user, currentPath } = renderApp("/student/rounds/round-1");

    expect(await screen.findByRole("heading", { name: "Round 2 — Regional" })).toBeInTheDocument();
    expect(screen.getByText("regional.pdf")).toBeInTheDocument();
    expect(screen.getByText("Paper is available for download or online sitting.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download paper" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Your result" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Sit exam online" }));
    expect(currentPath()).toBe("/student/rounds/round-1/exam");
  });

  it("downloads the paper through a signed link from the backend", async () => {
    mockApi("get", "/rounds/round-1/details", { round: details() });
    const downloads = mockApi("get", "/rounds/:roundId/paper/download", { url: "https://storage.test/regional.pdf?token=abc" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderApp("/student/rounds/round-1");

    await user.click(await screen.findByRole("button", { name: "Download paper" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://storage.test/regional.pdf?token=abc", "_blank"));
    expect(downloads[0].path).toBe("/rounds/round-1/paper/download");
    expect(screen.getByRole("button", { name: "Download paper" })).toBeEnabled();
  });

  it("shows why the paper couldn't be downloaded", async () => {
    mockApi("get", "/rounds/round-1/details", { round: details() });
    mockApiError("get", "/rounds/:roundId/paper/download", 404, "No paper uploaded for this round");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderApp("/student/rounds/round-1");

    await user.click(await screen.findByRole("button", { name: "Download paper" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No paper uploaded for this round");
    expect(open).not.toHaveBeenCalled();
  });

  it("disables the download when no paper was uploaded", async () => {
    mockApi("get", "/rounds/round-1/details", { round: details({ hasPaper: false, paperFile: "question-paper.pdf" }) });
    renderApp("/student/rounds/round-1");
    expect(await screen.findByRole("button", { name: "Download paper" })).toBeDisabled();
  });

  it("offers the exam again when a started sitting hasn't been submitted", async () => {
    // The backend reports an in-progress online sitting as not yet submitted
    mockApi("get", "/rounds/round-1/details", { round: details({ hasSubmitted: false, submissionStatus: "received" }) });
    renderApp("/student/rounds/round-1");

    expect(await screen.findByRole("link", { name: "Sit exam online" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exam submitted/ })).not.toBeInTheDocument();
  });

  it("shows a submitted exam instead of the sitting link", async () => {
    mockApi("get", "/rounds/round-1/details", { round: details({ hasSubmitted: true, submissionStatus: "queued_for_marking" }) });
    renderApp("/student/rounds/round-1");

    expect(await screen.findByRole("button", { name: "Exam submitted (queued_for_marking)" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Sit exam online" })).not.toBeInTheDocument();
  });

  it("keeps the paper locked before the round opens", async () => {
    mockApi("get", "/rounds/round-1/details", {
      round: details({ status: "upcoming", canSitOnline: false, opens_at: fx.inHours(20), paperNote: "Available when the round opens." }),
    });
    renderApp("/student/rounds/round-1");

    expect(await screen.findByRole("button", { name: "Download paper" })).toBeDisabled();
    expect(screen.getByText("Available when the round opens.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sit exam online" })).not.toBeInTheDocument();
  });

  it("shows the released result and certificate for a closed round", async () => {
    mockApi("get", "/rounds/round-1/details", {
      round: details({
        status: "closed",
        canSitOnline: false,
        hasSubmitted: true,
        submissionStatus: "automarked",
        result: { score: "17 / 20", percentage: "85%", rankInSchool: 1, hasCertificate: true },
      }),
    });
    renderApp("/student/rounds/round-1");

    const result = (await screen.findByRole("heading", { name: "Your result" })).closest("section")!;
    expect(within(result).getByText("Score").nextElementSibling).toHaveTextContent("17 / 20");
    expect(within(result).getByText("Percentage").nextElementSibling).toHaveTextContent("85%");
    expect(within(result).getByText("Rank in school").nextElementSibling).toHaveTextContent("1");
    expect(within(result).getByText("You earned a certificate for this round.")).toBeInTheDocument();
  });

  it("says results aren't out yet for a closed round without them", async () => {
    mockApi("get", "/rounds/round-1/details", { round: details({ status: "closed", canSitOnline: false }) });
    renderApp("/student/rounds/round-1");
    expect(await screen.findByText("Results not released yet.")).toBeInTheDocument();
  });

  it("shows the backend's message for a round the student isn't registered for", async () => {
    mockApiError("get", "/rounds/round-1/details", 404, "Round not found or you are not registered for this round");
    renderApp("/student/rounds/round-1");

    expect(await screen.findByText("Round not found or you are not registered for this round")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/student");
  });
});

describe("student results", () => {
  it("lists released and pending results with links to each round", async () => {
    mockApi("get", "/rounds/my-results", {
      results: [
        { id: "round-2", round: "Round 2 — Regional", olympiadTitle: "Maths Olympiad 2026", closes_at: "2026-08-01T10:00:00.000Z", resultStatus: "pending", score: "—", percentage: "—", rank: null, hasCertificate: false },
        { id: "round-1", round: "Round 1 — School", olympiadTitle: "Maths Olympiad 2026", closes_at: "2026-05-01T10:00:00.000Z", resultStatus: "released", score: "17 / 20", percentage: "85%", rank: 1, hasCertificate: true },
      ],
    });
    // The round detail page each result links to loads its own round
    mockApi("get", "/rounds/round-1/details", { round: { id: "round-1", title: "Round 1 — School", status: "closed" } });
    const { user, currentPath } = renderApp("/student/results");

    const released = (await screen.findByRole("link", { name: "Round 1 — School" })).closest("tr")!;
    expect(within(released).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Round 1 — School",
      "May 1, 2026",
      "Marked",
      "17 / 20",
      "85%",
      "Download",
    "Request remark",
    ]);
    const pending = screen.getByRole("link", { name: "Round 2 — Regional" }).closest("tr")!;
    expect(within(pending).getByText("Pending")).toBeInTheDocument();
    expect(within(pending).getAllByText("—")).toHaveLength(4);

    await user.click(screen.getByRole("link", { name: "Round 1 — School" }));
    expect(currentPath()).toBe("/student/rounds/round-1");
  });

  it("explains when there are no results yet", async () => {
    mockApi("get", "/rounds/my-results", { results: [] });
    renderApp("/student/results");
    expect(await screen.findByText("No closed rounds or released results found.")).toBeInTheDocument();
  });

  it("shows why results couldn't be loaded", async () => {
    mockApiError("get", "/rounds/my-results", 401, "Invalid or expired token");
    renderApp("/student/results");
    expect(await screen.findByText("Invalid or expired token")).toBeInTheDocument();
  });
});
