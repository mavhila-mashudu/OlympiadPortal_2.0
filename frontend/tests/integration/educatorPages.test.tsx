import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fx from "./support/fixtures";
import { mockApi, mockApiError } from "./support/network";
import { renderApp } from "./support/renderApp";

describe("educator dashboard", () => {
  it("shows each round's status, countdown and next action", async () => {
    mockApi("get", "/educator/rounds", {
      school: fx.school,
      rounds: [
        fx.educatorRound({ id: "r-open", name: "Round 1", status: "open", closes_at: fx.inHours(5) }),
        fx.educatorRound({ id: "r-next", name: "Round 2", status: "upcoming", state: "scheduled", opens_at: fx.inHours(24 * 3 + 2), closes_at: fx.inHours(24 * 3 + 4) }),
        fx.educatorRound({ id: "r-done", name: "Round 0", status: "closed", state: "results_released", opens_at: fx.inHours(-50), closes_at: fx.inHours(-48), submission_count: 9 }),
      ],
    });
    const { user, currentPath } = renderApp("/educator");

    const card = async (name: string) => (await screen.findByRole("heading", { name })).closest("section")!;
    const open = await card("Round 1");
    expect(within(open).getByText("Open")).toBeInTheDocument();
    expect(within(open).getByText("Closes in")).toBeInTheDocument();
    expect(within(open).getByText(/^[45]h \d+m$/)).toBeInTheDocument();
    expect(within(open).queryByRole("link", { name: /results|entrants/i })).not.toBeInTheDocument();

    const upcoming = await card("Round 2");
    expect(within(upcoming).getByText("Upcoming")).toBeInTheDocument();
    expect(within(upcoming).getByText(/^3d [12]h$/)).toBeInTheDocument();
    expect(within(upcoming).getByRole("link", { name: "Register entrants" })).toHaveAttribute("href", "/educator/entrants");

    const closed = await card("Round 0");
    expect(within(closed).getByText("Submission received")).toBeInTheDocument();
    expect(within(closed).getByRole("link", { name: "View results" })).toHaveAttribute("href", "/educator/results");

    expect(screen.getByText("Olympiad rounds relevant to Parktown High.")).toBeInTheDocument();
    await user.click(within(open).getByRole("link", { name: "Open round" }));
    expect(currentPath()).toBe("/educator/rounds/r-open");
  });

  it("explains when the school has no rounds", async () => {
    mockApi("get", "/educator/rounds", { rounds: [], school: fx.school });
    renderApp("/educator");
    expect(await screen.findByText(/No rounds found/)).toBeInTheDocument();
  });

  it("shows why rounds couldn't be loaded", async () => {
    mockApiError("get", "/educator/rounds", 403, "Educator profile not found");
    renderApp("/educator");
    expect(await screen.findByText("Failed to load rounds: Educator profile not found")).toBeInTheDocument();
  });
});

