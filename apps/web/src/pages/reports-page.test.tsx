import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { ReportsPage } from "./reports-page";

const { useAuthMock, downloadReportMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: { id: "school-1", name: "Authorized School", permissions: [] as string[] },
  })),
  downloadReportMock: vi.fn(),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  downloadReport: downloadReportMock,
}));

const fetchMock = vi.fn<typeof fetch>();
const financeExportPermissions = [
  "reports.exports.generate",
  "reports.finance.read",
  "finance.reports.read",
];

function renderReportsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  downloadReportMock.mockReset();
  downloadReportMock.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({
    school: { id: "school-1", name: "Authorized School", permissions: financeExportPermissions },
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() =>
    Promise.resolve(jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } })),
  );
});

describe("ReportsPage finance export", () => {
  it("requires export, report, and source permissions for every report option", () => {
    const permissions = [
      ...financeExportPermissions,
      "reports.students.read",
      "students.profile.read",
      "reports.attendance.read",
      "attendance.register.read",
      "reports.academics.read",
      "assessments.read",
      "academics.configuration.read",
      "reports.staff.read",
      "staff.profile.read",
    ];
    useAuthMock.mockReturnValue({
      school: { id: "school-1", name: "Authorized School", permissions },
    });
    renderReportsPage();

    expect(screen.getByRole("option", { name: "Student directory" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Attendance summary" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Academic summary" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Finance summary" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Staff directory" })).toBeTruthy();
  });

  it.each([
    ["students", "reports.students.read"],
    ["students", "students.profile.read"],
    ["attendance", "reports.attendance.read"],
    ["attendance", "attendance.register.read"],
    ["academics", "reports.academics.read"],
    ["academics", "assessments.read"],
    ["academics", "academics.configuration.read"],
    ["finance", "reports.finance.read"],
    ["finance", "finance.reports.read"],
    ["staff", "reports.staff.read"],
    ["staff", "staff.profile.read"],
  ] as const)(
    "hides the %s export when its %s permission is missing",
    (report, missingPermission) => {
      useAuthMock.mockReturnValue({
        school: {
          id: "school-1",
          name: "Authorized School",
          permissions: [
            ...financeExportPermissions,
            "reports.students.read",
            "students.profile.read",
            "reports.attendance.read",
            "attendance.register.read",
            "reports.academics.read",
            "assessments.read",
            "academics.configuration.read",
            "reports.staff.read",
            "staff.profile.read",
          ].filter((permission) => permission !== missingPermission),
        },
      });
      renderReportsPage();

      expect(
        screen.queryByRole("option", {
          name: {
            students: "Student directory",
            attendance: "Attendance summary",
            academics: "Academic summary",
            finance: "Finance summary",
            staff: "Staff directory",
          }[report],
        }),
      ).toBeNull();
    },
  );

  it("does not render an export control when no report is fully authorized", () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["reports.exports.generate", "reports.students.read"],
      },
    });
    renderReportsPage();

    expect(
      screen.getByText(
        "No report exports are available for the permissions in this school context.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
  });

  it("does not fetch academic options or expose an export without configuration read access", () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["reports.exports.generate", "reports.academics.read", "assessments.read"],
      },
    });
    renderReportsPage();

    expect(screen.queryByRole("option", { name: "Academic summary" })).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => /\/academic-years\?|\/terms\?/.test(String(input))),
    ).toBe(false);
  });

  it("announces academic option loading and empty results", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: [
          "reports.exports.generate",
          "reports.academics.read",
          "assessments.read",
          "academics.configuration.read",
        ],
      },
    });
    let resolveYears!: (response: Response) => void;
    let resolveTerms!: (response: Response) => void;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/academic-years?")) {
        return new Promise<Response>((resolve) => {
          resolveYears = resolve;
        });
      }
      if (url.includes("/terms?")) {
        return new Promise<Response>((resolve) => {
          resolveTerms = resolve;
        });
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderReportsPage();

    expect((await screen.findByRole("status")).textContent).toBe("Loading academic years...");
    expect(screen.getByRole("combobox", { name: "Academic year" }).hasAttribute("disabled")).toBe(
      true,
    );
    resolveYears(
      jsonResponse(200, {
        data: [{ id: "year-1", name: "2026", status: "ACTIVE" }],
        meta: { limit: 100, offset: 0, total: 1 },
      }),
    );

    expect(await screen.findByRole("option", { name: "2026" })).toBeTruthy();
    fireEvent.change(await screen.findByRole("combobox", { name: "Academic year" }), {
      target: { value: "year-1" },
    });
    expect((await screen.findByRole("status")).textContent).toBe("Loading terms...");
    expect(screen.getByRole("combobox", { name: "Term" }).hasAttribute("disabled")).toBe(true);
    resolveTerms(
      jsonResponse(200, {
        data: [],
        meta: { limit: 100, offset: 0, total: 0 },
      }),
    );

    expect(
      await screen.findByText("No active terms are available for this academic year."),
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Term" }).hasAttribute("disabled")).toBe(false);
  });

  it("retries failed academic year and term option queries", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: [
          "reports.exports.generate",
          "reports.academics.read",
          "assessments.read",
          "academics.configuration.read",
        ],
      },
    });
    let yearCalls = 0;
    let termCalls = 0;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/academic-years?")) {
        yearCalls += 1;
        return Promise.resolve(
          yearCalls === 1
            ? jsonResponse(503, { error: { message: "Academic years unavailable." } })
            : jsonResponse(200, {
                data: [{ id: "year-1", name: "2026", status: "ACTIVE" }],
                meta: { limit: 100, offset: 0, total: 1 },
              }),
        );
      }
      if (url.includes("/terms?")) {
        termCalls += 1;
        return Promise.resolve(
          termCalls === 1
            ? jsonResponse(503, { error: { message: "Terms unavailable." } })
            : jsonResponse(200, {
                data: [{ id: "term-1", name: "Term 1", academicYearId: "year-1" }],
                meta: { limit: 100, offset: 0, total: 1 },
              }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderReportsPage();

    expect(await screen.findByText("Academic years unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry academic years" }));
    expect(await screen.findByRole("option", { name: "2026" })).toBeTruthy();
    expect(yearCalls).toBe(2);

    fireEvent.change(screen.getByRole("combobox", { name: "Academic year" }), {
      target: { value: "year-1" },
    });
    expect(await screen.findByText("Terms unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry terms" }));
    expect(await screen.findByRole("option", { name: "Term 1" })).toBeTruthy();
    expect(termCalls).toBe(2);
  });

  it("offers finance export with the supported inclusive date filters only", async () => {
    renderReportsPage();

    fireEvent.change(screen.getByLabelText("Report"), { target: { value: "finance" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-24" } });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(downloadReportMock).toHaveBeenCalledWith(
      "/schools/school-1/reports/finance/export.csv?from=2026-10-01&to=2026-10-24",
      "finance-report.csv",
    );
  });

  it("rejects date ranges longer than 366 inclusive days", () => {
    renderReportsPage();
    fireEvent.change(screen.getByLabelText("Report"), { target: { value: "finance" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-01-02" } });

    expect(screen.getByRole("alert").textContent).toBe(
      "Choose a date range of no more than 366 days.",
    );
    expect(screen.getByRole("button", { name: "Download CSV" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(downloadReportMock).not.toHaveBeenCalled();
  });

  it("allows the maximum 366-day inclusive date range", () => {
    renderReportsPage();
    fireEvent.change(screen.getByLabelText("Report"), { target: { value: "finance" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-01-01" } });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Download CSV" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("disables the download control while an export is pending", async () => {
    let resolveExport: (() => void) | undefined;
    downloadReportMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveExport = resolve;
        }),
    );
    renderReportsPage();

    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(
      screen.getByRole("button", { name: "Generating report..." }).hasAttribute("disabled"),
    ).toBe(true);
    if (!resolveExport) throw new Error("The report export was not started.");
    resolveExport();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Download CSV" }).hasAttribute("disabled")).toBe(
        false,
      );
    });
  });

  it("does not offer finance export without all required permissions", () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["reports.finance.read", "finance.reports.read"],
      },
    });
    renderReportsPage();

    expect(screen.queryByRole("option", { name: "Finance summary" })).toBeNull();
    expect(downloadReportMock).not.toHaveBeenCalled();
  });

  it("shows an API export failure without reporting a successful download", async () => {
    downloadReportMock.mockRejectedValueOnce(new Error("Finance export unavailable."));
    renderReportsPage();

    fireEvent.change(screen.getByLabelText("Report"), { target: { value: "finance" } });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(await screen.findByText("The data could not be loaded. Try again.")).toBeTruthy();
    expect(downloadReportMock).toHaveBeenCalledTimes(1);
  });
});
