import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutDashboard, UsersRound } from "lucide-react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { getVisibleSchoolNavigationItems } from "@/config/navigation";
import { MobileNavigationDrawer, WorkspaceNavigationLinks } from "./workspace-navigation";

afterEach(cleanup);

function MobileNavigationHarness() {
  const [open, setOpen] = useState(false);

  return (
    <MobileNavigationDrawer label="school navigation" onOpenChange={setOpen} open={open}>
      <WorkspaceNavigationLinks
        ariaLabel="School navigation"
        items={[
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { label: "Students", href: "/students", icon: UsersRound },
        ]}
        onNavigate={() => setOpen(false)}
      />
    </MobileNavigationDrawer>
  );
}

describe("getVisibleSchoolNavigationItems", () => {
  it("keeps the dashboard and only shows sections represented by server permissions", () => {
    const visible = getVisibleSchoolNavigationItems({
      permissions: ["students.profile.read", "finance.fees.read"],
    });

    expect(visible.map((item) => item.href)).toEqual(["/dashboard", "/students", "/finance"]);
  });

  it("does not infer access when the server returns no permissions", () => {
    const visible = getVisibleSchoolNavigationItems({ permissions: [] });

    expect(visible.map((item) => item.href)).toEqual(["/dashboard"]);
  });

  it("does not expose feature navigation for unknown permission keys", () => {
    const visible = getVisibleSchoolNavigationItems({
      permissions: ["future.role.permission"],
    });

    expect(visible.map((item) => item.href)).toEqual(["/dashboard"]);
  });

  it.each([
    ["students", ["reports.exports.generate", "reports.students.read", "students.profile.read"]],
    [
      "attendance",
      ["reports.exports.generate", "reports.attendance.read", "attendance.register.read"],
    ],
    [
      "academics",
      [
        "reports.exports.generate",
        "reports.academics.read",
        "assessments.read",
        "academics.configuration.read",
      ],
    ],
    ["finance", ["reports.exports.generate", "reports.finance.read", "finance.reports.read"]],
    ["staff", ["reports.exports.generate", "reports.staff.read", "staff.profile.read"]],
  ])("shows Reports for the complete %s export permission set", (_report, permissions) => {
    expect(getVisibleSchoolNavigationItems({ permissions }).map((item) => item.href)).toContain(
      "/reports",
    );
  });

  it("hides Reports for partial or non-export report permissions", () => {
    expect(
      getVisibleSchoolNavigationItems({
        permissions: ["reports.students.read", "students.profile.read"],
      }).map((item) => item.href),
    ).not.toContain("/reports");
    expect(
      getVisibleSchoolNavigationItems({
        permissions: ["reports.exports.generate", "reports.academics.read", "assessments.read"],
      }).map((item) => item.href),
    ).not.toContain("/reports");
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["reports.dashboard.read"] }).map(
        (item) => item.href,
      ),
    ).not.toContain("/reports");
  });

  it("fails closed to the dashboard when no authorized school context exists", () => {
    const visible = getVisibleSchoolNavigationItems(null);

    expect(visible.map((item) => item.href)).toEqual(["/dashboard"]);
  });

  it("shows the Library module only for a server-returned library permission", () => {
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["library.loans.read"] }).map(
        (item) => item.href,
      ),
    ).toContain("/library");
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["library.catalog.manage"] }).map(
        (item) => item.href,
      ),
    ).toContain("/library");
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["library.loans.manage"] }).map(
        (item) => item.href,
      ),
    ).toContain("/library");
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["future.library.read"] }).map(
        (item) => item.href,
      ),
    ).not.toContain("/library");
  });

  it("shows Finance for a server-returned finance report permission", () => {
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["finance.reports.read"] }).map(
        (item) => item.href,
      ),
    ).toContain("/finance");
  });

  it("shows Finance for fee management without fee-list access", () => {
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["finance.fees.manage"] }).map(
        (item) => item.href,
      ),
    ).toContain("/finance");
  });

  it("shows Finance for server-returned payment permissions", () => {
    expect(
      getVisibleSchoolNavigationItems({ permissions: ["finance.payments.record"] }).map(
        (item) => item.href,
      ),
    ).toContain("/finance");
  });

  it.each(["finance.adjustments.manage", "finance.refunds.manage", "finance.payments.reconcile"])(
    "shows Finance for the server-returned %s capability",
    (permission) => {
      expect(
        getVisibleSchoolNavigationItems({ permissions: [permission] }).map((item) => item.href),
      ).toContain("/finance");
    },
  );
});

describe("WorkspaceNavigationLinks", () => {
  it("marks only the current nested route as the active page", () => {
    render(
      <MemoryRouter initialEntries={["/students/123"]}>
        <WorkspaceNavigationLinks
          ariaLabel="School navigation"
          items={[
            { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { label: "Students", href: "/students", icon: UsersRound },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Students" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("MobileNavigationDrawer", () => {
  it("opens the mobile menu and closes it after navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MobileNavigationHarness />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open school navigation" }));
    const studentsLink = await screen.findByRole("link", { name: "Students" });
    expect(studentsLink).toBeTruthy();
    fireEvent.click(studentsLink);

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: "School navigation" })).toBeNull();
    });
  });
});
