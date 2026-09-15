import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Question } from "../../../../src/lib/questions";
import { QuestionForm } from "../../../../src/pages/educator/QuestionForm";

const setup = (props: Partial<Parameters<typeof QuestionForm>[0]> = {}) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(<QuestionForm onSave={onSave} onCancel={onCancel} saving={false} {...props} />);
  return { onSave, onCancel, user };
};

const optionInputs = () => screen.getAllByPlaceholderText(/^Option \d$/);
const correctBoxes = () => screen.getAllByRole("checkbox");
const saveButton = () => screen.getByRole("button", { name: /add question|update question|saving/i });

const typePrompt = (user: ReturnType<typeof userEvent.setup>, text = "Which are prime?") =>
  user.type(screen.getByLabelText("Question prompt"), text);

const fillOptions = async (user: ReturnType<typeof userEvent.setup>, values: Array<string | null>) => {
  for (const [idx, value] of values.entries()) {
    if (value) await user.type(optionInputs()[idx], value);
  }
};

describe("QuestionForm — multiple choice", () => {
  it("starts as a multiple-choice question with four blank options", () => {
    setup();
    expect(screen.getByLabelText("Question type")).toHaveValue("mcq");
    expect(optionInputs()).toHaveLength(4);
    expect(optionInputs().every((input) => (input as HTMLInputElement).value === "")).toBe(true);
    expect(saveButton()).toBeDisabled();
  });

  it("needs a prompt, two filled options and a correct answer before saving", async () => {
    const { user } = setup();

    await typePrompt(user);
    expect(saveButton()).toBeDisabled();

    await fillOptions(user, ["2", "4"]);
    expect(saveButton()).toBeDisabled();

    await user.click(correctBoxes()[0]);
    expect(saveButton()).toBeEnabled();
  });

  it("won't save a prompt that is only spaces", async () => {
    const { user } = setup();
    await typePrompt(user, "   ");
    await fillOptions(user, ["2", "4"]);
    await user.click(correctBoxes()[0]);
    expect(saveButton()).toBeDisabled();
  });

  it("saves a multi-answer question with negative marking", async () => {
    const { user, onSave } = setup();

    await typePrompt(user, "  Which are prime?  ");
    await fillOptions(user, ["2", "4", "5", "9"]);
    await user.click(correctBoxes()[0]);
    await user.click(correctBoxes()[2]);
    fireEvent.change(screen.getByLabelText("Negative marking per wrong selection (%)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "4" } });
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({
      type: "mcq",
      prompt: "Which are prime?",
      options: ["2", "4", "5", "9"],
      correct_option: "0,2",
      correct_answer: null,
      negative_pct: 25,
      max_points: 4,
    });
  });

  it("lets a ticked answer be unticked", async () => {
    const { user } = setup();
    await typePrompt(user);
    await fillOptions(user, ["2", "4"]);
    await user.click(correctBoxes()[0]);
    await user.click(correctBoxes()[0]);
    expect(correctBoxes()[0]).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  describe("blank options", () => {
    it("renumbers the correct answer when a blank option before it is dropped", async () => {
      // Regression: options were compacted on save but the ticked index was
      // not, so the answer key pointed at the wrong (or a missing) option.
      const { user, onSave } = setup();

      await typePrompt(user);
      await fillOptions(user, ["Paris", null, "Lyon"]);
      await user.click(correctBoxes()[2]);
      await user.click(saveButton());

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ options: ["Paris", "Lyon"], correct_option: "1" }),
      );
    });

    it("drops a tick on an option that was left blank", async () => {
      const { user, onSave } = setup();

      await typePrompt(user);
      await fillOptions(user, ["Paris", "Lyon"]);
      await user.click(correctBoxes()[1]);
      await user.click(correctBoxes()[3]);
      await user.click(saveButton());

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ options: ["Paris", "Lyon"], correct_option: "1" }),
      );
    });

    it("won't save when the only ticked option is blank", async () => {
      const { user } = setup();
      await typePrompt(user);
      await fillOptions(user, ["Paris", "Lyon"]);
      await user.click(correctBoxes()[3]);
      expect(saveButton()).toBeDisabled();
    });
  });

  it("allows up to six options", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /add option/i }));
    await user.click(screen.getByRole("button", { name: /add option/i }));
    expect(optionInputs()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /add option/i })).not.toBeInTheDocument();
  });

  it("keeps at least two options", async () => {
    const { user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Remove option" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Remove option" })[0]);
    expect(optionInputs()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Remove option" })).not.toBeInTheDocument();
  });

  it("moves the correct tick down when an earlier option is removed", async () => {
    const { user, onSave } = setup();

    await typePrompt(user);
    await fillOptions(user, ["A", "B", "C"]);
    await user.click(correctBoxes()[2]);
    await user.click(screen.getAllByRole("button", { name: "Remove option" })[1]);

    expect(optionInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["A", "C", ""]);
    expect(correctBoxes()[1]).toBeChecked();

    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ options: ["A", "C"], correct_option: "1" }));
  });

  it("forgets the tick on an option that is removed", async () => {
    const { user } = setup();
    await fillOptions(user, ["A", "B", "C"]);
    await user.click(correctBoxes()[1]);
    await user.click(screen.getAllByRole("button", { name: "Remove option" })[1]);
    expect(correctBoxes().some((box) => (box as HTMLInputElement).checked)).toBe(false);
  });

  it("treats an invalid negative percentage as 0 and invalid points as 1", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Negative marking per wrong selection (%)"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "" } });
    expect(screen.getByLabelText("Negative marking per wrong selection (%)")).toHaveValue(0);
    expect(screen.getByLabelText("Points")).toHaveValue(1);
  });
});

