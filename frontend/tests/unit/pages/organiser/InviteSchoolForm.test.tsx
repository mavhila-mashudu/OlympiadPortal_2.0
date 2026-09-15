import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/lib/api", () => ({ api: { post: vi.fn() } }));

import { api } from "../../../../src/lib/api";
import { InviteSchoolForm } from "../../../../src/pages/organiser/InviteSchoolForm";

const post = vi.mocked(api.post);
const olympiads = [
  { id: "oly-1", name: "Maths Olympiad" },
  { id: "oly-2", name: "Science Olympiad" },
];

const fillAndSubmit = async (schoolName = "  Parktown High ", email = " head@parktown.test ") => {
  await userEvent.type(screen.getByLabelText("School name"), schoolName);
  await userEvent.type(screen.getByLabelText("Contact email"), email);
  await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
};

// Block bodies matter here: a hook that returns a function (mockReset returns
// the mock) is run by Vitest as a teardown after each test.
beforeEach(() => {
  post.mockReset();
});

describe("InviteSchoolForm", () => {
  it("posts the trimmed invitation for the selected olympiad", async () => {
    post.mockResolvedValue({ code: "SCH-AB12", emailDelivered: true });
    render(<InviteSchoolForm olympiads={olympiads} />);

    await fillAndSubmit();

    expect(post).toHaveBeenCalledWith("/auth/invite-school", {
      school_name: "Parktown High",
      contact_email: "head@parktown.test",
      olympiad_id: "oly-1",
    });
  });

  it("invites for whichever olympiad the organiser picks", async () => {
    post.mockResolvedValue({ code: "SCH-AB12", emailDelivered: true });
    render(<InviteSchoolForm olympiads={olympiads} />);

    await userEvent.selectOptions(screen.getByLabelText("Olympiad"), "oly-2");
    await fillAndSubmit();

    expect(post).toHaveBeenCalledWith("/auth/invite-school", expect.objectContaining({ olympiad_id: "oly-2" }));
  });

  it("prefers initialOlympiadId over the first olympiad in the list", () => {
    render(<InviteSchoolForm olympiads={olympiads} initialOlympiadId="oly-2" />);
    expect(screen.getByLabelText("Olympiad")).toHaveValue("oly-2");
  });

  it("uses a fixed olympiadId without showing a picker", async () => {
    post.mockResolvedValue({ code: "SCH-AB12", emailDelivered: true });
    render(<InviteSchoolForm olympiadId="oly-9" initialOlympiadId="oly-2" />);

    expect(screen.queryByLabelText("Olympiad")).not.toBeInTheDocument();
    await fillAndSubmit();
    expect(post).toHaveBeenCalledWith("/auth/invite-school", expect.objectContaining({ olympiad_id: "oly-9" }));
  });

  it("asks for an olympiad instead of sending when none is available", async () => {
    render(<InviteSchoolForm />);
    await fillAndSubmit();

    expect(screen.getByText("Select an olympiad before inviting a school.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the invitation code once created and reports success", async () => {
    post.mockResolvedValue({ code: "SCH-AB12", emailDelivered: true });
    const onSuccess = vi.fn();
    const onCancel = vi.fn();
    render(<InviteSchoolForm olympiadId="oly-1" onSuccess={onSuccess} onCancel={onCancel} />);

    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "School invitation created" })).toBeInTheDocument();
    expect(screen.getByText("SCH-AB12")).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the button while sending", async () => {
    let resolve!: (value: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<InviteSchoolForm olympiadId="oly-1" />);

    await fillAndSubmit();
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();

    resolve({ code: "SCH-AB12", emailDelivered: false });
    expect(await screen.findByText("SCH-AB12")).toBeInTheDocument();
  });

  it("shows the server's error and lets the organiser try again", async () => {
    post.mockRejectedValueOnce(new Error("Olympiad not found"));
    render(<InviteSchoolForm olympiadId="oly-1" />);

    await fillAndSubmit();

    expect(await screen.findByText("Olympiad not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeEnabled();

    post.mockResolvedValueOnce({ code: "SCH-OK", emailDelivered: true });
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("SCH-OK")).toBeInTheDocument();
    expect(screen.queryByText("Olympiad not found")).not.toBeInTheDocument();
  });

  it("shows a generic message for a non-Error failure", async () => {
    post.mockRejectedValue("boom");
    render(<InviteSchoolForm olympiadId="oly-1" />);

    await fillAndSubmit();
    expect(await screen.findByText("Failed to send the school invitation.")).toBeInTheDocument();
  });

  it("offers Cancel only when there is somewhere to go back to", async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<InviteSchoolForm olympiadId="oly-1" />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    rerender(<InviteSchoolForm olympiadId="oly-1" onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });
});
