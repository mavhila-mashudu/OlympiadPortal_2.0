import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fx from "./support/fixtures";
import { mockApi, mockApiError, mockNetworkFailure } from "./support/network";
import { renderApp } from "./support/renderApp";

const PATH = "/student/rounds/round-1/exam";
const SAVE_WAIT = { timeout: 3000 }; // answers save 800ms after the last change

// GET /rounds/:id/exam questions: no answer keys, Decimal points as strings
const questions = [
  { id: "q-mcq", type: "mcq", prompt: "Which are prime?", options: ["2", "4", "5", "9"], max_points: "4", multi_select: true, negative_pct: 25 },
  { id: "q-short", type: "short_answer", prompt: "Capital of South Africa?", options: null, max_points: "2", multi_select: false, negative_pct: 0 },
  { id: "q-essay", type: "essay", prompt: "Explain photosynthesis", options: null, max_points: "1", multi_select: false, negative_pct: 0 },
];

type Submission = { id: string; status: string; answers: { id: string; question_id: string; answer_value: string | null }[] };

// A stateful fake of the student exam API
const mockExam = ({
  closesAt = fx.inHours(1),
  serverTime = new Date().toISOString(),
  submission = null as Submission | null,
  submitResult = { message: "Exam submitted successfully", status: "queued_for_marking", total_points: 3, is_late: false },
} = {}) => {
  const state = { submission };
  mockApi("get", "/rounds/round-1/exam", () => ({
    round: { id: "round-1", name: "Round 2 — Regional", opens_at: fx.inHours(-1), closes_at: closesAt, state: "open" },
    questions,
    total_points: 7,
    server_time: serverTime,
    submission: state.submission,
  }));
  const starts = mockApi(
    "post",
    "/rounds/round-1/exam/start",
    () => {
      state.submission ??= {
        id: "sub-1",
        status: "received",
        answers: questions.map((q) => ({ id: `ans-${q.id}`, question_id: q.id, answer_value: null })),
      };
      return { submission: state.submission };
    },
    { status: 201 },
  );
  const saves = mockApi("patch", "/rounds/round-1/exam/answers/:qid", (req) => {
    const qid = req.path.split("/").pop();
    const { answer_value } = req.body as { answer_value: string | null };
    state.submission!.answers = state.submission!.answers.map((a) => (a.question_id === qid ? { ...a, answer_value } : a));
    return { answer: { question_id: qid, answer_value } };
  });
  const submits = mockApi("post", "/rounds/round-1/exam/submit", () => {
    state.submission = { ...state.submission!, status: submitResult.status };
    return submitResult;
  });
  return { state, starts, saves, submits };
};

const startedSubmission = (answers: Record<string, string | null> = {}): Submission => ({
  id: "sub-1",
  status: "received",
  answers: questions.map((q) => ({ id: `ans-${q.id}`, question_id: q.id, answer_value: answers[q.id] ?? null })),
});

const savedValues = (saves: ReturnType<typeof mockExam>["saves"]) =>
  saves.map((s) => [s.path.split("/").pop(), (s.body as { answer_value: string | null }).answer_value]);

