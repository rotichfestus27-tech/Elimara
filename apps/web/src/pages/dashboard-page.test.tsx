import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { DashboardPage } from "./dashboard-page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: {
      id: "school-1",
      name: "Authorized School",
      permissions: [
        "students.profile.read",
        "admissions.application.read",
        "reports.staff.read",
        "staff.profile.read",
        "reports.attendance.read",
        "attendance.register.read",
        "academics.configuration.read",
        "reports.dashboard.read",
        "assessments.read",
        "finance.reports.read",
      ],
    },
  })),
}));

vi.mock("@/app/auth-provider", () => ({
  useAuth: useAuthMock,
}));

const studentResponse = (total: number) => ({
  data: [],
  meta: { total, limit: 1, offset: 0 },
});

const applicationResponse = (
  applications: Array<{
    id: string;
    givenName: string;
    familyName: string;
    status: string;
    createdAt: string;
  }>,
  total = applications.length,
) => ({
  data: applications,
  meta: { total, limit: 5, offset: 0 },
});

const recentApplication = {
  id: "application-1",
  givenName: "Amina",
  familyName: "Njeri",
  status: "UNDER_REVIEW",
  createdAt: "2026-09-01T10:00:00.000Z",
};
const fetchMock = vi.fn<typeof fetch>();

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getSummaryCard(title: string) {
  const overview = screen.getByRole("heading", { name: "At a glance" }).closest("section");
  if (!overview) {
    throw new Error("Could not find the Dashboard overview section.");
  }
  const card = within(overview).getByText(title).closest('[class*="rounded-xl border"]');
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Could not find the summary card for "${title}".`);
  }
  return within(card);
}

describe("DashboardPage live-query states", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: [
          "students.profile.read",
          "admissions.application.read",
          "reports.staff.read",
          "staff.profile.read",
          "reports.attendance.read",
          "attendance.register.read",
          "academics.configuration.read",
          "reports.dashboard.read",
          "assessments.read",
          "finance.reports.read",
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/students?"))
        return Promise.resolve(jsonResponse(200, studentResponse(12)));
      if (endpoint.includes("/admission-applications?"))
        return Promise.resolve(jsonResponse(200, applicationResponse([recentApplication], 3)));
      if (endpoint.includes("/reports/staff?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { total: 8, limit: 1, offset: 0 },
          }),
        );
      }
      if (endpoint.includes("/reports/attendance?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [
              { date: "2026-10-20", status: "PRESENT", total: 28 },
              { date: "2026-10-20", status: "ABSENT", total: 2 },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows loading status while both Dashboard queries are pending", async () => {
    fetchMock.mockImplementation((input) => {
      if (
        String(input).includes("/students?") ||
        String(input).includes("/admission-applications?")
      ) {
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect((await screen.findByRole("status")).textContent).toContain(
      "Loading recent admissions...",
    );
    expect(getSummaryCard("Active students").getByText("Loading...")).toBeTruthy();
    expect(getSummaryCard("Admissions").getByText("Loading...")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/students?limit=1&status=ACTIVE",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/admission-applications?limit=5&sortBy=createdAt&sortOrder=desc",
      expect.any(Object),
    );
  });

  it("shows a successful empty admissions response and valid zero totals", async () => {
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/students?"))
        return Promise.resolve(jsonResponse(200, studentResponse(0)));
      if (endpoint.includes("/admission-applications?"))
        return Promise.resolve(jsonResponse(200, applicationResponse([], 0)));
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect(await screen.findByText("No admissions yet")).toBeTruthy();
    expect(getSummaryCard("Active students").getByText("0")).toBeTruthy();
    expect(getSummaryCard("Admissions").getByText("0")).toBeTruthy();
    expect(screen.queryByText("Recent admissions could not be loaded.")).toBeNull();
  });

  it("shows successful student and admissions data", async () => {
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/students?"))
        return Promise.resolve(jsonResponse(200, studentResponse(42)));
      if (endpoint.includes("/admission-applications?"))
        return Promise.resolve(jsonResponse(200, applicationResponse([recentApplication], 7)));
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect(await screen.findByText("Amina Njeri")).toBeTruthy();
    expect(getSummaryCard("Active students").getByText("42")).toBeTruthy();
    expect(getSummaryCard("Admissions").getByText("7")).toBeTruthy();
    expect(screen.getByText("under review")).toBeTruthy();
  });

  it("omits a recent-activity feed when no activity API is available", async () => {
    renderDashboard();

    expect(await screen.findByText("Amina Njeri")).toBeTruthy();
    expect(screen.queryByText(/school activity feed is not currently connected/i)).toBeNull();
    expect(screen.getByLabelText("Recent admissions and quick actions")).toBeTruthy();
  });

  it("reports an admissions failure and retries it without losing student data", async () => {
    let admissionsCalls = 0;
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/students?")) {
        return Promise.resolve(jsonResponse(200, studentResponse(19)));
      }
      if (endpoint.includes("/admission-applications?")) {
        if (new URL(endpoint, "http://local").searchParams.has("status")) {
          return Promise.resolve(
            jsonResponse(200, {
              data: [],
              meta: { total: 0, limit: 1, offset: 0 },
            }),
          );
        }
        admissionsCalls += 1;
        return admissionsCalls === 1
          ? Promise.resolve(jsonResponse(503, { error: { message: "Admissions unavailable" } }))
          : Promise.resolve(jsonResponse(200, applicationResponse([recentApplication], 1)));
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect(
      await screen.findByText(
        "Recent admissions could not be loaded. Use the retry control above to try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Some school overview data could not be loaded",
    );
    expect(getSummaryCard("Active students").getByText("19")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry admissions" }));

    expect(await screen.findByText("Amina Njeri")).toBeTruthy();
    expect(getSummaryCard("Admissions").getByText("1")).toBeTruthy();
    expect(admissionsCalls).toBe(2);
  });

  it("keeps valid admissions data visible when the student request fails", async () => {
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/students?"))
        return Promise.resolve(jsonResponse(503, { error: { message: "Students unavailable" } }));
      if (endpoint.includes("/admission-applications?"))
        return Promise.resolve(jsonResponse(200, applicationResponse([recentApplication], 4)));
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect(await screen.findByText("Amina Njeri")).toBeTruthy();
    expect(getSummaryCard("Admissions").getByText("4")).toBeTruthy();
    expect(getSummaryCard("Active students").getByText("Unavailable")).toBeTruthy();
    expect(
      getSummaryCard("Active students").getByText("Student count could not be loaded"),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Some school overview data could not be loaded",
    );
  });

  it("shows staff and attendance counts from permission-protected report endpoints", async () => {
    renderDashboard();

    expect(await getSummaryCard("Staff").findByText("8")).toBeTruthy();
    expect(await getSummaryCard("Attendance").findByText("30")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/schools\/school-1\/reports\/staff\?/),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/schools\/school-1\/reports\/attendance\?/),
      expect.any(Object),
    );
  });

  it("marks attendance as needing a valid date range and skips the invalid request", async () => {
    renderDashboard();
    expect(await getSummaryCard("Attendance").findByText("30")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-21" } });

    expect(await getSummaryCard("Attendance").findByText("Check dates")).toBeTruthy();
    expect(
      getSummaryCard("Attendance").getByText(
        "Select a valid date range in the school report section",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "The start date must be on or before the end date.",
    );
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), "http://local");
        return (
          url.pathname.endsWith("/reports/attendance") &&
          url.searchParams.get("from") === "2026-10-21" &&
          url.searchParams.get("to") === "2026-10-20"
        );
      }),
    ).toBe(false);
  });

  it("does not request reports without all required staff and attendance permissions", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["staff.profile.read", "attendance.register.read"],
      },
    });

    renderDashboard();

    expect(getSummaryCard("Staff").getByText("Not available")).toBeTruthy();
    expect(getSummaryCard("Attendance").getByText("Not available")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        /\/reports\/(staff|attendance)(\?|$)/.test(String(input)),
      ),
    ).toBe(false);
  });

  it("hides school report results while the selected date range is invalid", async () => {
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/academic-years?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: "year-1", name: "2026", status: "ACTIVE" }],
            meta: { total: 1, limit: 100, offset: 0 },
          }),
        );
      }
      if (endpoint.includes("/terms?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: "term-1", name: "Term 1", status: "ACTIVE" }],
            meta: { total: 1, limit: 100, offset: 0 },
          }),
        );
      }
      if (endpoint.includes("/reports/dashboard?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: {
              attendance: [],
              academics: {
                assessmentCount: 7,
                eligibleCount: 0,
                enteredCount: 0,
                missingCount: 0,
                publishedCount: 0,
              },
              finance: {
                from: "2026-10-01",
                to: "2026-10-07",
                paymentsReceived: "12500.50",
                paymentCount: 0,
                outstandingCharges: "7400.00",
                unappliedCredit: "350.50",
              },
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect(await screen.findByText("Assessments:")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("KES 12,500.50")).toBeTruthy();
    expect(screen.getByText("KES 7,400.00")).toBeTruthy();
    expect(screen.getByText("KES 350.50")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2099-01-02" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2099-01-01" } });

    expect(
      await screen.findByText("Choose a valid date range to view the school report."),
    ).toBeTruthy();
    expect(screen.queryByText("Assessments:")).toBeNull();
  });

  it("retries a failed combined school report without showing report values as zero", async () => {
    let reportCalls = 0;
    fetchMock.mockImplementation((input) => {
      const endpoint = String(input);
      if (endpoint.includes("/academic-years?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: "year-1", name: "2026", status: "ACTIVE" }],
            meta: { total: 1, limit: 100, offset: 0 },
          }),
        );
      }
      if (endpoint.includes("/terms?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: "term-1", name: "Term 1", status: "ACTIVE" }],
            meta: { total: 1, limit: 100, offset: 0 },
          }),
        );
      }
      if (endpoint.includes("/reports/dashboard?")) {
        reportCalls += 1;
        return reportCalls === 1
          ? Promise.resolve(
              jsonResponse(503, { error: { message: "Dashboard report unavailable" } }),
            )
          : Promise.resolve(
              jsonResponse(200, {
                data: {
                  attendance: [],
                  academics: {
                    assessmentCount: 2,
                    eligibleCount: 10,
                    enteredCount: 8,
                    missingCount: 2,
                    publishedCount: 1,
                  },
                  finance: {
                    from: "2026-10-21",
                    to: "2026-10-28",
                    paymentsReceived: "12500.50",
                    paymentCount: 3,
                    outstandingCharges: "7400.00",
                    unappliedCredit: "350.50",
                  },
                },
              }),
            );
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 100, offset: 0 } }),
      );
    });

    renderDashboard();

    expect(await screen.findByText("Dashboard report unavailable")).toBeTruthy();
    expect(screen.queryByText("Assessments:")).toBeNull();
    expect(screen.queryByText("KES 0.00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry school report" }));

    expect(await screen.findByText("Assessments:")).toBeTruthy();
    expect(screen.getByText("KES 12,500.50")).toBeTruthy();
    expect(screen.getByText("KES 7,400.00")).toBeTruthy();
    expect(reportCalls).toBe(2);
  });

  it("does not request dashboard data without matching server-returned permissions", async () => {
    useAuthMock.mockReturnValue({
      school: { id: "school-1", name: "Authorized School", permissions: [] },
    });

    renderDashboard();

    expect(getSummaryCard("Active students").getByText("Not available")).toBeTruthy();
    expect(getSummaryCard("Admissions").getByText("Not available")).toBeTruthy();
    expect(getSummaryCard("Staff").getByText("Not available")).toBeTruthy();
    expect(getSummaryCard("Attendance").getByText("Not available")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        /\/(students|admission-applications|reports\/staff|reports\/attendance|academic-years|reports\/dashboard)/.test(
          String(input),
        ),
      ),
    ).toBe(false);
    expect(screen.queryByRole("link", { name: "View admissions" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Review applications" })).toBeNull();
  });
});
