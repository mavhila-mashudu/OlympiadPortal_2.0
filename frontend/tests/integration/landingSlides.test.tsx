import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./support/renderApp";

describe("public landing page", () => {
  it("uses normal in-page navigation and preserves account links", async () => {
    const { user, currentPath } = renderApp("/");
    expect(screen.getByRole("heading", { name: /A place for bright minds/i })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "How it works" }));
    expect(screen.getByRole("heading", { name: /A clear path from/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#how-it-works");
    expect(screen.getByRole("link", { name: "Who it's for" })).toHaveAttribute("href", "#who-its-for");
    expect(screen.getByRole("heading", { name: /One platform/i })).toBeInTheDocument();
    expect(currentPath()).toBe("/");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /Get started/i })).toHaveAttribute("href", "/signup");
  });
});
