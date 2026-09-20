import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Card } from "../../../../src/components/ui/Card";
import cardStyles from "../../../../src/components/ui/Card.module.css";
import { StatusBadge } from "../../../../src/components/ui/StatusBadge";
import badgeStyles from "../../../../src/components/ui/StatusBadge.module.css";
import { TablePanel, Td, Th } from "../../../../src/components/ui/Table";
import tableStyles from "../../../../src/components/ui/Table.module.css";
import { Toast } from "../../../../src/components/ui/Toast";

describe("Card", () => {
  it("is a padded section by default", () => {
    render(<Card aria-label="Summary">Body</Card>);
    const card = screen.getByRole("region", { name: "Summary" });
    expect(card.tagName).toBe("SECTION");
    expect(card).toHaveClass(cardStyles.card, cardStyles.padded);
    expect(card).toHaveTextContent("Body");
  });

  it("can drop the padding and take extra classes", () => {
    render(
      <Card aria-label="Table" padded={false} className="flush">
        Body
      </Card>,
    );
    const card = screen.getByRole("region", { name: "Table" });
    expect(card).not.toHaveClass(cardStyles.padded);
    expect(card).toHaveClass(cardStyles.card, "flush");
  });
});

describe("StatusBadge", () => {
  it.each([
    ["open", "Open"],
    ["upcoming", "Upcoming"],
    ["closed", "Closed"],
  ] as const)("shows %s rounds as '%s'", (status, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass(badgeStyles.badge, badgeStyles[status]);
  });
});

describe("TablePanel", () => {
  const table = (props: Partial<Parameters<typeof TablePanel>[0]> = {}) =>
    render(
      <TablePanel {...props}>
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </TablePanel>,
    );

  it("shows a heading when given a title", () => {
    table({ title: "Results" });
    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("cell");
  });

  it("omits the heading without a title", () => {
    table();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("sets a default minimum table width for horizontal scrolling", () => {
    table();
    expect(screen.getByRole("table").style.getPropertyValue("--table-min-width")).toBe("52rem");
  });

  it("accepts a custom minimum width", () => {
    table({ minWidth: "30rem" });
    const tableEl = screen.getByRole("table");
    expect(tableEl.style.getPropertyValue("--table-min-width")).toBe("30rem");
    expect(tableEl).toHaveClass(tableStyles.table);
  });
});

describe("Th and Td", () => {
  const renderRow = (cells: React.ReactNode) =>
    render(
      <table>
        <tbody>
          <tr>{cells}</tr>
        </tbody>
      </table>,
    );

  it("right-aligns numeric headers", () => {
    renderRow(
      <>
        <Th numeric>Score</Th>
        <Th className="wide">Name</Th>
      </>,
    );
    expect(screen.getByText("Score")).toHaveClass(tableStyles.numeric);
    expect(screen.getByText("Name")).not.toHaveClass(tableStyles.numeric);
    expect(screen.getByText("Name")).toHaveClass("wide");
  });

  it("mutes cells by default", () => {
    renderRow(<Td>Parktown</Td>);
    const cell = screen.getByText("Parktown");
    expect(cell).toHaveClass(tableStyles.muted);
    expect(cell).not.toHaveClass(tableStyles.strong, tableStyles.numeric);
  });

  it("supports strong, numeric, un-muted cells", () => {
    renderRow(
      <Td strong numeric muted={false} className="x">
        42
      </Td>,
    );
    const cell = screen.getByText("42");
    expect(cell).toHaveClass(tableStyles.strong, tableStyles.numeric, "x");
    expect(cell).not.toHaveClass(tableStyles.muted);
  });
});

describe("Toast", () => {
  it("announces the message as an alert", () => {
    render(<Toast type="success" message="Invitation sent" onDismiss={vi.fn()} />);
    expect(within(screen.getByRole("alert")).getByText("Invitation sent")).toBeInTheDocument();
  });

  it.each([
    ["success", "rgb(236, 253, 245)", "rgb(22, 101, 52)"],
    ["error", "rgb(254, 242, 242)", "rgb(153, 27, 27)"],
  ] as const)("uses %s colours", (type, background, color) => {
    render(<Toast type={type} message="m" onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveStyle({ backgroundColor: background, color });
  });

  it("calls onDismiss when closed", async () => {
    const onDismiss = vi.fn();
    render(<Toast type="error" message="Failed" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
