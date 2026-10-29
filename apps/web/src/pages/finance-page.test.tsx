import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/client";
import { jsonResponse } from "@/test-utils/mock-response";
import { FinancePage } from "./finance-page";

const { downloadReportMock } = vi.hoisted(() => ({
  downloadReportMock: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  downloadReport: downloadReportMock,
}));

const account = (index: number) => ({
  accountId: `account-${index}`,
  studentId: `student-${index}`,
  admissionNumber: `ADM-${String(index).padStart(3, "0")}`,
  studentGivenName: `Student${index}`,
  studentFamilyName: "Example",
  totalPayments: "125.00",
  outstandingCharges: "250.00",
  unappliedCredit: "25.00",
  balanceDue: "225.00",
  netBalance: "225.00",
});

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: {
      id: "school-1",
      name: "Authorized School",
      permissions: ["finance.accounts.read", "finance.fees.read", "finance.reports.read"],
    },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderFinancePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FinancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function academicOptionsResponse(pathname: string) {
  const records = pathname.endsWith("/academic-years")
    ? [{ id: "year-1", name: "2026", status: "ACTIVE" }]
    : pathname.endsWith("/terms")
      ? [{ id: "term-1", academicYearId: "year-1", name: "Term 1", status: "ACTIVE" }]
      : [{ id: "class-1", academicYearId: "year-1", name: "Class 1" }];
  return jsonResponse(200, {
    data: records,
    meta: { limit: 100, offset: 0, total: records.length },
  });
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
    school: {
      id: "school-1",
      name: "Authorized School",
      permissions: ["finance.accounts.read", "finance.fees.read", "finance.reports.read"],
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/finance/reports/summary?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            from: "2026-09-25",
            to: "2026-10-24",
            paymentsReceived: "12500.50",
            paymentCount: 5,
            chargeCount: 9,
            outstandingCharges: "7400.00",
            unappliedCredit: "350.50",
            reconciliationExceptionCount: 1,
          },
        }),
      );
    }
    if (url.includes("/finance/accounts?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { limit: 25, offset: 0, total: 0 },
        }),
      );
    }
    if (url.includes("/finance/fee-structures?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { limit: 25, offset: 0, total: 0 },
        }),
      );
    }
    return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
  });
});

