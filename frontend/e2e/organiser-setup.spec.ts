// Organiser journeys for setting a competition up: creating a round with its
// question paper, and inviting a school to take part.
import { expect, test } from "@playwright/test";
import { signInAsOrganiser } from "./helpers";
import { OLYMPIAD, USERS } from "./test-data";

test.beforeEach(async ({ page }) => {
  await signInAsOrganiser(page, USERS.organiser);
});

test("an organiser creates a round and uploads its question paper", async ({ page }) => {
  const roundName = `Round 3 — National ${Date.now()}`;

  await page.getByRole("link", { name: "Create round" }).first().click();
  await expect(page.getByRole("heading", { name: "Create a round" })).toBeVisible();

  await page.getByLabel(/^Olympiad/).selectOption({ label: OLYMPIAD.name });
  await page.getByLabel(/^Round name/).fill(roundName);
  await page.getByLabel("Qualifying threshold").fill("60");
  await page.getByLabel("Instructions for educators").fill("Calculators allowed.");
  await page.getByLabel(/^Opens at/).fill("2026-11-01T08:00");
  await page.getByLabel(/^Closes at/).fill("2026-11-01T10:30");
  await page.getByLabel("Paper file").setInputFiles({
    name: "national-paper.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 national paper"),
  });

  await page.getByRole("button", { name: "Create round" }).click();

  // Back on the dashboard, the new round is listed and can be opened
  await expect(page).toHaveURL(/\/organiser$/);
  const row = page.getByRole("row").filter({ hasText: roundName });
  await expect(row).toBeVisible();
  await expect(row.getByText("Upcoming")).toBeVisible();

  await row.getByRole("button", { name: "Open round" }).click();
  await expect(row.getByRole("button", { name: "Close round" })).toBeVisible();
});

test("an organiser invites a school and gets its invitation code", async ({ page }) => {
  await page.goto("/organiser/schools");
  await expect(page.getByRole("heading", { name: "Registered Schools" })).toBeVisible();

  await page.getByRole("button", { name: "Invite school" }).click();
  await page.getByLabel("School name").fill("Northview College");
  await page.getByLabel("Contact email").fill(`head.${Date.now()}@northview.test`);
  await page.getByRole("button", { name: "Send invitation" }).click();

  // The code is shown so the organiser can pass it on
  await expect(page.getByText(/^SCH-[A-Z2-9]{4}$/)).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  const row = page.getByRole("row").filter({ hasText: "Northview College" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Pending")).toBeVisible();
});
