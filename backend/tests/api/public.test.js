// The public developer API (/public/*): read-only, aggregated data that any
// website or app may use without an account. Checks what other sites rely on
// (CORS, caching, rate limits), every endpoint's data, and that nothing
// identifies an individual learner.
const prisma = require("../../src/config/database").default;
const f = require("../integration/helpers/factories");
const { supabase } = require("../integration/helpers/externalMocks");
const { api, expectError, expectOk } = require("./helpers/api");

const EXTERNAL_SITE = "https://parktownboys.co.za";
const MISSING = "00000000-0000-4000-8000-000000000000";

// Two olympiads. "Maths Olympiad" has a released first round (a 10-mark
// paper, qualifying at 60%) and an upcoming second round; Parktown's two
// learners scored 8 and 6, Sandton's one learner 3. "Science Olympiad" has
// nothing released yet.
const setup = async () => {
  const organiser = await f.createOrganiser({ full_name: "Thandi Mokoena" });
  const maths = await f.createOlympiad({ organiser, name: "Maths Olympiad" });
  const science = await f.createOlympiad({ organiser, name: "Science Olympiad" });
  const parktown = await f.createSchool({ name: "Parktown High" });
  const sandton = await f.createSchool({ name: "Sandton College" });
  for (const school of [parktown, sandton]) await f.registerSchool(school, maths, { status: "approved" });
  const { educator } = await f.createEducator({ school: parktown });

  const released = await f.createRound({
    olympiad: maths,
    name: "Round 1",
    state: "results_released",
    qualifying_threshold: 60,
    opens_at: f.hoursFromNow(-72),
    closes_at: f.hoursFromNow(-70),
    results_release_at: f.hoursFromNow(-24),
  });
  const upcoming = await f.createRound({ olympiad: maths, name: "Round 2", opens_at: f.hoursFromNow(48), closes_at: f.hoursFromNow(50) });
  const unreleased = await f.createRound({
    olympiad: science,
    name: "Science Round 1",
    state: "marking",
    opens_at: f.hoursFromNow(-10),
    closes_at: f.hoursFromNow(-8),
  });

  const { paper } = await f.createPaper({
    round: released,
    title: "Maths Round 1 paper",
    file_url: "maths/round-1/paper.pdf",
    memo_file_url: "maths/round-1/memo.pdf",
    is_archived: true,
    questions: [{ type: "essay", max_points: 10 }],
  });
  const { paper: unreleasedPaper } = await f.createPaper({ round: unreleased, file_url: "science/round-1/paper.pdf" });

  const learners = [];
  const sat = async (school, name, points) => {
    const { user, entrant } = await f.createStudent({ school, entrantOverrides: { full_name: name } });
    await f.registerEntrant({ entrant, round: released, educator });
    await prisma.submissions.create({
      data: { round_id: released.id, entrant_id: entrant.id, route: "online", status: "marked", idempotency_key: `k-${entrant.id}`, round_close_snapshot: released.closes_at },
    });
    await prisma.results.create({
      data: { round_id: released.id, entrant_id: entrant.id, total_points: points, qualified: points >= 6, finalised_at: new Date() },
    });
    learners.push({ user, entrant });
  };
  await sat(parktown, "Ayanda Zulu", 8);
  await sat(parktown, "Lerato Dlamini", 6);
  await sat(sandton, "Sipho Nkosi", 3);

  return { organiser, maths, science, parktown, sandton, released, upcoming, unreleased, paper, unreleasedPaper, learners };
};

const resultsUrl = (olympiad, round) => `/public/olympiads/${olympiad.id}/rounds/${round.id}/results`;

