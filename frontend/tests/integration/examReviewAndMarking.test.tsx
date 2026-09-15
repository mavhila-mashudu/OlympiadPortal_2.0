import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fx from "./support/fixtures";
import { mockApi, mockApiError } from "./support/network";
import { renderApp } from "./support/renderApp";

describe("organiser exam review", () => {
  const questions = () => [
    fx.question({ id: "q-1", prompt: "Which of these are prime?", max_points: "2", correct_option: "0,2", negative_pct: "25" }),
    fx.question({ id: "q-2", type: "true_false", prompt: "Zero is even.", options: ["True", "False"], correct_option: "0", max_points: "1" }),
    fx.question({ id: "q-3", type: "short_answer", prompt: "What is 7 × 8?", options: null, correct_option: null, correct_answer: "56", max_points: "3" }),
    fx.question({ id: "q-4", type: "essay", prompt: "Prove there are infinitely many primes.", options: null, correct_option: null, max_points: "10" }),
  ];

  // The review page loads questions, exam status and the memo link together
  const mockReview = ({ status = "ready", memo = true } = {}) => {
    const state = {
      questions: questions(),
      status: fx.examStatus({ exam_status: status, question_count: 4, paper_id: "paper-1" }),
    };
    mockApi("get", "/rounds/round-1/questions", () => ({ questions: state.questions }));
    mockApi("get", "/rounds/round-1/exam-status", () => state.status);
    if (memo) mockApi("get", "/papers/by-round/round-1", (req) => ({ url: `https://storage.test/memo.pdf${req.search}` }));
    else mockApiError("get", "/papers/by-round/round-1", 404, "No paper uploaded for this round");
    return state;
  };

  it("summarises the exam with numeric totals and shows each question's answer key", async () => {
    mockReview();
    renderApp("/organiser/rounds/round-1/review");

    // Points arrive as Decimal strings; they must be added, not concatenated
    expect(await screen.findByText("4 questions · 16 total points")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();

    const card = (prompt: string) => screen.getByText(prompt).parentElement!;
    const mcq = card("Which of these are prime?");
    expect(within(mcq).getByText("Multiple choice (multiple answers)")).toBeInTheDocument();
    expect(within(mcq).getByText("2 pts")).toBeInTheDocument();
    expect(within(mcq).getByText("Points split evenly across 2 correct answers (1 each).")).toBeInTheDocument();
    expect(within(mcq).getByText(/Negative marking: 25%/)).toBeInTheDocument();
    expect(within(card("Zero is even.")).getByText("1 pt")).toBeInTheDocument();
    expect(within(card("What is 7 × 8?")).getByText("56")).toBeInTheDocument();
    expect(within(card("Prove there are infinitely many primes.")).getByText(/queued for manual marking/)).toBeInTheDocument();
  });

  it("shows the memo beside the questions and can hide it", async () => {
    mockReview();
    const { user } = renderApp("/organiser/rounds/round-1/review");

    const memo = await screen.findByTitle("Memo");
    expect(memo).toHaveAttribute("src", "https://storage.test/memo.pdf?type=memo");
    await user.click(screen.getByRole("button", { name: "Hide memo" }));
    expect(screen.queryByTitle("Memo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show memo" })).toBeInTheDocument();
  });

  it("works without a memo when none was uploaded", async () => {
    mockReview({ memo: false });
    renderApp("/organiser/rounds/round-1/review");

    expect(await screen.findByText("Which of these are prime?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /memo/ })).not.toBeInTheDocument();
  });

  it("approves the exam and shows who verified it", async () => {
    const state = mockReview();
    const patches = mockApi("patch", "/rounds/round-1/exam-status", () => {
      state.status = { ...state.status, exam_status: "live", approved_by_name: "Thandi Mokoena", approved_at: "2026-09-01T10:30:00.000Z" };
      return { round: { exam_status: "live" } };
    });
    const { user } = renderApp("/organiser/rounds/round-1/review");

    await user.click(await screen.findByRole("button", { name: "Approve & go live" }));

    expect(await screen.findByText("Approved — live")).toBeInTheDocument();
    expect(screen.getByText("Thandi Mokoena")).toBeInTheDocument();
    expect(screen.getByText(/This exam has been verified and is live/)).toHaveTextContent(/Verified by Thandi Mokoena on 01 Sept 2026/);
    expect(patches[0].body).toEqual({ status: "live" });
    expect(screen.queryByRole("button", { name: "Approve & go live" })).not.toBeInTheDocument();
  });

  it("sends the exam back to the educator", async () => {
    mockReview();
    const patches = mockApi("patch", "/rounds/round-1/exam-status", { round: { exam_status: "draft" } });
    const { user } = renderApp("/organiser/rounds/round-1/review");

    await user.click(await screen.findByRole("button", { name: "Send back for edits" }));

    expect(await screen.findByText(/Waiting for the educator to mark this exam as ready/)).toBeInTheDocument();
    expect(patches[0].body).toEqual({ status: "draft" });
    expect(screen.queryByTitle("Correct answer")).not.toBeInTheDocument();
  });

  it("shows why approval was refused", async () => {
    mockReview();
    mockApiError("patch", "/rounds/round-1/exam-status", 400, "Exam has no questions");
    const { user } = renderApp("/organiser/rounds/round-1/review");

    await user.click(await screen.findByRole("button", { name: "Approve & go live" }));
    expect(await screen.findByText("Exam has no questions")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
  });

  it("corrects a multiple-choice answer key", async () => {
    mockReview();
    const patches = mockApi("patch", "/rounds/round-1/questions/:questionId", (req) => ({
      question: { ...questions()[0], ...(req.body as object) },
    }));
    const { user } = renderApp("/organiser/rounds/round-1/review");

    const mcq = (await screen.findByText("Which of these are prime?")).parentElement!;
    await user.click(within(mcq).getByTitle("Correct answer"));
    // Untick "A. 2", tick "B. 4"
    await user.click(within(mcq).getByLabelText("A. 2"));
    await user.click(within(mcq).getByLabelText("B. 4"));
    await user.click(within(mcq).getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(within(mcq).queryByText("Correct this answer")).not.toBeInTheDocument());
    expect(patches[0].path).toBe("/rounds/round-1/questions/q-1");
    expect(patches[0].body).toEqual({ correct_option: "2,1", correct_answer: null });
    const ticked = within(mcq).getAllByRole("listitem").filter((li) => li.querySelector("svg"));
    expect(ticked.map((li) => li.textContent)).toEqual(["B.4", "C.5"]);
  });

  it("corrects a short answer and won't save a blank one", async () => {
    mockReview();
    const patches = mockApi("patch", "/rounds/round-1/questions/:questionId", (req) => ({
      question: { ...questions()[2], ...(req.body as object) },
    }));
    const { user } = renderApp("/organiser/rounds/round-1/review");

    const short = (await screen.findByText("What is 7 × 8?")).parentElement!;
    await user.click(within(short).getByTitle("Correct answer"));
    const input = within(short).getByPlaceholderText("Expected answer");
    await user.clear(input);
    expect(within(short).getByRole("button", { name: "Save correction" })).toBeDisabled();
    await user.type(input, " fifty-six ");
    await user.click(within(short).getByRole("button", { name: "Save correction" }));

    expect(await within(short).findByText("fifty-six")).toBeInTheDocument();
    expect(patches[0].body).toEqual({ correct_option: null, correct_answer: "fifty-six" });
  });

  it("doesn't offer corrections once the exam is live", async () => {
    mockReview({ status: "live" });
    renderApp("/organiser/rounds/round-1/review");

    expect(await screen.findByText("Approved — live")).toBeInTheDocument();
    expect(screen.queryByTitle("Correct answer")).not.toBeInTheDocument();
  });
});

describe("organiser marking queue", () => {
  type QueueAnswer = ReturnType<typeof essayAnswer>;
  type QueueSubmission = {
    id: string;
    round_id: string;
    received_at: string;
    is_late: boolean;
    entrants: { id: string; full_name: string; grade: string | null };
    answers: QueueAnswer[];
  };

  // GET /rounds/:id/marking-queue: queued submissions with their unmarked answers
  const essayAnswer = (id: string, value: string | null) => ({
    id,
    submission_id: "sub",
    question_id: "q-essay",
    answer_value: value,
    is_correct: null,
    points_awarded: null,
    marked_at: null,
    questions: {
      id: "q-essay",
      prompt: "Prove there are infinitely many primes.",
      type: "essay",
      options: null as string[] | null,
      correct_option: null as string | null,
      correct_answer: null as string | null,
      max_points: "10",
    },
  });
  const queue = (): QueueSubmission[] => [
    {
      id: "sub-1",
      round_id: "round-1",
      received_at: "2026-09-01T09:00:00.000Z",
      is_late: false,
      entrants: { id: "ent-1", full_name: "Ayanda Khumalo", grade: "11" },
      answers: [
        essayAnswer("ans-1", "Assume finitely many and multiply them..."),
        {
          ...essayAnswer("ans-2", "4"),
          question_id: "q-mcq",
          questions: { id: "q-mcq", prompt: "Pick the primes", type: "mcq", options: ["2", "4", "5"], correct_option: "0,2", correct_answer: null, max_points: "2" },
        },
      ],
    },
    {
      id: "sub-2",
      round_id: "round-1",
      received_at: "2026-09-01T11:00:00.000Z",
      is_late: true,
      entrants: { id: "ent-2", full_name: "Lerato Nkosi", grade: null },
      answers: [essayAnswer("ans-3", "   ")],
    },
  ];

  it("lists each submission's answers with the memo answer", async () => {
    mockApi("get", "/rounds/round-1/marking-queue", { submissions: queue() });
    renderApp("/organiser/rounds/round-1/marking");

    expect(await screen.findByText("awaiting marking across", { exact: false })).toHaveTextContent(
      "3 answers awaiting marking across 2 submissions",
    );
    const ayanda = screen.getByRole("heading", { name: "Ayanda Khumalo" }).closest("section")!;
    expect(within(ayanda).getByText("Grade 11")).toBeInTheDocument();
    expect(within(ayanda).getByText("2 to mark")).toBeInTheDocument();
    expect(within(ayanda).getByText("out of 10")).toBeInTheDocument();
    expect(within(ayanda).getByText("Memo answer").nextElementSibling).toHaveTextContent("2, 5");

    const lerato = screen.getByRole("heading", { name: "Lerato Nkosi" }).closest("section")!;
    expect(within(lerato).getByText("Late")).toBeInTheDocument();
    expect(within(lerato).getByText("No answer provided")).toBeInTheDocument();
  });

  it("awards a mark, then reloads the queue without the marked answer", async () => {
    let submissions = queue();
    mockApi("get", "/rounds/round-1/marking-queue", () => ({ submissions }));
    const marks = mockApi("patch", "/rounds/round-1/answers/:answerId", (req) => {
      const answerId = req.path.split("/").pop();
      submissions = submissions
        .map((s) => ({ ...s, answers: s.answers.filter((a) => a.id !== answerId) }))
        .filter((s) => s.answers.length > 0);
      return { answer: { id: answerId } };
    });
    const { user } = renderApp("/organiser/rounds/round-1/marking");

    await screen.findByText("Assume finitely many and multiply them...");
    const answerCard = screen.getByText("Assume finitely many and multiply them...").closest("div")!.parentElement!;
    const points = within(answerCard).getByRole("spinbutton");
    expect(points).toHaveValue(10);
    await user.clear(points);
    await user.type(points, "7.5");
    await user.click(within(answerCard).getByRole("button", { name: "Award" }));

    await waitFor(() => expect(screen.queryByText("Assume finitely many and multiply them...")).not.toBeInTheDocument());
    expect(marks[0]).toMatchObject({ path: "/rounds/round-1/answers/ans-1", body: { is_correct: true, points_awarded: 7.5 } });
    expect(screen.getByText("awaiting marking across", { exact: false })).toHaveTextContent("2 answers awaiting marking across 2 submissions");
  });

  it("caps a typed mark at the question's points and supports Zero", async () => {
    mockApi("get", "/rounds/round-1/marking-queue", { submissions: [queue()[1]] });
    const marks = mockApi("patch", "/rounds/round-1/answers/:answerId", { answer: {} });
    const { user } = renderApp("/organiser/rounds/round-1/marking");

    const points = await screen.findByRole("spinbutton");
    await user.clear(points);
    await user.type(points, "15");
    expect(points).toHaveValue(10);
    await user.click(screen.getByRole("button", { name: "Zero" }));

    await waitFor(() => expect(marks).toHaveLength(1));
    expect(marks[0].body).toEqual({ is_correct: false, points_awarded: 0 });
  });

  it("keeps the answer open and shows the error when a mark is rejected", async () => {
    mockApi("get", "/rounds/round-1/marking-queue", { submissions: [queue()[1]] });
    mockApiError("patch", "/rounds/round-1/answers/:answerId", 400, "points_awarded cannot exceed max_points");
    const { user } = renderApp("/organiser/rounds/round-1/marking");

    await user.click(await screen.findByRole("button", { name: "Full" }));

    expect(await screen.findByText("points_awarded cannot exceed max_points")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Award" })).toBeEnabled();
  });

  it("generates results once nothing is left to mark", async () => {
    mockApi("get", "/rounds/round-1/marking-queue", { submissions: [] });
    const generated = mockApi("post", "/rounds/round-1/results", { results: 42 });
    const { user } = renderApp("/organiser/rounds/round-1/marking");

    expect(await screen.findByRole("heading", { name: "Nothing to mark" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate results" }));

    expect(await screen.findByRole("heading", { name: "Results released" })).toBeInTheDocument();
    expect(generated).toHaveLength(1);
  });

  it("shows why results couldn't be generated", async () => {
    mockApi("get", "/rounds/round-1/marking-queue", { submissions: [] });
    mockApiError("post", "/rounds/round-1/results", 400, "Round must be closed before generating results");
    const { user } = renderApp("/organiser/rounds/round-1/marking");

    await user.click(await screen.findByRole("button", { name: "Generate results" }));
    expect(await screen.findByText("Round must be closed before generating results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing to mark" })).toBeInTheDocument();
  });

  it("shows an error when the queue can't be loaded", async () => {
    mockApiError("get", "/rounds/round-1/marking-queue", 403, "Not authorised for this round");
    renderApp("/organiser/rounds/round-1/marking");
    expect(await screen.findByText("Not authorised for this round")).toBeInTheDocument();
  });
});