describe("sitting an exam online", () => {
  it("starts the exam with a timer that follows the server's clock", async () => {
    // The device clock is 30 minutes behind the server
    const { starts } = mockExam({ closesAt: fx.inHours(1), serverTime: fx.inHours(0.5) });
    const { user } = renderApp(PATH);

    expect(await screen.findByRole("heading", { name: "Round 2 — Regional" })).toBeInTheDocument();
    expect(screen.getByText("3 questions · 7 points")).toBeInTheDocument();
    expect(await screen.findByText(/^00:(29|30):\d\d$/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start exam" }));

    expect(await screen.findByText("Which are prime?")).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Multiple answer")).toBeInTheDocument();
    expect(screen.getByText("4 pts")).toBeInTheDocument();
    expect(screen.getByText("Select all answers that apply.")).toBeInTheDocument();
    expect(screen.getByText(/deducts 25% of this question/)).toBeInTheDocument();
    expect(starts).toHaveLength(1);
  });

  it("autosaves each answer once, including answers changed in quick succession", async () => {
    const { saves } = mockExam({ submission: startedSubmission() });
    const { user } = renderApp(PATH);

    await user.click(await screen.findByLabelText("A. 2"));
    await user.click(screen.getByLabelText("C. 5"));
    expect(screen.getByLabelText("A. 2")).toBeChecked();
    expect(screen.getByLabelText("C. 5")).toBeChecked();
    // Move straight on: the first question's pending save must still happen
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByPlaceholderText("Type your answer..."), "Pretoria");

    await waitFor(() => expect(saves).toHaveLength(2), SAVE_WAIT);
    expect(savedValues(saves)).toEqual([
      ["q-mcq", "0,2"],
      ["q-short", "Pretoria"],
    ]);
    expect(await screen.findByText("All answers saved")).toBeInTheDocument();
    expect(screen.getByTitle("Question 1 (answered)")).toBeInTheDocument();
    expect(screen.getByText("Answered (2)")).toBeInTheDocument();
    expect(screen.getByText("Unanswered (1)")).toBeInTheDocument();
  });

  it("keeps flags on this device across a reload", async () => {
    mockExam({ submission: startedSubmission() });
    const { user, unmount } = renderApp(PATH);

    await user.click(await screen.findByRole("button", { name: "Flag" }));
    expect(screen.getByRole("button", { name: "Flagged" })).toBeInTheDocument();
    expect(screen.getByTitle("Question 1 (flagged for review)")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("exam-flags-round-1")!)).toEqual(["q-mcq"]);

    unmount();
    renderApp(PATH);
    expect(await screen.findByText("Flagged (1)")).toBeInTheDocument();
  });

  it("confirms, flushes answers and submits the exam", async () => {
    const { saves, submits } = mockExam({ submission: startedSubmission({ "q-mcq": "0" }) });
    const { user } = renderApp(PATH);

    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.type(screen.getByPlaceholderText("Type your answer..."), "Pretoria");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("1 pt")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit exam" }));

    const dialog = screen.getByRole("heading", { name: "Submit your exam?" }).parentElement!;
    expect(dialog).toHaveTextContent("You have answered 2 of 3 questions. 1 question unanswered will be submitted as blank.");
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("heading", { name: "Submit your exam?" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit exam" }));
    await user.click(screen.getByRole("button", { name: "Confirm submit" }));

    expect(await screen.findByRole("heading", { name: "Exam submitted" })).toBeInTheDocument();
    expect(screen.getByText(/Total points:/)).toHaveTextContent("Total points: 3 / 7");
    expect(screen.getByText("Pending manual marking")).toBeInTheDocument();
    // Every answer is pushed before the final submit, without waiting for the debounce
    expect(savedValues(saves)).toEqual(expect.arrayContaining([["q-mcq", "0"], ["q-short", "Pretoria"]]));
    expect(submits).toHaveLength(1);
    expect(localStorage.getItem("exam-answers-round-1")).toBeNull();
  });

  it("tells a late submitter their exam was flagged", async () => {
    mockExam({
      submission: startedSubmission({ "q-mcq": "0" }),
      submitResult: { message: "Exam submitted successfully", status: "automarked", total_points: 2, is_late: true },
    });
    const { user } = renderApp(PATH);

    await user.click(await screen.findByTitle("Question 3"));
    await user.click(screen.getByRole("button", { name: "Submit exam" }));
    await user.click(screen.getByRole("button", { name: "Confirm submit" }));

    expect(await screen.findByText("Auto-marked")).toBeInTheDocument();
    expect(screen.getByText(/arrived after the closing time/)).toBeInTheDocument();
  });

  it("resumes a started exam with saved answers, preferring unsaved local ones", async () => {
    mockExam({ submission: startedSubmission({ "q-mcq": "1", "q-short": "Durban", "q-essay": "Old essay" }) });
    // The last save of the short answer never reached the server
    localStorage.setItem("exam-answers-round-1", JSON.stringify({ answers: { "q-short": "Pretoria", "q-essay": "Local essay" }, dirty: ["q-short"] }));
    const { user } = renderApp(PATH);

    expect(await screen.findByLabelText("B. 4")).toBeChecked();
    expect(screen.queryByRole("button", { name: "Start exam" })).not.toBeInTheDocument();
    await user.click(screen.getByTitle("Question 2 (answered)"));
    expect(screen.getByPlaceholderText("Type your answer...")).toHaveValue("Pretoria");
    await user.click(screen.getByTitle("Question 3 (answered)"));
    expect(screen.getByPlaceholderText("Write your answer here...")).toHaveValue("Old essay");
  });

  it("keeps answers locally while offline and syncs them when the connection returns", async () => {
    mockExam({ submission: startedSubmission() });
    mockNetworkFailure("patch", "/rounds/round-1/exam/answers/:qid");
    const { user } = renderApp(PATH);

    await user.click(await screen.findByLabelText("A. 2"));
    expect(await screen.findByText("1 answer saved locally", {}, SAVE_WAIT)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("exam-answers-round-1")!)).toEqual({ answers: { "q-mcq": "0" }, dirty: ["q-mcq"] });

    fireEvent(window, new Event("offline"));
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();

    // Back online: the failed save is replayed
    const replays = mockApi("patch", "/rounds/round-1/exam/answers/:qid", { answer: {} });
    fireEvent(window, new Event("online"));

    expect(await screen.findByText("All answers saved")).toBeInTheDocument();
    expect(replays.map((r) => r.body)).toEqual([{ answer_value: "0" }]);
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("exam-answers-round-1")!).dirty).toEqual([]);
  });

  it("queues a submit that fails offline and sends it on reconnect", async () => {
    mockExam({ submission: startedSubmission({ "q-mcq": "0" }) });
    mockNetworkFailure("post", "/rounds/round-1/exam/submit");
    const { user } = renderApp(PATH);

    await user.click(await screen.findByTitle("Question 3"));
    await user.click(screen.getByRole("button", { name: "Submit exam" }));
    await user.click(screen.getByRole("button", { name: "Confirm submit" }));

    expect(await screen.findByText(/will be submitted automatically when your connection returns/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Exam submitted" })).not.toBeInTheDocument();

    const retried = mockApi("post", "/rounds/round-1/exam/submit", { message: "ok", status: "queued_for_marking", total_points: 1, is_late: false });
    fireEvent(window, new Event("online"));

    expect(await screen.findByRole("heading", { name: "Exam submitted" })).toBeInTheDocument();
    expect(retried).toHaveLength(1);
  });

  it("shows the backend's reason when the submit is refused", async () => {
    mockExam({ submission: startedSubmission() });
    mockApiError("post", "/rounds/round-1/exam/submit", 400, "This exam has already been submitted");
    const { user } = renderApp(PATH);

    await user.click(await screen.findByTitle("Question 3"));
    await user.click(screen.getByRole("button", { name: "Submit exam" }));
    await user.click(screen.getByRole("button", { name: "Confirm submit" }));

    expect(await screen.findByText("This exam has already been submitted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit exam" })).toBeEnabled();
  });

  it("submits automatically when time runs out", async () => {
    const { submits } = mockExam({ closesAt: new Date(Date.now() + 1500).toISOString(), submission: startedSubmission({ "q-mcq": "2" }) });
    renderApp(PATH);

    expect(await screen.findByText("Which are prime?")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Exam submitted" }, { timeout: 4000 })).toBeInTheDocument();
    expect(submits).toHaveLength(1);
  });

  it("won't start once the time has expired", async () => {
    const { starts } = mockExam({ closesAt: fx.inHours(-0.1) });
    renderApp(PATH);

    expect(await screen.findByRole("button", { name: "Time expired" })).toBeDisabled();
    expect(starts).toHaveLength(0);
  });

  it("shows why starting failed", async () => {
    mockExam();
    mockApiError("post", "/rounds/round-1/exam/start", 400, "No questions available for this exam");
    const { user } = renderApp(PATH);

    await user.click(await screen.findByRole("button", { name: "Start exam" }));
    expect(await screen.findByText("No questions available for this exam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start exam" })).toBeInTheDocument();
  });

  it("explains when the exam can't be loaded", async () => {
    mockApiError("get", "/rounds/round-1/exam", 403, "This exam is not live yet");
    renderApp(PATH);

    expect(await screen.findByText("This exam is not live yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/student");
  });
});