describe("using the public API from another website", () => {
  it("lets any website read it from the browser", async () => {
    const res = await api().get("/public/stats").set("Origin", EXTERNAL_SITE);

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    // No cookies or tokens are involved
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("answers the browser's preflight check", async () => {
    const res = await api()
      .options("/public/olympiads")
      .set("Origin", EXTERNAL_SITE)
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toBe("GET,HEAD,OPTIONS");
  });

  it("still keeps other websites out of the signed-in API", async () => {
    const res = await api().get("/auth/schools").set("Origin", EXTERNAL_SITE);

    expectError(res, 403, "Origin is not allowed by CORS");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("opens only the /public paths, not ones that merely start with the word", async () => {
    const res = await api().get("/publicity").set("Origin", EXTERNAL_SITE);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("lets browsers and CDNs cache public data for a minute, but never signed-in data", async () => {
    expect((await api().get("/public/stats")).headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
    expect((await api().get("/auth/schools")).headers["cache-control"]).toBe("no-store");
  });

  it("tells clients their rate limit, separately from the sign-up limit", async () => {
    const res = await api().get("/public/stats");
    // The tests raise the limit (PUBLIC_RATE_LIMIT_MAX); production allows 300 per 15 minutes
    expect(res.headers.ratelimit).toMatch(/^"100000-in-15min"; r=\d+; t=\d+$/);
    expect(res.headers["ratelimit-policy"]).toMatch(/^"100000-in-15min"; q=100000; w=900/);
  });

  it("uses the API's usual error envelope for unknown public paths", async () => {
    expectError(await api().get("/public/nothing-here"), 404, "Route not found");
  });
});

describe("GET /public/stats", () => {
  it("totals the whole platform", async () => {
    await setup();
    expect(expectOk(await api().get("/public/stats"))).toEqual({
      totalOlympiads: 2,
      totalRounds: 3,
      totalSchools: 2,
      totalStudents: 3,
      totalSubmissions: 3,
    });
  });
});

describe("GET /public/stats/yearly", () => {
  it("totals each year by when its rounds open", async () => {
    const { released, upcoming, unreleased } = await setup();
    const years = new Set([released, upcoming, unreleased].map((r) => r.opens_at.getUTCFullYear()));

    const rows = expectOk(await api().get("/public/stats/yearly"));

    expect(rows.map((r) => r.year)).toEqual([...years].sort((a, b) => b - a));
    const total = (key) => rows.reduce((n, r) => n + r[key], 0);
    expect(total("totalRounds")).toBe(3);
    expect(total("totalSubmissions")).toBe(3);
    expect(rows[0]).toEqual({
      year: expect.any(Number),
      totalOlympiads: expect.any(Number),
      totalRounds: expect.any(Number),
      totalStudents: expect.any(Number),
      totalSchools: expect.any(Number),
      totalSubmissions: expect.any(Number),
    });
  });
});

describe("GET /public/activity", () => {
  it("lists recently closed rounds, upcoming rounds and recently released results", async () => {
    const { maths, released, upcoming, unreleased } = await setup();

    const activity = expectOk(await api().get("/public/activity"));

    expect(activity.recentlyCompletedRounds.map((r) => r.id)).toEqual([unreleased.id, released.id]);
    expect(activity.upcomingRounds.map((r) => r.id)).toEqual([upcoming.id]);
    expect(activity.recentResultsReleased).toEqual([
      expect.objectContaining({ id: released.id, name: "Round 1", olympiadId: maths.id, olympiadName: "Maths Olympiad", state: "results_released" }),
    ]);
  });
});

describe("GET /public/calendar", () => {
  it("lists the rounds running within the dates asked for", async () => {
    const { released, upcoming, unreleased } = await setup();
    const from = f.hoursFromNow(-12).toISOString();
    const to = f.hoursFromNow(72).toISOString();

    const rounds = expectOk(await api().get("/public/calendar").query({ from, to }));

    expect(rounds.map((r) => r.id)).toEqual([unreleased.id, upcoming.id]);
    expect(rounds.map((r) => r.id)).not.toContain(released.id);
  });

  it("responds 422 for a date that isn't ISO 8601", async () => {
    expectError(await api().get("/public/calendar").query({ from: "next tuesday" }), 422, "from must be a valid ISO 8601 date");
  });
});

describe("GET /public/search", () => {
  it("finds olympiads, schools and rounds by name, ignoring case", async () => {
    const { maths, parktown } = await setup();

    const byOlympiad = expectOk(await api().get("/public/search").query({ q: "maths" }));
    expect(byOlympiad.olympiads).toEqual([expect.objectContaining({ id: maths.id, name: "Maths Olympiad", roundCount: 2 })]);

    const bySchool = expectOk(await api().get("/public/search").query({ q: "PARKTOWN" }));
    expect(bySchool.schools).toEqual([{ id: parktown.id, name: "Parktown High", studentCount: 2 }]);

    const byRound = expectOk(await api().get("/public/search").query({ q: "science round" }));
    expect(byRound.rounds.map((r) => r.name)).toEqual(["Science Round 1"]);
  });

  it("returns nothing for an empty search", async () => {
    await setup();
    expect(expectOk(await api().get("/public/search").query({ q: "  " }))).toEqual({ olympiads: [], schools: [], rounds: [] });
  });
});

describe("GET /public/olympiads", () => {
  it("lists olympiads with their counts, newest first", async () => {
    const { maths, science, released } = await setup();

    const { olympiads, pagination } = expectOk(await api().get("/public/olympiads"));

    expect(olympiads.map((o) => o.id)).toEqual([science.id, maths.id]);
    expect(olympiads[1]).toEqual({
      id: maths.id,
      name: "Maths Olympiad",
      createdAt: expect.any(String),
      roundCount: 2,
      schoolCount: 2,
      studentCount: 3,
      year: released.opens_at.getFullYear(),
    });
    expect(pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it("searches, sorts by name and pages", async () => {
    await setup();

    const found = expectOk(await api().get("/public/olympiads").query({ search: "science" }));
    expect(found.olympiads.map((o) => o.name)).toEqual(["Science Olympiad"]);

    const firstPage = expectOk(await api().get("/public/olympiads").query({ sort: "name", limit: 1 }));
    expect(firstPage.olympiads.map((o) => o.name)).toEqual(["Maths Olympiad"]);
    expect(firstPage.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });

    const secondPage = expectOk(await api().get("/public/olympiads").query({ sort: "name", limit: 1, page: 2 }));
    expect(secondPage.olympiads.map((o) => o.name)).toEqual(["Science Olympiad"]);
  });

  it.each([
    ["a limit over 100", { limit: 101 }, "Limit must be 1–100"],
    ["page 0", { page: 0 }, "Page must be a positive integer"],
    ["an unknown sort", { sort: "score" }, "Sort must be 'name' or 'created_at'"],
    ["an impossible year", { year: 1999 }, "Year must be valid"],
  ])("responds 422 for %s", async (_label, query, message) => {
    expectError(await api().get("/public/olympiads").query(query), 422, message);
  });
});

describe("GET /public/olympiads/:id", () => {
  it("shows an olympiad and its rounds", async () => {
    const { maths, released, upcoming } = await setup();

    const detail = expectOk(await api().get(`/public/olympiads/${maths.id}`));

    expect(detail).toMatchObject({ id: maths.id, name: "Maths Olympiad", organiserName: "Thandi Mokoena", schoolCount: 2, studentCount: 3 });
    expect(detail.rounds).toEqual([
      expect.objectContaining({ id: released.id, state: "results_released", participantCount: 3, submissionCount: 3 }),
      expect.objectContaining({ id: upcoming.id, state: "scheduled", participantCount: 0, submissionCount: 0, resultsReleasedAt: null }),
    ]);
  });

  it("responds 404 for an unknown olympiad and 422 for a malformed id", async () => {
    expectError(await api().get(`/public/olympiads/${MISSING}`), 404, "Olympiad not found");
    expectError(await api().get("/public/olympiads/not-a-uuid"), 422, "Valid olympiad UUID required");
  });
});

describe("GET /public/olympiads/:olympiadId/rounds/:roundId/results", () => {
  it("summarises a released round without any learner's own result", async () => {
    const { maths, released } = await setup();

    expect(expectOk(await api().get(resultsUrl(maths, released)))).toEqual({
      roundName: "Round 1",
      olympiadName: "Maths Olympiad",
      totalParticipants: 3,
      totalSubmissions: 3,
      maxPossibleScore: 10,
      averageScore: 5.67,
      medianScore: 6,
      highestScore: 8,
      lowestScore: 3,
      qualifyingThreshold: 60,
      qualifiedCount: 2,
      gradeDistribution: { "90-100": 0, "80-89": 1, "70-79": 0, "60-69": 1, "50-59": 0, "40-49": 0, "30-39": 1, "0-29": 0 },
    });
  });

  it("refuses a round whose results aren't out, or that belongs to another olympiad", async () => {
    const { maths, science, released, unreleased } = await setup();

    expectError(await api().get(resultsUrl(science, unreleased)), 400, "Results have not been released for this round");
    expectError(await api().get(resultsUrl(science, released)), 404, "Round does not belong to this olympiad");
    expectError(await api().get(resultsUrl(maths, { id: MISSING })), 404, "Round not found");
  });

  it("responds 422 for malformed ids", async () => {
    expectError(await api().get("/public/olympiads/x/rounds/y/results"), 422, "Valid olympiad UUID required, Valid round UUID required");
  });
});

describe("GET /public/olympiads/:olympiadId/rounds/:roundId/results/by-school", () => {
  it("summarises each school's results, best average first", async () => {
    const { maths, released, parktown, sandton } = await setup();

    const { schools } = expectOk(await api().get(`${resultsUrl(maths, released)}/by-school`));

    expect(schools).toEqual([
      expect.objectContaining({ schoolId: parktown.id, schoolName: "Parktown High", participantCount: 2, averageScore: 7, qualifiedCount: 2 }),
      expect.objectContaining({ schoolId: sandton.id, schoolName: "Sandton College", participantCount: 1, averageScore: 3, qualifiedCount: 0 }),
    ]);
  });
});

describe("GET /public/olympiads/:id/leaderboard", () => {
  it("ranks schools by their average across released rounds", async () => {
    const { maths } = await setup();

    expect(expectOk(await api().get(`/public/olympiads/${maths.id}/leaderboard`))).toEqual({
      olympiadName: "Maths Olympiad",
      schools: [
        { rank: 1, schoolName: "Parktown High", averageScore: 7, totalParticipants: 2, qualifiedCount: 2 },
        { rank: 2, schoolName: "Sandton College", averageScore: 3, totalParticipants: 1, qualifiedCount: 0 },
      ],
    });
  });

  it("is empty before any results are out", async () => {
    const { science } = await setup();
    expect(expectOk(await api().get(`/public/olympiads/${science.id}/leaderboard`))).toEqual({ olympiadName: "Science Olympiad", schools: [] });
  });
});

describe("GET /public/schools/top", () => {
  it("ranks schools across every olympiad, and limits the list", async () => {
    const { parktown } = await setup();

    const top = expectOk(await api().get("/public/schools/top"));
    expect(top.map((s) => [s.rank, s.schoolName, s.averageScore])).toEqual([
      [1, "Parktown High", 7],
      [2, "Sandton College", 3],
    ]);
    expect(top[0]).toEqual({ rank: 1, schoolId: parktown.id, schoolName: "Parktown High", averageScore: 7, totalResults: 2, totalStudents: 2, totalOlympiads: 1 });

    expect(expectOk(await api().get("/public/schools/top").query({ limit: 1 }))).toHaveLength(1);
    expectError(await api().get("/public/schools/top").query({ limit: 51 }), 422, "Limit must be 1–50");
  });
});

describe("GET /public/schools", () => {
  it("lists schools by name, with search and pages", async () => {
    const { parktown } = await setup();

    const { schools, pagination } = expectOk(await api().get("/public/schools"));
    expect(schools.map((s) => s.name)).toEqual(["Parktown High", "Sandton College"]);
    expect(schools[0]).toEqual({ id: parktown.id, name: "Parktown High", olympiadCount: 1, studentCount: 2 });
    expect(pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });

    const found = expectOk(await api().get("/public/schools").query({ search: "sandton" }));
    expect(found.schools.map((s) => s.name)).toEqual(["Sandton College"]);
  });
});

describe("GET /public/schools/:id", () => {
  it("shows a school's participation and averages", async () => {
    const { parktown, maths, released } = await setup();

    expect(expectOk(await api().get(`/public/schools/${parktown.id}`))).toEqual({
      id: parktown.id,
      name: "Parktown High",
      olympiads: [{ id: maths.id, name: "Maths Olympiad", year: released.opens_at.getFullYear(), studentCount: 2, averageScore: 7 }],
      stats: { totalStudents: 2, totalRoundsParticipated: 1, overallAverageScore: 7 },
    });
  });

  it("responds 404 for an unknown school", async () => {
    expectError(await api().get(`/public/schools/${MISSING}`), 404, "School not found");
  });
});

describe("GET /public/papers", () => {
  it("lists released papers with download links that work from anywhere", async () => {
    const { maths, paper } = await setup();

    const { papers, pagination } = expectOk(await api().get("/public/papers"));

    expect(papers).toEqual([
      {
        id: paper.id,
        title: "Maths Round 1 paper",
        olympiadId: maths.id,
        olympiadName: "Maths Olympiad",
        roundName: "Round 1",
        year: expect.any(Number),
        fileUrl: expect.stringMatching(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/public/papers/${paper.id}/download$`)),
        memoFileUrl: expect.stringMatching(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/public/papers/${paper.id}/download\\?type=memo$`)),
      },
    ]);
    // Never the storage path itself, which nobody outside could open
    expect(JSON.stringify(papers)).not.toContain("maths/round-1/paper.pdf");
    expect(pagination.total).toBe(1);
  });

  it("filters by olympiad", async () => {
    const { science } = await setup();
    expect(expectOk(await api().get("/public/papers").query({ olympiad: science.id })).papers).toEqual([]);
    expectError(await api().get("/public/papers").query({ olympiad: "maths" }), 422, "Valid olympiad UUID required");
  });

  it("gives the address clients called, behind the proxy too", async () => {
    await setup();
    const { papers } = expectOk(await api().get("/public/papers").set("X-Forwarded-Proto", "https"));
    expect(papers[0].fileUrl).toMatch(/^https:\/\//);
  });
});

describe("GET /public/papers/:id/download", () => {
  it("redirects to a short-lived link to the paper, or its memo", async () => {
    const { paper } = await setup();

    const res = await api().get(`/public/papers/${paper.id}/download`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://storage.test/maths/round-1/paper.pdf?expires=60");
    // The link expires, so the redirect must not be cached
    expect(res.headers["cache-control"]).toBe("no-store");

    const memo = await api().get(`/public/papers/${paper.id}/download`).query({ type: "memo" });
    expect(memo.headers.location).toBe("https://storage.test/maths/round-1/memo.pdf?expires=60");
    expect(supabase.storage.from).toHaveBeenCalledWith("papers");
  });

  it("follows the link in the paper list", async () => {
    await setup();
    const { papers } = expectOk(await api().get("/public/papers"));

    const res = await api().get(new URL(papers[0].fileUrl).pathname);

    expect(res.status).toBe(302);
  });

  it("doesn't serve a paper before its round's results are out", async () => {
    const { unreleasedPaper } = await setup();
    expectError(await api().get(`/public/papers/${unreleasedPaper.id}/download`), 404, "Paper not found");
    expect(supabase.storage.bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("responds 404 for a memo that was never uploaded, or an unknown paper", async () => {
    const { paper } = await setup();
    await prisma.papers.update({ where: { id: paper.id }, data: { memo_file_url: null } });

    expectError(await api().get(`/public/papers/${paper.id}/download`).query({ type: "memo" }), 404, "Memo not found");
    expectError(await api().get(`/public/papers/${MISSING}/download`), 404, "Paper not found");
  });

  it("responds 502 when storage can't make the link", async () => {
    const { paper } = await setup();
    supabase.storage.bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: "storage down" } });

    expectError(await api().get(`/public/papers/${paper.id}/download`), 502, "The file couldn't be fetched. Please try again.");
  });

  it("responds 422 for an unknown file type", async () => {
    const { paper } = await setup();
    expectError(await api().get(`/public/papers/${paper.id}/download`).query({ type: "answers" }), 422, "Type must be 'paper' or 'memo'");
  });
});

describe("privacy", () => {
  it("never exposes a learner's name, email, id or own result", async () => {
    const world = await setup();
    const { maths, released, parktown } = world;
    const urls = [
      "/public/stats",
      "/public/stats/yearly",
      "/public/activity",
      `/public/calendar?from=${f.hoursFromNow(-100).toISOString()}&to=${f.hoursFromNow(100).toISOString()}`,
      "/public/search?q=a",
      "/public/olympiads",
      `/public/olympiads/${maths.id}`,
      resultsUrl(maths, released),
      `${resultsUrl(maths, released)}/by-school`,
      `/public/olympiads/${maths.id}/leaderboard`,
      "/public/schools/top",
      "/public/schools",
      `/public/schools/${parktown.id}`,
      "/public/papers",
    ];

    const bodies = await Promise.all(urls.map(async (url) => JSON.stringify(expectOk(await api().get(url)))));
    const everything = bodies.join("\n");

    for (const { user, entrant } of world.learners) {
      for (const secret of [entrant.full_name, entrant.id, user.id, user.email, user.full_name]) {
        expect(everything).not.toContain(secret);
      }
    }
    // Nor the organiser's email: only their name is public
    expect(everything).not.toContain(world.organiser.email);
  });
});
