import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Breadcrumbs,
  DashboardBarChart,
  DashboardDataTable,
  DashboardLoadingSkeleton,
  DashboardPageHeading,
  DashboardSearchField,
} from "./dashboard-primitives";
import { SummaryCard } from "./summary-card";

afterEach(cleanup);

describe("dashboard primitives", () => {
  it("renders linked breadcrumbs and a responsive page heading", () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: "School", href: "/dashboard" }, { label: "Students" }]} />
        <DashboardPageHeading
          actions={<button type="button">Export</button>}
          description="Current school records"
          eyebrow="School workspace"
          title="Student overview"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "School" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByRole("heading", { name: "Student overview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("renders data tables with accessible captions and column headers", () => {
    render(
      <DashboardDataTable caption="School summaries" headers={["Name", "Count"]}>
        <tr>
          <th scope="row">Classes</th>
          <td>4</td>
        </tr>
      </DashboardDataTable>,
    );

    expect(screen.getByRole("table", { name: "School summaries" })).toBeTruthy();
    const scrollRegion = screen.getByRole("region", {
      name: "Scrollable table: School summaries",
    });
    expect(scrollRegion.getAttribute("tabindex")).toBe("0");
    expect(scrollRegion.className).toContain("focus-visible:ring-2");
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Classes" })).toBeTruthy();
  });

  it("renders summary cards without fabricating unavailable values", () => {
    render(
      <SummaryCard
        item={{
          title: "Attendance",
          description: "Authorized records only",
          icon: LayoutDashboard,
        }}
      />,
    );

    expect(screen.getByText("Attendance")).toBeTruthy();
    expect(screen.getByText("—").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("No data available").className).toContain("sr-only");
    expect(screen.getByText("Awaiting data connection")).toBeTruthy();
  });

  it("supports controlled search and accessible loading/chart empty states", () => {
    const onChange = vi.fn();
    render(
      <>
        <DashboardSearchField label="Search classes" onChange={onChange} value="" />
        <DashboardLoadingSkeleton rows={2} />
        <DashboardBarChart title="Attendance counts" values={[]} />
      </>,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search classes" }), {
      target: { value: "Room 1" },
    });

    expect(onChange).toHaveBeenCalledWith("Room 1");
    const loadingStatus = screen.getByRole("status", { name: "Loading dashboard data" });
    expect(loadingStatus.firstElementChild?.getAttribute("style")).toContain("height: 6.75rem");
    expect(screen.getByText("No chart data is available.")).toBeTruthy();
  });
});
