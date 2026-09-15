import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import * as fx from "./support/fixtures";
import { mockApi, mockApiError, mockNetworkFailure, mockSupabaseSignIn, mockSupabaseSignOut } from "./support/network";
import { renderApp } from "./support/renderApp";

// Stops the dashboard each role lands on from making unhandled requests
const mockLandingPages = () => {
  mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
  mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
  mockApi("get", "/educator/rounds", { rounds: [], school: fx.school });
  mockApi("get", "/rounds/registered", { rounds: [], stats: { roundsEntered: 0, resultsAvailable: 0, certificatesEarned: 0 } });
};

beforeEach(() => {
  localStorage.removeItem("op_access_token");
});

describe("logging in", () => {
  const fillAndSubmit = async (user: ReturnType<typeof renderApp>["user"], password = "Secret123") => {
    await user.type(screen.getByLabelText("Email address"), "thandi@olympiad.test");
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", { name: "Log in" }));
  };

  it("redirects the home page to the login page", () => {
    const { currentPath } = renderApp("/");
    expect(currentPath()).toBe("/login");
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it.each([
    ["organiser", "/organiser", "Organiser dashboard"],
    ["educator", "/educator", "Your rounds"],
    ["student", "/student", "Your olympiad"],
  ] as const)("signs a %s in and opens their dashboard", async (role, path, heading) => {
    mockLandingPages();
    const signIns = mockSupabaseSignIn({ userId: `${role}-user`, accessToken: `jwt-for-${role}` });
    mockApi("get", "/auth/me", fx.me(role));
    const { user, currentPath } = renderApp("/login");

    await fillAndSubmit(user);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(currentPath()).toBe(path);
    expect(signIns).toEqual([{ email: "thandi@olympiad.test", password: "Secret123", gotrue_meta_security: {} }]);
    expect(localStorage.getItem("op_access_token")).toBe(`jwt-for-${role}`);
  });

  it("uses the Supabase token to ask the backend who the user is", async () => {
    mockLandingPages();
    mockSupabaseSignIn({ userId: "organiser-user", accessToken: "jwt-abc" });
    const meCalls = mockApi("get", "/auth/me", fx.me("organiser"));
    const { user } = renderApp("/login");

    await fillAndSubmit(user);

    await waitFor(() => expect(meCalls).toHaveLength(1));
    expect(meCalls[0].headers.get("authorization")).toBe("Bearer jwt-abc");
  });

  it("shows Supabase's message for wrong credentials and stays on the page", async () => {
    mockSupabaseSignIn({ error: "Invalid login credentials" });
    const { user, currentPath } = renderApp("/login");

    await fillAndSubmit(user, "wrong");

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
    expect(localStorage.getItem("op_access_token")).toBeNull();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("explains when the backend can't be reached", async () => {
    mockSupabaseSignIn({ userId: "organiser-user" });
    mockNetworkFailure("get", "/auth/me");
    const { user } = renderApp("/login");

    await fillAndSubmit(user);

    expect(
      await screen.findByText("We couldn’t reach the server. Make sure the frontend and backend are running, then try again."),
    ).toBeInTheDocument();
  });

  it("shows a backend error such as a deleted account", async () => {
    mockSupabaseSignIn({ userId: "organiser-user" });
    mockApiError("get", "/auth/me", 401, "Account not found or deleted");
    const { user } = renderApp("/login");

    await fillAndSubmit(user);
    expect(await screen.findByText("Account not found or deleted")).toBeInTheDocument();
  });

  it("links to organiser sign-up", async () => {
    const { user, currentPath } = renderApp("/login");
    await user.click(screen.getByRole("link", { name: "Create organiser account" }));
    expect(currentPath()).toBe("/signup");
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
  });
});

describe("signing up", () => {
  const fillDetails = async (user: ReturnType<typeof renderApp>["user"]) => {
    await user.type(screen.getByLabelText("Full name"), "Thandi Mokoena");
    await user.type(screen.getByLabelText("Email address"), "thandi@olympiad.test");
    await user.type(screen.getByLabelText("Password"), "Secret123");
  };

  it("registers an organiser, signs them in and opens the organiser dashboard", async () => {
    mockLandingPages();
    const registrations = mockApi("post", "/auth/register/organiser", { user: { id: "organiser-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "organiser-user", accessToken: "fresh-jwt" });
    mockApi("get", "/auth/me", fx.me("organiser"));
    const { user, currentPath } = renderApp("/signup");

    expect(screen.queryByLabelText("Invitation code")).not.toBeInTheDocument();
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Organiser dashboard" })).toBeInTheDocument();
    expect(currentPath()).toBe("/organiser");
    expect(registrations[0].body).toEqual({
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      password: "Secret123",
    });
    expect(localStorage.getItem("op_access_token")).toBe("fresh-jwt");
  });

  it("shows the backend's validation error and doesn't sign in", async () => {
    mockApiError("post", "/auth/register/organiser", 409, "Email already registered");
    const signIns = mockSupabaseSignIn({ userId: "x" });
    const { user, currentPath } = renderApp("/signup");

    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(signIns).toHaveLength(0);
    expect(currentPath()).toBe("/signup");
  });

  it("registers an invited educator with the code they typed", async () => {
    mockLandingPages();
    const registrations = mockApi("post", "/auth/register", { user: { id: "educator-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "educator-user" });
    mockApi("get", "/auth/me", fx.me("educator"));
    const { user, currentPath } = renderApp("/signup");

    await user.click(screen.getByRole("button", { name: /Educator \/ Student/ }));
    await fillDetails(user);
    await user.type(screen.getByLabelText("Invitation code"), "EDU-1A2B-3C4D");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Your rounds" })).toBeInTheDocument();
    expect(currentPath()).toBe("/educator");
    expect(registrations[0].body).toEqual({
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      password: "Secret123",
      code: "EDU-1A2B-3C4D",
      invite_token: "",
    });
  });

  it("opens an emailed invitation link in the invited form and sends its token", async () => {
    mockLandingPages();
    const registrations = mockApi("post", "/auth/register", { user: { id: "student-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "student-user" });
    mockApi("get", "/auth/me", fx.me("student"));
    const { user, currentPath } = renderApp("/register?token=emailed-token&code=STU-9F8E-7D6C");

    expect(screen.getByLabelText("Invitation code")).toHaveValue("STU-9F8E-7D6C");
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Your olympiad" })).toBeInTheDocument();
    expect(currentPath()).toBe("/student");
    expect(registrations[0].body).toMatchObject({ code: "STU-9F8E-7D6C", invite_token: "emailed-token" });
  });

  it("links back to login", async () => {
    const { user, currentPath } = renderApp("/signup");
    await user.click(screen.getByRole("link", { name: "Log in" }));
    expect(currentPath()).toBe("/login");
  });
});

describe("logging out", () => {
  const logIn = async (user: ReturnType<typeof renderApp>["user"], email: string) => {
    await user.type(screen.getByLabelText("Email address"), email);
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));
  };

  it("clears the session so the next student on this computer starts fresh", async () => {
    mockLandingPages();
    mockSupabaseSignIn({ userId: "student-user", accessToken: "jwt-ayanda" });
    const signOuts = mockSupabaseSignOut();
    const students = [fx.me("student"), fx.me("student", { id: "student-2", full_name: "Lerato Nkosi" })];
    const meCalls = mockApi("get", "/auth/me", () => students[Math.min(meCalls.length - 1, 1)]);
    const { user, currentPath, queryClient } = renderApp("/login");

    await logIn(user, "ayanda@olympiad.test");
    expect(await screen.findByText("Ayanda Khumalo · Parktown High")).toBeInTheDocument();
    // Progress from an exam Ayanda sat on this device
    localStorage.setItem("exam-answers-round-1", JSON.stringify({ answers: { q: "42" }, dirty: ["q"] }));
    localStorage.setItem("exam-flags-round-1", JSON.stringify(["q"]));

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
    expect(localStorage.getItem("op_access_token")).toBeNull();
    expect(localStorage.getItem("exam-answers-round-1")).toBeNull();
    expect(localStorage.getItem("exam-flags-round-1")).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    await waitFor(() => expect(signOuts).toEqual(["?scope=local"]));

    // A different student signs in on the same tab
    mockSupabaseSignIn({ userId: "student-2", accessToken: "jwt-lerato" });
    await logIn(user, "lerato@olympiad.test");

    expect(await screen.findByText("Lerato Nkosi · Parktown High")).toBeInTheDocument();
    expect(screen.queryByText(/Ayanda Khumalo/)).not.toBeInTheDocument();
    expect(localStorage.getItem("op_access_token")).toBe("jwt-lerato");
  });

  it("returns to the login page when there is no Supabase session to end", async () => {
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
    localStorage.setItem("op_access_token", "jwt");
    const { user, currentPath } = renderApp("/organiser");

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(currentPath()).toBe("/login");
    expect(localStorage.getItem("op_access_token")).toBeNull();
  });
});