describe("QuestionForm — other question types", () => {
  it("uses fixed True/False options and needs one chosen", async () => {
    const { user, onSave } = setup();

    await user.selectOptions(screen.getByLabelText("Question type"), "true_false");
    expect(screen.queryByPlaceholderText("Option 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/negative marking/i)).not.toBeInTheDocument();

    await typePrompt(user, "The sky is green");
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "False" }));
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({
      type: "true_false",
      prompt: "The sky is green",
      options: ["True", "False"],
      correct_option: "1",
      correct_answer: null,
      negative_pct: 0,
      max_points: 1,
    });
  });

  it("clears the options when switching back from True/False", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText("Question type"), "true_false");
    await user.click(screen.getByRole("radio", { name: "True" }));
    await user.selectOptions(screen.getByLabelText("Question type"), "mcq");

    expect(optionInputs()).toHaveLength(4);
    expect(optionInputs().every((input) => (input as HTMLInputElement).value === "")).toBe(true);
    expect(correctBoxes().some((box) => (box as HTMLInputElement).checked)).toBe(false);
  });

  it("does not carry negative marking over to True/False", async () => {
    const { user, onSave } = setup();
    fireEvent.change(screen.getByLabelText("Negative marking per wrong selection (%)"), { target: { value: "50" } });
    await user.selectOptions(screen.getByLabelText("Question type"), "true_false");
    await typePrompt(user);
    await user.click(screen.getByRole("radio", { name: "True" }));
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ negative_pct: 0, correct_option: "0" }));
  });

  it("saves a trimmed short answer with no options", async () => {
    const { user, onSave } = setup();

    await user.selectOptions(screen.getByLabelText("Question type"), "short_answer");
    await typePrompt(user, "Capital of South Africa?");
    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Correct answer"), "   ");
    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Correct answer"), " Pretoria ");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({
      type: "short_answer",
      prompt: "Capital of South Africa?",
      options: null,
      correct_option: null,
      correct_answer: "Pretoria",
      negative_pct: 0,
      max_points: 1,
    });
  });

  it("saves an essay with just a prompt", async () => {
    const { user, onSave } = setup();

    await user.selectOptions(screen.getByLabelText("Question type"), "essay");
    expect(screen.getByText(/queued for manual marking/i)).toBeInTheDocument();

    await typePrompt(user, "Explain photosynthesis");
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "10" } });
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({
      type: "essay",
      prompt: "Explain photosynthesis",
      options: null,
      correct_option: null,
      correct_answer: null,
      negative_pct: 0,
      max_points: 10,
    });
  });
});

describe("QuestionForm — editing and buttons", () => {
  const existing: Question = {
    id: "q1",
    type: "mcq",
    prompt: "Which are prime?",
    options: ["2", "4", "5"],
    correct_option: "0, 2",
    correct_answer: null,
    negative_pct: 10,
    max_points: 3,
  };

  it("fills the form from the question being edited", () => {
    setup({ initial: existing });

    expect(screen.getByLabelText("Question prompt")).toHaveValue("Which are prime?");
    expect(optionInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["2", "4", "5"]);
    expect(correctBoxes().map((b) => (b as HTMLInputElement).checked)).toEqual([true, false, true]);
    expect(screen.getByLabelText("Negative marking per wrong selection (%)")).toHaveValue(10);
    expect(screen.getByLabelText("Points")).toHaveValue(3);
    expect(saveButton()).toHaveTextContent("Update question");
    expect(saveButton()).toBeEnabled();
  });

  it("saves edits without changing untouched fields", async () => {
    const { user, onSave } = setup({ initial: existing });
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({
      type: "mcq",
      prompt: "Which are prime?",
      options: ["2", "4", "5"],
      correct_option: "0,2",
      correct_answer: null,
      negative_pct: 10,
      max_points: 3,
    });
  });

  it("shows a disabled Saving... button while saving", () => {
    setup({ initial: existing, saving: true });
    expect(saveButton()).toHaveTextContent("Saving...");
    expect(saveButton()).toBeDisabled();
  });

  it("cancels without saving", async () => {
    const { user, onSave, onCancel } = setup({ initial: existing });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