describe("FinancePage", () => {
  it("shows the authorized finance summary returned by the API", async () => {
    renderFinancePage();

    expect(
      screen.getByRole("button", { name: "Student accounts" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(await screen.findByText("KES 12,500.50")).toBeTruthy();
    expect(screen.getByText("KES 7,400.00")).toBeTruthy();
    expect(screen.getByText("KES 350.50")).toBeTruthy();
    expect(screen.getByText("5 payments in the period")).toBeTruthy();
    expect(screen.getByText("Charges posted")).toBeTruthy();
    expect(screen.getByText("Reconciliation exceptions")).toBeTruthy();
    expect(screen.getByText("No financial accounts")).toBeTruthy();
    expect(
      screen.getByText(/Report period: 2026-09-25 through 2026-10-24 \(inclusive UTC\)/),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/schools\/school-1\/finance\/reports\/summary\?/),
      expect.any(Object),
    );
  });

  it("exports the authoritative finance report for only the selected supported date filters", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.reports.read", "reports.finance.read", "reports.exports.generate"],
      },
    });
    renderFinancePage();

    await screen.findByText("KES 12,500.50");
    fireEvent.change(screen.getByLabelText("Finance summary from"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Finance summary to"), {
      target: { value: "2026-10-24" },
    });
    await waitFor(() => {
      const summaryRequest = fetchMock.mock.calls.find(([input]) => {
        const url = new URL(String(input), window.location.origin);
        return (
          url.pathname.endsWith("/finance/reports/summary") &&
          url.searchParams.get("from") === "2026-10-01" &&
          url.searchParams.get("to") === "2026-10-24"
        );
      });
      expect(summaryRequest).toBeTruthy();
      const url = new URL(String(summaryRequest?.[0]), window.location.origin);
      expect(url.searchParams.get("from")).toBe("2026-10-01");
      expect(url.searchParams.get("to")).toBe("2026-10-24");
      expect([...url.searchParams.keys()].sort()).toEqual(["from", "to"]);
    });
    const downloadButton = screen.getByRole("button", { name: "Download finance CSV" });
    fireEvent.click(downloadButton);

    expect(downloadReportMock).toHaveBeenCalledWith(
      "/schools/school-1/reports/finance/export.csv?from=2026-10-01&to=2026-10-24",
      "finance.csv",
    );
    expect(downloadReportMock.mock.calls[0]?.[0]).not.toMatch(
      /academicYearId|termId|classId|studentId/,
    );
  });

  it("does not expose finance CSV export without every required permission", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.reports.read", "reports.finance.read"],
      },
    });
    renderFinancePage();

    expect(await screen.findByText("KES 12,500.50")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download finance CSV" })).toBeNull();
    expect(downloadReportMock).not.toHaveBeenCalled();
  });

  it("shows permission-denied and service-failure feedback for finance CSV export", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.reports.read", "reports.finance.read", "reports.exports.generate"],
      },
    });
    downloadReportMock.mockRejectedValueOnce(
      new ApiClientError("Export permission denied.", 403, "FORBIDDEN"),
    );
    renderFinancePage();

    await screen.findByText("KES 12,500.50");
    fireEvent.click(screen.getByRole("button", { name: "Download finance CSV" }));
    expect(await screen.findByText("Finance report export access denied")).toBeTruthy();

    downloadReportMock.mockRejectedValueOnce(new Error("Finance export unavailable."));
    fireEvent.click(screen.getByRole("button", { name: "Download finance CSV" }));
    expect(
      await screen.findByText(
        "The finance report could not be exported. Finance export unavailable.",
      ),
    ).toBeTruthy();
  });

  it("does not request financial records outside the returned permissions", async () => {
    useAuthMock.mockReturnValue({
      school: { id: "school-1", name: "Authorized School", permissions: ["finance.fees.read"] },
    });
    renderFinancePage();

    expect(await screen.findByText("No fee structures")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/schools\/school-1\/finance\/fee-structures\?/),
      expect.any(Object),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          String(input).includes("/finance/accounts?") ||
          String(input).includes("/finance/reports/summary?"),
      ),
    ).toBe(false);
  });

  it("creates a fee structure with supported academic references and refreshes the list", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: [
          "finance.accounts.read",
          "finance.fees.read",
          "finance.fees.manage",
          "finance.reports.read",
          "academics.configuration.read",
        ],
      },
    });
    let structureReads = 0;
    let submittedBody: unknown;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/academic-years") ||
        url.pathname.endsWith("/terms") ||
        url.pathname.endsWith("/classes")
      ) {
        return Promise.resolve(academicOptionsResponse(url.pathname));
      }
      if (url.pathname.endsWith("/finance/fee-structures") && init?.method === "POST") {
        submittedBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse(201, {
            data: {
              id: "fee-new",
              name: "2026 Class 1",
              academicYearId: "year-1",
              termId: "term-1",
              classId: "class-1",
              status: "ACTIVE",
              items: [{ id: "item-1", name: "Tuition", amount: "1200.00" }],
            },
          }),
        );
      }
      if (url.pathname.endsWith("/finance/fee-structures")) {
        structureReads += 1;
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 25, offset: 0, total: 0 },
          }),
        );
      }
      if (url.pathname.endsWith("/finance/accounts")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            from: "2026-09-25",
            to: "2026-10-24",
            paymentsReceived: "0.00",
            paymentCount: 0,
            chargeCount: 0,
            outstandingCharges: "0.00",
            unappliedCredit: "0.00",
            reconciliationExceptionCount: 0,
          },
        }),
      );
    });
    renderFinancePage();

    fireEvent.click(screen.getByRole("button", { name: "Fee structures" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create fee structure" }));
    fireEvent.change(await screen.findByLabelText("Fee structure name"), {
      target: { value: "2026 Class 1" },
    });
    const academicYearSelect = await screen.findByLabelText("Academic year");
    fireEvent.change(academicYearSelect, { target: { value: "" } });
    expect((academicYearSelect as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Term") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(academicYearSelect, { target: { value: "year-1" } });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "term-1" } });
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "class-1" } });
    fireEvent.change(screen.getByLabelText("Item 1 name"), { target: { value: "Tuition" } });
    fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "1200.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create fee structure" }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("Fee structure created successfully.")).toBeTruthy();
    expect(submittedBody).toEqual({
      academicYearId: "year-1",
      termId: "term-1",
      classId: "class-1",
      name: "2026 Class 1",
      items: [{ name: "Tuition", amount: "1200.00" }],
    });
    expect(structureReads).toBeGreaterThanOrEqual(2);
  });

  it("does not submit invalid fee amounts", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.fees.manage", "academics.configuration.read"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/academic-years") ||
        url.pathname.endsWith("/terms") ||
        url.pathname.endsWith("/classes")
      ) {
        return Promise.resolve(academicOptionsResponse(url.pathname));
      }
      if (url.pathname.endsWith("/finance/fee-structures") && init?.method === "POST") {
        throw new Error("Invalid fee data was submitted.");
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
      );
    });
    renderFinancePage();

    fireEvent.click(await screen.findByRole("button", { name: "Create fee structure" }));
    fireEvent.change(await screen.findByLabelText("Fee structure name"), {
      target: { value: "2026 Class 1" },
    });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "term-1" } });
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "class-1" } });
    fireEvent.change(screen.getByLabelText("Item 1 name"), { target: { value: "Tuition" } });
    fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "0.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create fee structure" }));

    expect(
      await screen.findByText("Enter a positive amount with up to two decimal places."),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes("/finance/fee-structures") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("shows server permission errors when fee-structure creation is denied", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.fees.manage", "academics.configuration.read"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/academic-years") ||
        url.pathname.endsWith("/terms") ||
        url.pathname.endsWith("/classes")
      ) {
        return Promise.resolve(academicOptionsResponse(url.pathname));
      }
      if (url.pathname.endsWith("/finance/fee-structures") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(403, {
            error: { code: "FORBIDDEN", message: "The server denied this operation." },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
      );
    });
    renderFinancePage();

    fireEvent.click(await screen.findByRole("button", { name: "Create fee structure" }));
    fireEvent.change(await screen.findByLabelText("Fee structure name"), {
      target: { value: "2026 Class 1" },
    });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "term-1" } });
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "class-1" } });
    fireEvent.change(screen.getByLabelText("Item 1 name"), { target: { value: "Tuition" } });
    fireEvent.change(screen.getByLabelText("Amount (KES)"), { target: { value: "1200.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create fee structure" }));

    expect(
      await screen.findByText(
        "The server denied fee-structure creation. The server denied this operation.",
      ),
    ).toBeTruthy();
  });

  it("keeps fee creation available without granting list access", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["finance.fees.manage", "academics.configuration.read"],
      },
    });
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/academic-years") ||
        url.pathname.endsWith("/terms") ||
        url.pathname.endsWith("/classes")
      ) {
        return Promise.resolve(academicOptionsResponse(url.pathname));
      }
      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
      );
    });
    renderFinancePage();

    fireEvent.click(await screen.findByRole("button", { name: "Create fee structure" }));

    expect(await screen.findByText("Fee structure list access unavailable")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/finance/fee-structures?")),
    ).toBe(false);
  });

  it("shows denial when the school context has no finance read permission", () => {
    useAuthMock.mockReturnValue({
      school: { id: "school-1", name: "Authorized School", permissions: [] },
    });
    renderFinancePage();

    expect(screen.getByText("Finance access unavailable")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows report failures and allows retry", async () => {
    let reportCalls = 0;
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/finance/reports/summary?")) {
        reportCalls += 1;
        return reportCalls === 1
          ? Promise.resolve(jsonResponse(503, { error: { message: "Finance unavailable" } }))
          : Promise.resolve(
              jsonResponse(200, {
                data: {
                  from: "2026-09-25",
                  to: "2026-10-24",
                  paymentsReceived: "0.00",
                  paymentCount: 0,
                  chargeCount: 0,
                  outstandingCharges: "0.00",
                  unappliedCredit: "0.00",
                  reconciliationExceptionCount: 0,
                },
              }),
            );
      }
      if (String(input).includes("/finance/accounts?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 100, offset: 0, total: 0 },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderFinancePage();

    expect(await screen.findByText("The financial summary could not be loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const paymentsCard = await screen.findByText("Payments received");
    const card = paymentsCard.closest('[class*="rounded-xl border"]');
    expect(card).toBeInstanceOf(HTMLElement);
    if (card instanceof HTMLElement) {
      expect(within(card).getByText("KES 0.00")).toBeTruthy();
    }
    expect(reportCalls).toBe(2);
  });

  it("does not present a cached report period after a financial summary refresh fails", async () => {
    let reportCalls = 0;
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/finance/reports/summary?")) {
        reportCalls += 1;
        return Promise.resolve(
          reportCalls === 1
            ? jsonResponse(200, {
                data: {
                  from: "2026-09-25",
                  to: "2026-10-24",
                  paymentsReceived: "12500.50",
                  paymentCount: 5,
                  chargeCount: 9,
                  outstandingCharges: "7400.00",
                  unappliedCredit: "350.50",
                  reconciliationExceptionCount: 1,
                },
              })
            : jsonResponse(503, { error: { message: "Finance unavailable" } }),
        );
      }
      if (String(input).includes("/finance/accounts?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 25, offset: 0, total: 0 },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderFinancePage();

    expect(await screen.findByText("KES 12,500.50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("The financial summary could not be loaded.")).toBeTruthy();
    expect(screen.queryByText(/Report period: 2026-09-25 through 2026-10-24/)).toBeNull();
    expect(screen.queryByText("KES 12,500.50")).toBeNull();
    expect(screen.queryByText("KES 7,400.00")).toBeNull();
  });

  it("shows account payment totals and balance figures, with server pagination", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/accounts")) {
        const offset = Number(url.searchParams.get("offset"));
        return Promise.resolve(
          jsonResponse(200, {
            data: [account(offset === 0 ? 1 : 2)],
            meta: { limit: 25, offset, total: 26 },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            from: "2026-09-25",
            to: "2026-10-24",
            paymentsReceived: "12500.50",
            paymentCount: 5,
            chargeCount: 9,
            outstandingCharges: "7400.00",
            unappliedCredit: "350.50",
            reconciliationExceptionCount: 1,
          },
        }),
      );
    });
    renderFinancePage();

    expect(await screen.findByText("ADM-001")).toBeTruthy();
    expect(screen.getByText("KES 125.00")).toBeTruthy();
    expect(screen.getByText("KES 250.00")).toBeTruthy();
    expect(screen.getByText("KES 25.00")).toBeTruthy();
    expect(screen.getByText("KES 225.00")).toBeTruthy();
    expect(screen.getByText("Showing 1–1 of 26 student accounts.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("ADM-002")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/finance\/accounts\?limit=25&offset=25/),
      expect.any(Object),
    );
  });

  it("shows supported fee item amounts rather than calculating a fee total", async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/finance/fee-structures?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [
              {
                id: "fee-1",
                name: "Term fee",
                academicYearId: "year-1",
                termId: "term-1",
                classId: "class-1",
                status: "ACTIVE",
                items: [
                  { id: "item-1", name: "Tuition", amount: "1200.00" },
                  { id: "item-2", name: "Library", amount: "50.00" },
                ],
              },
            ],
            meta: { limit: 25, offset: 0, total: 1 },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            from: "2026-09-25",
            to: "2026-10-24",
            paymentsReceived: "0.00",
            paymentCount: 0,
            chargeCount: 0,
            outstandingCharges: "0.00",
            unappliedCredit: "0.00",
            reconciliationExceptionCount: 0,
          },
        }),
      );
    });
    renderFinancePage();
    fireEvent.click(screen.getByRole("button", { name: "Fee structures" }));

    expect(await screen.findByText("Tuition")).toBeTruthy();
    expect(screen.getByText("KES 1,200.00")).toBeTruthy();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("KES 50.00")).toBeTruthy();
    expect(screen.queryByText("KES 1250.00")).toBeNull();
  });

  it("distinguishes a server-denied account request from a service failure", async () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/finance/accounts?")) {
        return Promise.resolve(
          jsonResponse(403, { error: { code: "FORBIDDEN", message: "Forbidden." } }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            from: "2026-09-25",
            to: "2026-10-24",
            paymentsReceived: "0.00",
            paymentCount: 0,
            chargeCount: 0,
            outstandingCharges: "0.00",
            unappliedCredit: "0.00",
            reconciliationExceptionCount: 0,
          },
        }),
      );
    });
    renderFinancePage();

    expect(await screen.findByText("Finance data access denied")).toBeTruthy();
  });

  it("shows a permission-denied state for a server-denied financial summary", async () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/finance/reports/summary?")) {
        return Promise.resolve(
          jsonResponse(403, { error: { code: "FORBIDDEN", message: "Forbidden." } }),
        );
      }
      if (String(input).includes("/finance/accounts?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderFinancePage();

    expect(await screen.findByText("Financial summary access denied")).toBeTruthy();
  });

  it("does not request a summary period beyond the supported date range", async () => {
    renderFinancePage();
    await screen.findByText("Payments received");
    fireEvent.change(screen.getByLabelText("Finance summary from"), {
      target: { value: "2025-01-01" },
    });

    expect(
      await screen.findByText("The selected period cannot exceed 367 calendar days."),
    ).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("from=2025-01-01"))).toBe(
      false,
    );
  });
});
