import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import * as fx from "./support/fixtures";
import {
  mockApi,
  mockApiError,
  mockNetworkFailure,
  mockSupabasePasswordReset,
  mockSupabaseSignIn,
  mockSupabaseSignOut,
} from "./support/network";
import { renderApp } from "./support/renderApp";

// Stops the dashboard each role lands on from making unhandled requests
const mockLandingPages = () => {
  mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
  mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
  mockApi("get", "/educator/rounds", { rounds: [], school: fx.school });
  mockApi("get", "/rounds/registered", { rounds: [], stats: { roundsEntered: 0, resultsAvailable: 0, certificatesEarned: 0 } });
  mockApi("get", "/invites/mine", { invites: [] });
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

  const mockSchools = () =>
    mockApi("get", "/auth/schools", {
      schools: [
        { id: "school-1", name: "Parktown High" },
        { id: "school-2", name: "Northview College" },
      ],
    });

  it("registers an organiser, signs them in and opens the organiser dashboard", async () => {
    mockLandingPages();
    mockSchools();
    const registrations = mockApi("post", "/auth/register", { user: { id: "organiser-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "organiser-user", accessToken: "fresh-jwt" });
    mockApi("get", "/auth/me", fx.me("organiser"));
    const { user, currentPath } = renderApp("/signup");

    // An organiser needs no school, and no invitation code exists any more
    expect(screen.queryByLabelText("School")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Invitation code")).not.toBeInTheDocument();

    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Organiser dashboard" })).toBeInTheDocument();
    expect(currentPath()).toBe("/organiser");
    expect(registrations[0].body).toEqual({
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      password: "Secret123",
      role: "organiser",
    });
    expect(localStorage.getItem("op_access_token")).toBe("fresh-jwt");
  });

  it("shows the backend's validation error and doesn't sign in", async () => {
    mockSchools();
    mockApiError("post", "/auth/register", 409, "Email already registered");
    const signIns = mockSupabaseSignIn({ userId: "x" });
    const { user, currentPath } = renderApp("/signup");

    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(signIns).toHaveLength(0);
    expect(currentPath()).toBe("/signup");
  });

  it("registers an educator against a school picked from the list, with no invitation code", async () => {
    mockLandingPages();
    mockSchools();
    const registrations = mockApi("post", "/auth/register", { user: { id: "educator-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "educator-user" });
    mockApi("get", "/auth/me", fx.me("educator"));
    const { user, currentPath } = renderApp("/signup");

    await user.click(screen.getByRole("radio", { name: /Educator/ }));
    await user.selectOptions(await screen.findByLabelText("School"), "school-1");
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Your rounds" })).toBeInTheDocument();
    expect(currentPath()).toBe("/educator");
    expect(registrations[0].body).toEqual({
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      password: "Secret123",
      role: "educator",
      school_id: "school-1",
    });
  });

  it("lets an educator name a school that is not listed yet", async () => {
    mockLandingPages();
    mockSchools();
    const registrations = mockApi("post", "/auth/register", { user: { id: "educator-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "educator-user" });
    mockApi("get", "/auth/me", fx.me("educator"));
    const { user } = renderApp("/signup");

    await user.click(screen.getByRole("radio", { name: /Educator/ }));
    await user.selectOptions(await screen.findByLabelText("School"), "__new__");
    await user.type(screen.getByLabelText("School name"), "Eastridge Academy");
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registrations).toHaveLength(1));
    expect(registrations[0].body).toEqual({
      full_name: "Thandi Mokoena",
      email: "thandi@olympiad.test",
      password: "Secret123",
      role: "educator",
      school_name: "Eastridge Academy",
    });
  });

  it("registers a student against an existing school, and offers no way to invent one", async () => {
    mockLandingPages();
    mockSchools();
    const registrations = mockApi("post", "/auth/register", { user: { id: "student-user" } }, { status: 201 });
    mockSupabaseSignIn({ userId: "student-user" });
    mockApi("get", "/auth/me", fx.me("student"));
    const { user, currentPath } = renderApp("/signup");

    await user.click(screen.getByRole("radio", { name: /Student/ }));
    const schoolSelect = await screen.findByLabelText("School");
    expect(within(schoolSelect).queryByText(/isn’t listed/)).not.toBeInTheDocument();

    await user.selectOptions(schoolSelect, "school-2");
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Your olympiad" })).toBeInTheDocument();
    expect(currentPath()).toBe("/student");
    expect(registrations[0].body).toMatchObject({ role: "student", school_id: "school-2" });
  });

  it("still offers the school list when /register is opened directly", async () => {
    mockSchools();
    renderApp("/register");

    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Invitation code")).not.toBeInTheDocument();
  });

  it("links back to login", async () => {
    mockSchools();
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

describe("resetting a forgotten password", () => {
  it("asks Supabase to email a reset link back to this site", async () => {
    const { requests } = mockSupabasePasswordReset();
    const { user } = renderApp("/login");

    await user.click(screen.getByRole("link", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email address"), "thandi@olympiad.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText(/a reset link is on its way/i)).toBeInTheDocument();
    expect(requests).toEqual([
      { email: "thandi@olympiad.test", redirect_to: "http://localhost:3000/reset-password" },
    ]);
  });

  it("says the same thing for an address without an account", async () => {
    mockSupabasePasswordReset();
    const { user } = renderApp("/forgot-password");

    await user.type(screen.getByLabelText("Email address"), "nobody@olympiad.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    // The form must not reveal who has an account
    expect(await screen.findByText(/a reset link is on its way/i)).toBeInTheDocument();
    expect(screen.queryByText(/not found|no account/i)).not.toBeInTheDocument();
  });

  it("sets a new password from the emailed link", async () => {
    const { verifications, updates } = mockSupabasePasswordReset({ token: "recovery-token" });
    const { user } = renderApp("/reset-password?token_hash=recovery-token&type=recovery");

    await waitFor(() => expect(verifications).toHaveLength(1));
    await user.type(screen.getByLabelText("New password"), "BrandNew456");
    await user.type(screen.getByLabelText("Confirm new password"), "BrandNew456");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Your password has been changed. You can now log in with it.")).toBeInTheDocument();
    expect(verifications[0]).toMatchObject({ token_hash: "recovery-token", type: "recovery" });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ password: "BrandNew456" });
  });

  it.each([
    ["short", "Short1", "Short1", "Use at least 8 characters."],
    ["mismatched", "BrandNew456", "BrandNew457", "The two passwords don’t match."],
  ])("refuses a %s password without calling Supabase", async (_label, password, confirmation, message) => {
    const { updates } = mockSupabasePasswordReset({ token: "recovery-token" });
    const { user } = renderApp("/reset-password?token_hash=recovery-token&type=recovery");

    await user.type(screen.getByLabelText("New password"), password);
    await user.type(screen.getByLabelText("Confirm new password"), confirmation);
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(updates).toHaveLength(0);
  });

  it("explains when the link has already been used or expired", async () => {
    mockSupabasePasswordReset({ token: "recovery-token", verifyError: "Email link is invalid or has expired" });
    renderApp("/reset-password?token_hash=used-token&type=recovery");

    expect(await screen.findByText("Email link is invalid or has expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled();
  });

  it("explains a link with no token at all", async () => {
    mockSupabasePasswordReset();
    renderApp("/reset-password");

    expect(await screen.findByText("This reset link is invalid. Please request a new one.")).toBeInTheDocument();
  });
});

describe("deleting an account", () => {
  const signedInOrganiser = () => {
    localStorage.setItem("op_access_token", "test-token");
    mockApi("get", "/olympiads", { olympiads: [fx.olympiad()] });
    mockApi("get", "/olympiads/oly-1/rounds", { rounds: [] });
  };

  it("asks for confirmation, then deletes the account and returns to login", async () => {
    signedInOrganiser();
    const deletions = mockApi("delete", "/auth/account", { message: "Account deleted" });
    mockSupabaseSignOut();
    const { user, currentPath, queryClient } = renderApp("/organiser");

    await screen.findByRole("heading", { name: "Organiser dashboard" });
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("heading", { name: "Delete your account?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(screen.queryByRole("heading", { name: "Delete your account?" })).not.toBeInTheDocument();
    expect(deletions).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete account" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(currentPath()).toBe("/login");
    expect(deletions).toHaveLength(1);
    expect(localStorage.getItem("op_access_token")).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("keeps the user signed in when the deletion fails", async () => {
    signedInOrganiser();
    mockApiError("delete", "/auth/account", 500, "Something went wrong");
    const { user, currentPath } = renderApp("/organiser");

    await screen.findByRole("heading", { name: "Organiser dashboard" });
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete account" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(currentPath()).toBe("/organiser");
    expect(localStorage.getItem("op_access_token")).toBe("test-token");
  });
});
