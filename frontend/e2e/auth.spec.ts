// Account journeys: signing in, signing up, resetting a password, deleting an
// account and logging out — each one clicked through the real UI.
import { expect, test } from "@playwright/test";
import { readResetLink, signIn } from "./helpers";
import { INVITE, PASSWORD, USERS } from "./test-data";

test.describe("signing in", () => {
  test("each role signs in and lands on their own dashboard", async ({ page }) => {
    await signIn(page, USERS.organiser, "/organiser");
    await expect(page.getByRole("heading", { name: "Organiser dashboard" })).toBeVisible();

    await signIn(page, USERS.educator, "/educator");
    await expect(page.getByRole("heading", { name: "Your rounds" })).toBeVisible();

    await signIn(page, USERS.student, "/student");
    await expect(page.getByRole("heading", { name: "Your olympiad" })).toBeVisible();
  });

  test("a wrong password is refused and the user stays on the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(USERS.organiser.email);
    await page.getByLabel("Password", { exact: true }).fill("not-my-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Invalid login credentials")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logging out ends the session", async ({ page }) => {
    await signIn(page, USERS.organiser, "/organiser");

    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    // Going back to a signed-in page no longer shows another user's data
    await page.goto("/organiser");
    await expect(page.getByText(/Invalid or expired token|No token provided/)).toBeVisible();
  });
});

test.describe("signing up", () => {
  test("a new organiser creates an account and is taken to their dashboard", async ({ page }) => {
    const email = `new.organiser.${Date.now()}@e2e.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("New Organiser");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/organiser$/);
    await expect(page.getByRole("heading", { name: "Organiser dashboard" })).toBeVisible();

    // The new account can sign in again on its own
    await page.getByRole("button", { name: "Log out" }).click();
    await signIn(page, { email, password: PASSWORD }, "/organiser");
  });

  test("a student joins with the invitation code from their school", async ({ page }) => {
    const email = `new.student.${Date.now()}@e2e.test`;

    await page.goto("/signup");
    await page.getByRole("button", { name: /Educator \/ Student/ }).click();
    await page.getByLabel("Full name").fill("Invited Learner");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Invitation code").fill(INVITE.code);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { name: "Your olympiad" })).toBeVisible();
  });
});

test("a forgotten password is reset and the new one works", async ({ page }) => {
  const newPassword = "BrandNew456";

  // Ask for the link
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address").fill(USERS.resetting.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/a reset link is on its way/i)).toBeVisible();

  // Follow the link from the email and choose a new password
  await page.goto(await readResetLink(page, USERS.resetting.email));
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password has been changed. You can now log in with it.")).toBeVisible();

  // The old password no longer works, the new one does
  await page.goto("/login");
  await page.getByLabel("Email address").fill(USERS.resetting.email);
  await page.getByLabel("Password", { exact: true }).fill(USERS.resetting.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Invalid login credentials")).toBeVisible();

  await signIn(page, { email: USERS.resetting.email, password: newPassword }, "/organiser");
});

test("an account is deleted and can no longer sign in", async ({ page }) => {
  await signIn(page, USERS.disposable, "/organiser");

  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("heading", { name: "Delete your account?" })).toBeVisible();
  // Changing your mind keeps the account
  await page.getByRole("button", { name: "Keep my account" }).click();
  await expect(page.getByRole("heading", { name: "Delete your account?" })).toBeHidden();

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(USERS.disposable.email);
  await page.getByLabel("Password", { exact: true }).fill(USERS.disposable.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
});
