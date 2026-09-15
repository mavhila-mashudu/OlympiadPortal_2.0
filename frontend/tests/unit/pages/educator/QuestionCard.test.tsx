import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Question } from "../../../../src/lib/questions";
import { QuestionCard } from "../../../../src/pages/educator/QuestionCard";
import styles from "../../../../src/pages/educator/ExamBuilder.module.css";

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  type: "mcq",
  prompt: "Which are prime?",
  options: ["2", "4", "5"],
  correct_option: "0",
  correct_answer: null,
  negative_pct: 0,
  max_points: 1,
  ...overrides,
});

const renderCard = (q: Question, index = 0) => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<QuestionCard question={q} index={index} onEdit={onEdit} onDelete={onDelete} />);
  return { onEdit, onDelete };
};

describe("QuestionCard", () => {
  it("numbers the question from 1 and shows its prompt", () => {
    renderCard(question(), 2);
    expect(screen.getByText("Q3")).toBeInTheDocument();
    expect(screen.getByText("Which are prime?")).toBeInTheDocument();
  });

  it.each([
    [1, "1 pt"],
    [3, "3 pts"],
  ])("shows %i point(s) as '%s'", (max_points, text) => {
    renderCard(question({ max_points }));
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    ["mcq", "Multiple choice"],
    ["true_false", "True / False"],
    ["short_answer", "Short answer"],
    ["essay", "Essay / long answer"],
  ] as const)("labels a %s question", (type, label) => {
    renderCard(question({ type, options: type === "true_false" ? ["True", "False"] : null }));
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("flags multiple-choice questions with more than one correct answer", () => {
    renderCard(question({ correct_option: "0,2" }));
    expect(screen.getByText("Multiple choice (multiple answers)")).toBeInTheDocument();
  });

  it("highlights every correct option", () => {
    renderCard(question({ correct_option: "0, 2" }));
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["2", "4", "5"]);
    expect(items.map((li) => li.classList.contains(styles.correctOption))).toEqual([true, false, true]);
    expect(items[0].querySelector("svg")).not.toBeNull();
    expect(items[1].querySelector("svg")).toBeNull();
  });

  it("shows the negative-marking rule only when it applies", () => {
    const { unmount } = render(
      <QuestionCard question={question({ negative_pct: 25 })} index={0} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("Negative marking: -25% per wrong selection")).toBeInTheDocument();
    unmount();

    renderCard(question({ negative_pct: 0 }));
    expect(screen.queryByText(/negative marking/i)).not.toBeInTheDocument();
  });

  it("shows the expected short answer", () => {
    renderCard(question({ type: "short_answer", options: null, correct_option: null, correct_answer: "Pretoria" }));
    expect(screen.getByText("Pretoria")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("notes that essays are marked manually", () => {
    renderCard(question({ type: "essay", options: null, correct_option: null }));
    expect(screen.getByText("Marked manually")).toBeInTheDocument();
  });

  it("calls onEdit and onDelete from its buttons", async () => {
    const { onEdit, onDelete } = renderCard(question());
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