describe("educator round page", () => {
  // GET /educator/rounds/:id
  const roundDetail = (overrides: Record<string, unknown> = {}) => ({
    id: "round-1",
    name: "Round 1 — Regional",
    olympiad_id: "oly-1",
    olympiad_name: "Maths Olympiad 2026",
    opens_at: fx.inHours(-1),
    closes_at: fx.inHours(3),
    results_release_at: null,
    state: "open",
    status: "open",
    paper: { id: "paper-1", title: "Regional paper", has_paper: true, has_memo: true },
    has_submitted: false,
    submission: null,
    results_available: false,
    school: fx.school,
    ...overrides,
  });
  const entrants = [
    { id: "ent-1", full_name: "Ayanda Khumalo", grade: "11", external_ref: "S001", registered_at: "2026-09-01T08:00:00.000Z" },
    { id: "ent-2", full_name: "Lerato Nkosi", grade: null, external_ref: null, registered_at: "2026-09-01T08:00:00.000Z" },
  ];

  const mockRound = (round: ReturnType<typeof roundDetail>, { pastPapers = [] as unknown[], roster = entrants } = {}) => {
    const state = { round };
    mockApi("get", "/educator/rounds/round-1", () => ({ round: state.round }));
    mockApi("get", "/educator/rounds/round-1/papers/past", { papers: pastPapers });
    mockApi("get", "/educator/rounds/round-1/entrants", { entrants: roster });
    return state;
  };

  it("downloads the question paper through a signed link", async () => {
    mockRound(roundDetail());
    const downloads = mockApi("get", "/educator/rounds/:roundId/paper/download", (req) => ({ url: `https://storage.test/paper.pdf${req.search}` }));
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderApp("/educator/rounds/round-1");

    expect(await screen.findByText("Regional paper")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download paper" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://storage.test/paper.pdf?type=paper", "_blank"));
    expect(downloads[0].path).toBe("/educator/rounds/round-1/paper/download");
  });

  it("submits an entrant's offline results and shows the receipt", async () => {
    const state = mockRound(roundDetail());
    const submissions = mockApi(
      "post",
      "/rounds/round-1/submissions",
      (req) => {
        state.round = { ...state.round, has_submitted: true };
        return {
          submission: { id: "sub-42", round_id: "round-1", entrant_id: (req.body as { entrant_id: string }).entrant_id, received_at: new Date().toISOString(), status: "queued_for_marking", route: "offline" },
          answers: [],
          totalPoints: 0,
          autoMarked: false,
        };
      },
      { status: 201 },
    );
    const { user } = renderApp("/educator/rounds/round-1");

    const submit = await screen.findByRole("button", { name: "Submit results" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("option", { name: "Ayanda Khumalo (Grade 11)" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Select entrant"), "ent-2");
    await user.click(submit);

    expect(await screen.findByText("Submission confirmed")).toBeInTheDocument();
    expect(screen.getByText("sub-42")).toBeInTheDocument();
    expect(screen.getByText(/queued_for_marking/)).toBeInTheDocument();
    expect(submissions[0].body).toEqual({ entrant_id: "ent-2", route: "offline", answers: [] });
  });

  it("alerts the backend's reason when a submission is rejected", async () => {
    mockRound(roundDetail());
    mockApiError("post", "/rounds/round-1/submissions", 409, "This entrant has already submitted for this round");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { user } = renderApp("/educator/rounds/round-1");

    await user.selectOptions(await screen.findByLabelText("Select entrant"), "ent-1");
    await user.click(screen.getByRole("button", { name: "Submit results" }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("This entrant has already submitted for this round"));
    expect(screen.queryByText("Submission confirmed")).not.toBeInTheDocument();
  });

  it("asks for entrants to be registered before results can be submitted", async () => {
    mockRound(roundDetail(), { roster: [] });
    renderApp("/educator/rounds/round-1");

    const section = (await screen.findByRole("heading", { name: "Submit results" })).closest("section")!;
    expect(await within(section).findByText(/No entrants registered yet/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Register entrants" })).toHaveAttribute("href", "/educator/entrants");
    expect(within(section).getByRole("button", { name: "Submit results" })).toBeDisabled();
  });

  it("locks the paper and submissions before the round opens", async () => {
    mockRound(roundDetail({ state: "scheduled", status: "upcoming", opens_at: fx.inHours(24) }));
    renderApp("/educator/rounds/round-1");

    expect(await screen.findByRole("button", { name: "Download paper" })).toBeDisabled();
    expect(screen.getByText("Paper will be available once the round opens.")).toBeInTheDocument();
    expect(screen.getByText("Submissions open when the round opens.")).toBeInTheDocument();
    expect(screen.getByText(/Results will be available once the round closes/)).toBeInTheDocument();
  });

  it("tells the educator results were already submitted", async () => {
    mockRound(roundDetail({ has_submitted: true, submission: { id: "sub-1", received_at: "2026-09-01T09:00:00.000Z", status: "marked", route: "offline" } }));
    renderApp("/educator/rounds/round-1");

    expect(await screen.findByText(/Results were submitted before the round closed\. Received/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit results" })).not.toBeInTheDocument();
  });

  it("lists released past papers and downloads one by its round", async () => {
    mockRound(roundDetail(), {
      pastPapers: [{ id: "paper-0", round_id: "round-0", round_name: "Round 0 — School", title: "School paper", closed_at: "2026-05-01T10:00:00.000Z", has_paper: true, has_memo: false }],
    });
    const downloads = mockApi("get", "/educator/rounds/:roundId/paper/download", { url: "https://storage.test/past.pdf" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderApp("/educator/rounds/round-1");

    const past = (await screen.findByRole("heading", { name: "Released past papers" })).closest("section")!;
    expect(within(past).getByText("School paper")).toBeInTheDocument();
    await user.click(within(past).getByRole("button", { name: "Download" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("https://storage.test/past.pdf", "_blank"));
    expect(downloads[0].path).toBe("/educator/rounds/round-0/paper/download");
  });

  it("shows the school's released results with numeric scores", async () => {
    mockRound(roundDetail({ state: "results_released", status: "closed", opens_at: fx.inHours(-30), closes_at: fx.inHours(-28) }));
    mockApi("get", "/educator/rounds/round-1/results", {
      round: { id: "round-1", name: "Round 1 — Regional", state: "results_released", closes_at: fx.inHours(-28) },
      results: [
        { id: "res-1", rank: 1, total_points: "73.5", qualified: true, entrant: { id: "ent-1", full_name: "Ayanda Khumalo", grade: "11", external_ref: "S001" } },
        { id: "res-2", rank: null, total_points: "12", qualified: false, entrant: { id: "ent-2", full_name: "Lerato Nkosi", grade: null, external_ref: null } },
      ],
    });
    renderApp("/educator/rounds/round-1");

    const ayanda = (await screen.findByText("Ayanda Khumalo", { selector: "td" })).closest("tr")!;
    expect(within(ayanda).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "Ayanda Khumalo", "S001", "11", "73.5", "Yes"]);
    const lerato = screen.getByText("Lerato Nkosi", { selector: "td" }).closest("tr")!;
    expect(within(lerato).getAllByRole("cell").map((c) => c.textContent)).toEqual(["—", "Lerato Nkosi", "—", "—", "12", "No"]);
    expect(screen.getByText("The submission window has closed.")).toBeInTheDocument();
  });

  it("doesn't ask for results while the round is still being marked", async () => {
    mockRound(roundDetail({ state: "marking", status: "closed" }));
    const resultRequests = mockApiError("get", "/educator/rounds/round-1/results", 400, 'Results are not yet available — round is "marking"');
    renderApp("/educator/rounds/round-1");

    expect(await screen.findByText("Results are being processed. Check back soon.")).toBeInTheDocument();
    expect(resultRequests).toHaveLength(0);
  });

  it("shows a load failure with a way back", async () => {
    mockApiError("get", "/educator/rounds/round-1", 403, "Your school is not registered for this olympiad");
    mockApi("get", "/educator/rounds/round-1/papers/past", { papers: [] });
    mockApi("get", "/educator/rounds/round-1/entrants", { entrants: [] });
    renderApp("/educator/rounds/round-1");

    expect(await screen.findByText("Failed to load: Your school is not registered for this olympiad")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/educator");
  });
});

describe("educator entrants and invitations", () => {
  const olympiads = [
    { id: "oly-1", name: "Maths Olympiad 2026" },
    { id: "oly-2", name: "Science Olympiad 2026" },
  ];
  const olympiadEntrant = (overrides: Record<string, unknown> = {}) => ({
    id: fx.id("ent"),
    full_name: "Ayanda Khumalo",
    grade: "11",
    external_ref: "S001",
    rounds: [{ id: "round-1", name: "Round 1" }],
    ...overrides,
  });

  const mockEntrantsPage = ({ membershipRole = "coordinator", requiresQualification = false } = {}) => {
    const state = {
      invitations: [{ id: "inv-1", email: "old@student.test", olympiadName: "Maths Olympiad 2026", code: "STU-1", status: "accepted" }] as Record<string, unknown>[],
      entrants: { "oly-1": [olympiadEntrant()], "oly-2": [] as ReturnType<typeof olympiadEntrant>[] } as Record<string, ReturnType<typeof olympiadEntrant>[]>,
    };
    mockApi("get", "/educator/rounds", { rounds: [], school: fx.school });
    mockApi("get", "/auth/educator-olympiads", { olympiads });
    mockApi("get", "/auth/student-invitations", () => ({ invitations: state.invitations }));
    mockApi("get", "/auth/me", fx.me("educator", { school_memberships: [{ school_id: "school-1", role: membershipRole, schools: { name: "Parktown High" } }] }));
    mockApi("get", "/educator/olympiads/:olympiadId/entrants", (req) => ({ entrants: state.entrants[req.path.split("/")[3]] }));
    mockApi("get", "/educator/olympiads/:olympiadId/progression", (req) => ({
      rounds: [
        { roundId: "round-1", roundName: "Round 1", requiresQualification: false, previousRound: null, qualifiedEntrantIds: [], state: "results_released" },
        { roundId: "round-2", roundName: "Round 2", requiresQualification: requiresQualification && req.path.includes("oly-1"), previousRound: null, qualifiedEntrantIds: [], state: "scheduled" },
      ],
    }));
    return state;
  };

  it("shows invitations and the first olympiad's registered entrants", async () => {
    mockEntrantsPage();
    renderApp("/educator/entrants");

    expect(await screen.findByRole("heading", { name: "Registered entrants (1)" })).toBeInTheDocument();
    const row = screen.getByText("Ayanda Khumalo").closest("tr")!;
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Ayanda Khumalo", "S001", "11", "Round 1"]);
    expect(screen.getByLabelText("Olympiad")).toHaveValue("oly-1");
    expect(screen.getByRole("heading", { name: "Student invitations (1)" })).toBeInTheDocument();
    expect(screen.getByText("old@student.test · Maths Olympiad 2026")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
  });

  it("loads the entrants of the olympiad the educator switches to", async () => {
    mockEntrantsPage();
    const { user } = renderApp("/educator/entrants");

    await screen.findByText("Ayanda Khumalo");
    await user.selectOptions(screen.getByLabelText("Olympiad"), "oly-2");

    expect(await screen.findByText("No entrants registered for this olympiad yet.")).toBeInTheDocument();
  });

  it("registers an entrant and refreshes the list", async () => {
    const state = mockEntrantsPage();
    const registrations = mockApi(
      "post",
      "/educator/olympiads/:olympiadId/entrants",
      (req) => {
        const [entrant] = (req.body as { entrants: Record<string, string>[] }).entrants;
        const created = olympiadEntrant({ ...entrant, rounds: [] });
        state.entrants["oly-1"] = [...state.entrants["oly-1"], created];
        return { entrants: [created] };
      },
      { status: 201 },
    );
    const { user } = renderApp("/educator/entrants");

    await screen.findByText("Ayanda Khumalo");
    await user.type(screen.getByLabelText(/Full name/), "  Lerato Nkosi ");
    await user.type(screen.getByLabelText("Student number"), "S002");
    await user.selectOptions(screen.getByLabelText("Grade"), "9");
    await user.click(screen.getByRole("button", { name: "Add entrant" }));

    expect(await screen.findByText("Lerato Nkosi has been registered for the olympiad.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Registered entrants (2)" })).toBeInTheDocument();
    expect(registrations[0].path).toBe("/educator/olympiads/oly-1/entrants");
    expect(registrations[0].body).toEqual({ entrants: [{ full_name: "Lerato Nkosi", grade: "9", external_ref: "S002" }] });
    expect(screen.getByLabelText(/Full name/)).toHaveValue("");
  });

  it("shows the backend's reason when registration is refused", async () => {
    mockEntrantsPage();
    mockApiError("post", "/educator/olympiads/:olympiadId/entrants", 403, "Your school is not registered for this olympiad");
    const { user } = renderApp("/educator/entrants");

    await screen.findByText("Ayanda Khumalo");
    await user.type(screen.getByLabelText(/Full name/), "Lerato Nkosi");
    await user.click(screen.getByRole("button", { name: "Add entrant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your school is not registered for this olympiad");
  });

  it("warns when later rounds require qualification", async () => {
    mockEntrantsPage({ requiresQualification: true });
    renderApp("/educator/entrants");
    expect(await screen.findByText(/require entrants to have qualified from a previous round/)).toBeInTheDocument();
  });

  it("invites a student and adds the invitation to the list", async () => {
    const state = mockEntrantsPage();
    const invites = mockApi(
      "post",
      "/auth/invite-student",
      (req) => {
        const { email } = req.body as { email: string };
        state.invitations = [{ id: "inv-2", email, olympiadName: "Maths Olympiad 2026", code: "STU-2", status: "pending" }, ...state.invitations];
        return { code: "STU-2", emailDelivered: true };
      },
      { status: 201 },
    );
    const { user } = renderApp("/educator/entrants");

    await screen.findByText("Ayanda Khumalo");
    await user.type(screen.getByLabelText(/Student email/), "new@student.test");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Student invitation sent successfully.");
    expect(await screen.findByText("new@student.test · Maths Olympiad 2026")).toBeInTheDocument();
    expect(invites[0].body).toEqual({ email: "new@student.test", olympiad_id: "oly-1" });
    expect(screen.getByLabelText(/Student email/)).toHaveValue("");
  });

  it("gives the invitation code when the email couldn't be delivered", async () => {
    mockEntrantsPage();
    mockApi("post", "/auth/invite-student", { code: "STU-9F8E", emailDelivered: false }, { status: 201 });
    const { user } = renderApp("/educator/entrants");

    await screen.findByText("Ayanda Khumalo");
    await user.type(screen.getByLabelText(/Student email/), "new@student.test");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invitation code STU-9F8E was created, but email delivery is unavailable.");
  });

  it("lets a coordinator invite another educator", async () => {
    mockEntrantsPage();
    const invites = mockApi("post", "/auth/invite-educator", { code: "EDU-1", emailDelivered: true }, { status: 201 });
    const { user } = renderApp("/educator/entrants");

    await user.type(await screen.findByLabelText("Educator email"), "colleague@parktown.test");
    await user.click(screen.getByRole("button", { name: "Invite educator" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Educator invitation sent successfully.");
    expect(invites[0].body).toEqual({ email: "colleague@parktown.test", olympiad_id: "oly-1" });
  });

  it("hides educator invitations from non-coordinators", async () => {
    mockEntrantsPage({ membershipRole: "educator" });
    renderApp("/educator/entrants");

    await screen.findByText("Ayanda Khumalo");
    expect(screen.queryByRole("heading", { name: "Invite an educator" })).not.toBeInTheDocument();
  });

  it("tells the educator when invitations couldn't be loaded", async () => {
    mockApi("get", "/educator/rounds", { rounds: [], school: fx.school });
    mockApiError("get", "/auth/educator-olympiads", 500, "Internal server error");
    mockApi("get", "/auth/student-invitations", { invitations: [] });
    mockApi("get", "/auth/me", fx.me("educator"));
    renderApp("/educator/entrants");

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your invitations. Please refresh the page.");
    expect(screen.getByRole("option", { name: "No olympiads available" })).toBeInTheDocument();
  });
});

describe("educator results", () => {
  const rounds = [
    {
      id: "round-2",
      name: "Round 2 — Provincial",
      olympiad_name: "Maths Olympiad 2026",
      closes_at: "2026-08-01T10:00:00.000Z",
      results: [
        { id: "res-1", rank: 3, total_points: "81.25", qualified: true, entrant: { id: "ent-1", full_name: "Ayanda Khumalo", grade: "11", external_ref: "S001" } },
      ],
    },
    { id: "round-1", name: "Round 1 — Regional", olympiad_name: "Maths Olympiad 2026", closes_at: "2026-05-01T10:00:00.000Z", results: [] },
  ];

  it("shows the latest round's results and switches rounds", async () => {
    mockApi("get", "/educator/results", { rounds });
    const { user } = renderApp("/educator/results");

    const row = (await screen.findByText("Ayanda Khumalo")).closest("tr")!;
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["3", "Ayanda Khumalo", "S001", "11", "81.25", "Yes"]);
    expect(screen.getByText(/· 1 entrant$/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Round" }), "round-1");
    expect(screen.getByText("No results for your entrants in this round.")).toBeInTheDocument();
    expect(screen.getByText(/· 0 entrants$/)).toBeInTheDocument();
  });

  it("explains when no results have been released", async () => {
    mockApi("get", "/educator/results", { rounds: [] });
    renderApp("/educator/results");
    expect(await screen.findByText(/No results available yet/)).toBeInTheDocument();
  });

  it("shows why results couldn't be loaded", async () => {
    mockApiError("get", "/educator/results", 403, "Educator profile not found");
    renderApp("/educator/results");
    expect(await screen.findByText("Failed to load results: Educator profile not found")).toBeInTheDocument();
  });
});
