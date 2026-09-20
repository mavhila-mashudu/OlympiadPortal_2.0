import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/lib/api", () => ({ api: { patch: vi.fn() } }));

import { api } from "../../../../src/lib/api";
import { AnswerCard, type QueueAnswer } from "../../../../src/pages/organiser/AnswerCard";

const patch = vi.mocked(api.patch);

const answer = (
  questionOverrides: Partial<QueueAnswer["questions"]> = {},
  answer_value: string | null = "Plants use sunlight to make sugar.",
): QueueAnswer => ({
  id: "ans-1",
  answer_value,
  questions: {
    id: "q1",
    prompt: "Explain photosynthesis",
    type: "essay",
    options: null,
    correct_option: null,
    correct_answer: null,
    max_points: "4",
    ...questionOverrides,
  },
});

const setup = (a: QueueAnswer) => {
  const onMarked = vi.fn();
  render(<AnswerCard answer={a} roundId="round-1" onMarked={onMarked} />);
  return { onMarked, user: userEvent.setup() };
};

const pointsInput = () => screen.getByRole("spinbutton");

beforeEach(() => {
  patch.mockReset();
});

describe("AnswerCard", () => {
  it("shows the question, the student's answer and the marks available", () => {
    setup(answer());
    expect(screen.getByText("Explain photosynthesis")).toBeInTheDocument();
    expect(screen.getByText("Plants use sunlight to make sugar.")).toBeInTheDocument();
    expect(screen.getByText("out of 4")).toBeInTheDocument();
    expect(pointsInput()).toHaveValue(4);
  });

  it.each([null, "   "])("says 'No answer provided' for %p", (value) => {
    setup(answer({}, value));
    expect(screen.getByText("No answer provided")).toBeInTheDocument();
  });

  it.each([
    ["essay", "Essay"],
    ["true_false", "True / False"],
    ["mcq", "Multiple choice"],
    ["short_answer", "Short answer"],
    ["diagram", "diagram"],
  ])("labels a %s question as '%s'", (type, label) => {
    setup(answer({ type }));
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  describe("memo answer", () => {
    it("is not shown for an essay", () => {
      setup(answer());
      expect(screen.queryByText("Memo answer")).not.toBeInTheDocument();
    });

    it("shows the expected text for a short answer", () => {
      setup(answer({ type: "short_answer", correct_answer: "Pretoria" }));
      expect(screen.getByText("Pretoria")).toBeInTheDocument();
    });

    it("lists the correct option texts for a choice question", () => {
      setup(answer({ type: "mcq", options: ["2", "4", "5"], correct_option: "0, 2" }));
      expect(screen.getByText("2, 5")).toBeInTheDocument();
    });

    it("falls back to the option number when its text is missing", () => {
      setup(answer({ type: "mcq", options: ["2"], correct_option: "0,3" }));
      expect(screen.getByText("2, Option 4")).toBeInTheDocument();
    });
  });

  it("keeps the points between 0 and the maximum", () => {
    setup(answer());
    fireEvent.change(pointsInput(), { target: { value: "9" } });
    expect(pointsInput()).toHaveValue(4);
    fireEvent.change(pointsInput(), { target: { value: "-2" } });
    expect(pointsInput()).toHaveValue(0);
    fireEvent.change(pointsInput(), { target: { value: "2.5" } });
    expect(pointsInput()).toHaveValue(2.5);
  });

  it("lets the marker clear the points and type a new mark", async () => {
    const { user } = setup(answer());
    await user.clear(pointsInput());
    expect(pointsInput()).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Award" })).toBeDisabled();
    await user.type(pointsInput(), "3");
    expect(pointsInput()).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Award" })).toBeEnabled();
  });

  it.each([
    ["Award (partial)", "Award", "2.5", { is_correct: true, points_awarded: 2.5 }],
    ["Full", /full/i, null, { is_correct: true, points_awarded: 4 }],
    ["Zero", "Zero", null, { is_correct: false, points_awarded: 0 }],
  ])("%s saves the mark for this answer", async (_label, buttonName, typed, body) => {
    patch.mockResolvedValue({});
    const { user, onMarked } = setup(answer());
    if (typed) fireEvent.change(pointsInput(), { target: { value: typed } });

    await user.click(screen.getByRole("button", { name: buttonName }));

    expect(patch).toHaveBeenCalledWith("/rounds/round-1/answers/ans-1", body);
    expect(onMarked).toHaveBeenCalledTimes(1);
  });

  it("treats awarding 0 points as incorrect", async () => {
    patch.mockResolvedValue({});
    const { user } = setup(answer());
    fireEvent.change(pointsInput(), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Award" }));
    expect(patch).toHaveBeenCalledWith(expect.any(String), { is_correct: false, points_awarded: 0 });
  });

  it("disables marking while the mark is being saved", async () => {
    patch.mockReturnValue(new Promise(() => {}));
    const { user } = setup(answer());

    await user.click(screen.getByRole("button", { name: "Award" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: /full/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zero" })).toBeDisabled();
    expect(pointsInput()).toBeDisabled();
  });

  it("shows the error and lets the marker try again when saving fails", async () => {
    patch.mockRejectedValueOnce(new Error("Answer not found"));
    const { user, onMarked } = setup(answer());

    await user.click(screen.getByRole("button", { name: "Award" }));

    expect(await screen.findByText("Answer not found")).toBeInTheDocument();
    expect(onMarked).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Award" })).toBeEnabled();
  });

  it("shows a fallback message when the error has none", async () => {
    patch.mockRejectedValueOnce({});
    const { user } = setup(answer());
    await user.click(screen.getByRole("button", { name: "Zero" }));
    expect(await screen.findByText("Failed to save mark")).toBeInTheDocument();
  });
});
