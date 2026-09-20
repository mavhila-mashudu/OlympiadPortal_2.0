// The educator's other core job: getting learners into the competition.
import { expect, test } from "@playwright/test";
import { signInAsEducator } from "./helpers";
import { DRAFT_ROUND, USERS } from "./test-data";

test("an educator registers a learner and invites a student to join", async ({ page }) => {
  const learner = `New Learner ${Date.now()}`;
  await signInAsEducator(page, USERS.educator);

  // The sidebar link, not the shortcut on a round card
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Register entrants" }).click();
  await expect(page.getByRole("heading", { name: "Entrants & invitations" })).toBeVisible();

  // Register a learner for the olympiad
  await page.getByLabel(/^Full name/).fill(learner);
  await page.getByLabel("Student number").fill(`S${Date.now()}`);
  await page.getByLabel("Grade").selectOption("10");
  await page.getByRole("button", { name: "Add entrant" }).click();

  // Registered for every round still open to entries, which always
  // includes the scheduled one
  await expect(page.getByText(new RegExp(`${learner} has been registered for .*${DRAFT_ROUND.name}`))).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: learner });
  await expect(row).toBeVisible();
  await expect(row.getByText("10")).toBeVisible();

  // Invite a student to create their own account
  await page.getByLabel(/^Student email/).fill(`learner.${Date.now()}@e2e.test`);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert")).toContainText(/invitation/i);
});
