import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./page-header";

afterEach(cleanup);

describe("PageHeader", () => {
  it("provides a consistent title and description with optional actions", () => {
    render(
      <PageHeader
        actions={<Button>Refresh</Button>}
        description="Manage the records available in this workspace."
        eyebrow={<span>Workspace</span>}
        title="School records"
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "School records" })).toBeTruthy();
    expect(screen.getByText("Workspace")).toBeTruthy();
    expect(screen.getByText("Manage the records available in this workspace.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("does not render an empty action area", () => {
    const { container } = render(
      <PageHeader description="Review school records." title="Dashboard" />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Dashboard" })).toBeTruthy();
    expect(container.querySelector("header")?.children).toHaveLength(1);
  });
});
