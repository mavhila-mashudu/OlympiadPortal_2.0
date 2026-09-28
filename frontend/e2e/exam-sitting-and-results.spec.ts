// The competition itself: a student sits the exam online, the organiser
// closes the round, marks what needs a human and releases the results, and
// the student sees their score. Each step depends on the one before it.
import { expect, test } from "@playwright/test";
import { signInAsOrganiser, signInAsStudent } from "./helpers";
import { LIVE_ROUND, USERS } from "./test-data";

test.describe.configure({ mode: "serial" });

test("a student sits the exam online and submits it", async ({ page }) => {
  await signInAsStudent(page, USERS.student);

  await page.getByRole("link", { name: "Sit exam online" }).click();
  await expect(page.getByRole("heading", { name: LIVE_ROUND.name })).toBeVisible();
  await expect(page.getByText("2 questions · 6 points")).toBeVisible();

  await page.getByRole("button", { name: "Start exam" }).click();

  // Every entrant sits their own shuffled variant: the question order and
  // the option order differ per learner. Answer whichever question is on
  // screen and pick the primes by their displayed labels.
  const answerCurrent = async () => {
    await expect(
      page
        .getByText("Which of these numbers are prime?")
        .or(page.getByText("What is the capital city of South Africa?")),
    ).toBeVisible();
    if (await page.getByText("Which of these numbers are prime?").isVisible()) {
      await page.getByText(/^[A-D]\. 2$/).click();
      await page.getByText(/^[A-D]\. 5$/).click();
      // One question answered if the MCQ came first, two if it came second.
      await expect(page.getByText(/^Answered \([12]\)$/).first()).toBeVisible();
    } else {
      await page.getByPlaceholder("Type your answer...").fill("Pretoria");
      await expect(page.getByText("All answers saved")).toBeVisible();
    }
  };

  await answerCurrent();
  await page.getByRole("button", { name: "Next" }).click();
  await answerCurrent();

  await page.getByRole("button", { name: "Submit exam" }).click();
  await expect(page.getByText("You have answered 2 of 2 questions.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm submit" }).click();

  await expect(page.getByRole("heading", { name: "Exam submitted" })).toBeVisible();
  // Both questions are marked automatically: 4 + 2
  await expect(page.getByText(/Total points:\s*6\s*\/\s*6/)).toBeVisible();
  await expect(page.getByText("Auto-marked")).toBeVisible();
});

test("the organiser closes the round and releases the results", async ({ page }) => {
  await signInAsOrganiser(page, USERS.organiser);

  const row = page.getByRole("row").filter({ hasText: LIVE_ROUND.name });
  await row.getByRole("button", { name: "Close round" }).click();
  // The badge says Closed, and so does the now-disabled button
  await expect(row.getByText("Closed").first()).toBeVisible();

  // Nothing needs a human marker, so results can be generated straight away
  await page.goto(`/organiser/rounds/${LIVE_ROUND.id}/marking`);
  await expect(page.getByRole("heading", { name: "Nothing to mark" })).toBeVisible();
  await page.getByRole("button", { name: "Generate results" }).click();

  await expect(page.getByRole("heading", { name: "Results released" })).toBeVisible();
});

test("the student sees their released result", async ({ page }) => {
  await signInAsStudent(page, USERS.student);

  // The full name avoids also matching the dashboard's "View results" link
  // once the released result has loaded.
  await page.getByRole("link", { name: "Results & certificates" }).click();
  await expect(page.getByRole("heading", { name: "Results & certificates" })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: LIVE_ROUND.name });
  await expect(row.getByText("Marked")).toBeVisible();
  await expect(row.getByText("6 / 6")).toBeVisible();
  await expect(row.getByText("100%")).toBeVisible();
});
