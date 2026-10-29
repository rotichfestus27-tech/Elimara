import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardWorkspaceLayout } from "./dashboard-workspace-layout";
import { WorkspaceNavigationLinks } from "./workspace-navigation";

afterEach(cleanup);

function SchoolWorkspaceHarness() {
  const [navigationClosed, setNavigationClosed] = useState(false);

  return (
    <DashboardWorkspaceLayout
      navigationLabel="school navigation"
      pageTitle="Dashboard"
      workspaceHref="/dashboard"
      renderSidebar={(onNavigate) => (
        <WorkspaceNavigationLinks
          ariaLabel="School navigation"
          items={[{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }]}
          onNavigate={() => {
            setNavigationClosed(true);
            onNavigate?.();
          }}
        />
      )}
      status={<span>Server-authorized school context</span>}
      workspaceLabel="North School"
    >
      <p>School dashboard body</p>
      {navigationClosed && <p>Mobile navigation dismissed</p>}
    </DashboardWorkspaceLayout>
  );
}

describe("DashboardWorkspaceLayout", () => {
  it("provides a shared responsive frame while accepting plane-specific content", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <SchoolWorkspaceHarness />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toContain(
      "North School",
    );
    expect(screen.getByRole("link", { name: "North School" }).getAttribute("href")).toBe(
      "/dashboard",
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }).querySelector("[aria-current='page']")
        ?.textContent,
    ).toBe("Dashboard");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Server-authorized school context")).toBeTruthy();
    expect(screen.getByText("School dashboard body")).toBeTruthy();
    expect(screen.getByRole("main").className).toContain("min-w-0");

    fireEvent.click(screen.getByRole("button", { name: "Open school navigation" }));
    fireEvent.click(await screen.findByRole("link", { name: "Dashboard" }));
    expect(await screen.findByText("Mobile navigation dismissed")).toBeTruthy();
  });
});
