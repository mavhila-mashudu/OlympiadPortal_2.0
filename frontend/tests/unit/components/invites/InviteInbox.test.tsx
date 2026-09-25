import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

import { api } from "../../../../src/lib/api";
import { InviteInbox, type Invite } from "../../../../src/components/invites/InviteInbox";

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const invite = (overrides: Partial<Invite> = {}): Invite => ({
  id: "inv-1",
  role: "educator",
  status: "pending",
  message: null,
  createdAt: "2026-09-01T09:00:00.000Z",
  olympiad: { id: "oly-1", name: "Maths Olympiad 2026" },
  school: { id: "school-1", name: "Parktown High" },
  invitedBy: { id: "org-1", name: "National Olympiad Office", email: "office@olympiad.test" },
  ...overrides,
});

// Block bodies matter here: a hook that returns a function (mockReset returns
// the mock) is run by Vitest as a teardown after each test.
beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("InviteInbox", () => {
  it("renders nothing at all when there is no invitation to answer", async () => {
    get.mockResolvedValue({ invites: [] });
    const { container } = render(<InviteInbox />);

    await waitFor(() => expect(get).toHaveBeenCalledWith("/invites/mine"));
    expect(container).toBeEmptyDOMElement();
  });

  it("leaves out invitations that have already been answered", async () => {
    get.mockResolvedValue({
      invites: [invite(), invite({ id: "inv-2", status: "accepted" }), invite({ id: "inv-3", status: "rejected" })],
    });
    render(<InviteInbox />);

    expect(await screen.findByRole("heading", { name: "Invitations (1)" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
  });

  it("shows who invited the educator and what accepting will do", async () => {
    get.mockResolvedValue({ invites: [invite({ message: "We'd love Parktown to take part." })] });
    render(<InviteInbox />);

    expect(await screen.findByText("Maths Olympiad 2026")).toBeInTheDocument();
    expect(screen.getByText(/Invited by National Olympiad Office · Parktown High/)).toBeInTheDocument();
    expect(screen.getByText("We'd love Parktown to take part.")).toBeInTheDocument();
    expect(screen.getByText("Accepting registers your school for this olympiad.")).toBeInTheDocument();
  });

  it("tells a student what accepting will do instead", async () => {
    get.mockResolvedValue({ invites: [invite({ role: "student" })] });
    render(<InviteInbox />);

    expect(await screen.findByText("Accepting enters you into this olympiad's rounds.")).toBeInTheDocument();
  });

  it("accepts an invitation, reloads the list and tells the page", async () => {
    get.mockResolvedValueOnce({ invites: [invite()] }).mockResolvedValueOnce({ invites: [] });
    post.mockResolvedValue({ invite: invite({ status: "accepted" }) });
    const onAccepted = vi.fn();
    render(<InviteInbox onAccepted={onAccepted} />);

    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(post).toHaveBeenCalledWith("/invites/inv-1/accept");
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("declines an invitation without telling the page to reload", async () => {
    get.mockResolvedValueOnce({ invites: [invite()] }).mockResolvedValueOnce({ invites: [] });
    post.mockResolvedValue({ invite: invite({ status: "rejected" }) });
    const onAccepted = vi.fn();
    render(<InviteInbox onAccepted={onAccepted} />);

    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));

    expect(post).toHaveBeenCalledWith("/invites/inv-1/reject");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("shows the backend's reason when the answer is refused", async () => {
    get.mockResolvedValue({ invites: [invite()] });
    post.mockRejectedValue(new Error("You have already answered this invitation"));
    render(<InviteInbox />);

    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByText("You have already answered this invitation")).toBeInTheDocument();
  });

  it("reports a failure to load the invitations", async () => {
    get.mockRejectedValue(new Error("Request failed (500)"));
    render(<InviteInbox />);

    expect(await screen.findByText("Request failed (500)")).toBeInTheDocument();
  });
});
