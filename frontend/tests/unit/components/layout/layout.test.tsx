import { render, screen, within } from "@testing-library/react";
import { ClipboardList, LayoutDashboard, Trophy } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "../../../../src/components/layout/AppShell";
import shellStyles from "../../../../src/components/layout/AppShell.module.css";
import { PageHeader } from "../../../../src/components/layout/PageHeader";

describe("PageHeader", () => {
  it("shows the title and description", () => {
    render(<PageHeader title="Rounds" description="Manage your rounds" />);
    expect(screen.getByRole("heading", { level: 1, name: "Rounds" })).toBeInTheDocument();
    expect(screen.getByText("Manage your rounds")).toBeInTheDocument();
  });

  it("renders actions only when provided", () => {
    const { rerender } = render(<PageHeader title="Rounds" description="d" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<PageHeader title="Rounds" description="d" actions={<button>New round</button>} />);
    expect(screen.getByRole("button", { name: "New round" })).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  const navItems = [
    { label: "Dashboard", to: "/organiser", icon: LayoutDashboard },
    { label: "Olympiads", to: "/organiser/olympiads", icon: Trophy },
    { label: "Marking", to: "/organiser/marking", icon: ClipboardList },
  ];

  const renderShell = (
    path: string,
    props: Partial<Parameters<typeof AppShell>[0]> = {},
  ) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppShell
          activeRole="organiser"
          navItems={navItems}
          organisation="Wits Maths Olympiad"
          portalLabel="Organiser console"
          userInitials="TM"
          userName="Thandi Mokoena"
          {...props}
        >
          <p>Page content</p>
        </AppShell>
      </MemoryRouter>,
    );

  it("renders the page content inside the main region", () => {
    renderShell("/organiser");
    expect(within(screen.getByRole("main")).getByText("Page content")).toBeInTheDocument();
  });

  it("shows the organisation, portal label and signed-in user", () => {
    renderShell("/organiser");
    expect(screen.getByText("Wits Maths Olympiad")).toBeInTheDocument();
    expect(screen.getByText("Organiser console")).toBeInTheDocument();
    expect(screen.getByText("TM")).toBeInTheDocument();
    expect(screen.getByText("Thandi Mokoena")).toBeInTheDocument();
  });

  it("lists each navigation item as a link", () => {
    renderShell("/organiser");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Dashboard", "/organiser"],
      ["Olympiads", "/organiser/olympiads"],
      ["Marking", "/organiser/marking"],
    ]);
  });

  it("highlights the current page", () => {
    renderShell("/organiser/olympiads");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Olympiads" })).toHaveClass(shellStyles.navItemActive);
  });

  it("doesn't highlight the dashboard link on its sub-pages", () => {
    renderShell("/organiser/olympiads");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveClass(shellStyles.navItemActive);
  });

  it("highlights the dashboard link on the dashboard itself", () => {
    renderShell("/organiser");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveClass(shellStyles.navItemActive);
  });

  it.each([
    ["organiser", "Organiser"],
    ["educator", "Educator"],
    ["student", "Student"],
  ] as const)("marks %s as the active demo role", (role, accountLabel) => {
    renderShell(`/${role}`, { activeRole: role });
    const switcher = screen.getByRole("group", { name: "Switch demo role" });
    const pressed = within(switcher)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-pressed") === "true")
      .map((link) => link.textContent);
    expect(pressed).toEqual([role]);
    expect(screen.getByText(accountLabel)).toBeInTheDocument();
  });

  it("has a log out link to the login page", () => {
    renderShell("/organiser");
    expect(screen.getByRole("link", { name: "Log out" })).toHaveAttribute("href", "/login");
  });
});
