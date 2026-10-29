import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { FinanceCorrections } from "./finance-corrections";

const studentId = "student-1";
const payment = {
  id: "payment-1",
  studentId,
  amount: "2500.00",
  method: "CASH",
  reference: "CASH-REC-17",
  receivedAt: "2026-10-24T10:15:00.000Z",
  receiptId: "receipt-1",
  allocatedAmount: "1000.00",
  allocationReversedAmount: "0.00",
  refundedAmount: "0.00",
  unappliedAmount: "1500.00",
};
const accountSummary = {
  accountId: "account-1",
  studentId,
  totalCharges: "2500.00",
  totalChargeReversals: "0.00",
  totalPayments: "1000.00",
  totalRefunds: "0.00",
  totalDebits: "0.00",
  totalCredits: "0.00",
  totalAllocated: "750.00",
  totalAllocationReversals: "0.00",
  outstandingCharges: "1750.00",
  unappliedCredit: "250.00",
  balanceDue: "1000.00",
  netBalance: "1000.00",
};

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: { id: "school-1", name: "Elimara Academy", permissions: [] as string[] },
  })),
}));
vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderCorrections(
  permissions: string[] = [
    "finance.payments.read",
    "finance.accounts.read",
    "finance.refunds.manage",
    "finance.adjustments.manage",
  ],
  {
    payments = [payment],
    paymentsError = null,
    paymentsPending = false,
  }: {
    payments?: Array<typeof payment>;
    paymentsError?: Error | null;
    paymentsPending?: boolean;
  } = {},
) {
  useAuthMock.mockReturnValue({
    school: { id: "school-1", name: "Elimara Academy", permissions },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FinanceCorrections
        canManageAdjustments={permissions.includes("finance.adjustments.manage")}
        canManageRefunds={permissions.includes("finance.refunds.manage")}
        canReadAccounts={permissions.includes("finance.accounts.read")}
        canReadPayments={permissions.includes("finance.payments.read")}
        onRetryPayments={vi.fn()}
        payments={payments}
        paymentsError={paymentsError}
        paymentsPending={paymentsPending}
        studentId={studentId}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  useAuthMock.mockReturnValue({
    school: {
      id: "school-1",
      name: "Elimara Academy",
      permissions: [
        "finance.payments.read",
        "finance.accounts.read",
        "finance.refunds.manage",
        "finance.adjustments.manage",
      ],
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname.endsWith("/finance/account")) {
      return Promise.resolve(jsonResponse(200, { data: accountSummary }));
    }
    return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
  });
});

describe("FinanceCorrections", () => {
  it("keeps refund and adjustment access independent and never submits without permission", () => {
    renderCorrections(["finance.refunds.manage", "finance.adjustments.manage"]);

    expect(screen.getByText(/finance\.payments\.read is required/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review refund" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review adjustment" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discloses unavailable individual history and approval status without fabricating records", () => {
    renderCorrections();

    expect(
      screen.getByText(
        /does not return an approval state or expose individual refund or adjustment history/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Formal approval workflows are not implemented/i)).toBeTruthy();
    expect(screen.queryByRole("table", { name: /refund|adjustment/i })).toBeNull();
  });

  it("displays the exact documented account balance and ledger totals from the API", async () => {
    renderCorrections();

    const accountMetrics = (await screen.findByText("Total charges")).closest("dl");
    expect(accountMetrics).not.toBeNull();
    expect(accountMetrics?.textContent).toContain("Total chargesKES 2,500.00");
    expect(accountMetrics?.textContent).toContain("Total paymentsKES 1,000.00");
    expect(accountMetrics?.textContent).toContain("Outstanding chargesKES 1,750.00");
    expect(accountMetrics?.textContent).toContain("Unapplied creditKES 250.00");
    expect(accountMetrics?.textContent).toContain("Balance dueKES 1,000.00");
    expect(accountMetrics?.textContent).toContain("Net balanceKES 1,000.00");
  });

  it("rejects a refund above the API-returned unapplied amount before confirmation", async () => {
    renderCorrections();
    fireEvent.change(await screen.findByLabelText("Refund amount (KES)"), {
      target: { value: "1500.01" },
    });

    fireEvent.change(screen.getByLabelText("Refund transaction reference"), {
      target: { value: "REF-01" },
    });
    fireEvent.change(screen.getByLabelText("Refund reason"), {
      target: { value: "Verified repayment" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));

    expect(
      await screen.findByText("Refund cannot exceed this payment's unapplied amount."),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Confirm refund" })).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("does not offer refunds from stale payments after a payment-list failure", async () => {
    renderCorrections(undefined, {
      payments: [payment],
      paymentsError: new Error("Payment list unavailable"),
    });

    expect(
      await screen.findByText("Payment records could not be loaded for refund selection."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Payment")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review refund" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("confirms and records a verified refund with idempotency and refreshed data", async () => {
    let body: unknown;
    let key = "";
    let accountRequestCount = 0;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/account")) {
        accountRequestCount += 1;
        return Promise.resolve(jsonResponse(200, { data: accountSummary }));
      }
      if (url.pathname.endsWith("/finance/payments/payment-1/refunds")) {
        body = JSON.parse(String(init?.body));
        key = new Headers(init?.headers).get("Idempotency-Key") ?? "";
        return Promise.resolve(
          jsonResponse(201, {
            data: { ...payment, refundedAmount: "100.00", unappliedAmount: "1400.00" },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderCorrections();

    fireEvent.change(await screen.findByLabelText("Refund amount (KES)"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Refund transaction reference"), {
      target: { value: "REF-100" },
    });
    fireEvent.change(screen.getByLabelText("Refund reason"), {
      target: { value: "Verified repayment" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    expect(await screen.findByRole("heading", { name: "Confirm refund" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirm and record refund" }));

    expect(await screen.findByText(/Refund was recorded/)).toBeTruthy();
    expect(body).toEqual({
      amount: "100.00",
      reference: "REF-100",
      reason: "Verified repayment",
    });
    expect(key).toMatch(/^[\x21-\x7e]{1,128}$/);
    await waitFor(() => expect(accountRequestCount).toBeGreaterThan(1));
    expect(screen.getByText(/The backend does not return an approval state/)).toBeTruthy();
  });

  it("shows a failed refund response and validation feedback without success messaging", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/account")) {
        return Promise.resolve(jsonResponse(200, { data: accountSummary }));
      }
      if (url.pathname.endsWith("/finance/payments/payment-1/refunds") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(422, {
            error: {
              code: "VALIDATION_FAILED",
              message: "Refund exceeds the remaining unapplied funds.",
              issues: [{ path: "amount", message: "Amount is no longer available." }],
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderCorrections();

    fireEvent.change(await screen.findByLabelText("Refund amount (KES)"), {
      target: { value: "100.00" },
    });
    fireEvent.change(screen.getByLabelText("Refund transaction reference"), {
      target: { value: "REF-100" },
    });
    fireEvent.change(screen.getByLabelText("Refund reason"), {
      target: { value: "Verified repayment" },
    });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Review refund" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and record refund" }));

    expect(await screen.findByText("Refund exceeds the remaining unapplied funds.")).toBeTruthy();
    expect(screen.getByText("amount: Amount is no longer available.")).toBeTruthy();
    expect(screen.queryByText(/Refund was recorded/)).toBeNull();
  });

  it("records an adjustment after confirmation using only the adjustment permission", async () => {
    let body: unknown;
    let key = "";
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/adjustments") && init?.method === "POST") {
        body = JSON.parse(String(init.body));
        key = new Headers(init.headers).get("Idempotency-Key") ?? "";
        return Promise.resolve(
          jsonResponse(201, {
            data: { ...accountSummary, totalCredits: "25.00", balanceDue: "975.00" },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderCorrections(["finance.adjustments.manage"]);

    fireEvent.change(await screen.findByLabelText("Adjustment direction"), {
      target: { value: "CREDIT" },
    });
    fireEvent.change(screen.getByLabelText("Adjustment amount (KES)"), {
      target: { value: "25.00" },
    });
    fireEvent.change(screen.getByLabelText("Adjustment reason"), {
      target: { value: "Approved account correction" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review adjustment" }));
    expect(await screen.findByRole("heading", { name: "Confirm account adjustment" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record adjustment" }));

    expect(await screen.findByText(/Credit adjustment recorded/)).toBeTruthy();
    expect(body).toEqual({
      direction: "CREDIT",
      amount: "25.00",
      reason: "Approved account correction",
    });
    expect(key).toMatch(/^[\x21-\x7e]{1,128}$/);
    expect(screen.getByText(/The backend does not return an approval state/)).toBeTruthy();
  });

  it("validates adjustment amount and reason before offering confirmation", async () => {
    renderCorrections(["finance.adjustments.manage"]);

    fireEvent.change(await screen.findByLabelText("Adjustment amount (KES)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review adjustment" }));

    expect(
      await screen.findByText("Enter a positive amount with up to two decimal places."),
    ).toBeTruthy();
    expect(screen.getByText("Enter the reason for this adjustment.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Confirm account adjustment" })).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("shows adjustment server denial without reporting success", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/adjustments") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(403, {
            error: { code: "FORBIDDEN", message: "Adjustment is not permitted." },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderCorrections(["finance.adjustments.manage"]);

    fireEvent.change(await screen.findByLabelText("Adjustment amount (KES)"), {
      target: { value: "25.00" },
    });
    fireEvent.change(screen.getByLabelText("Adjustment reason"), {
      target: { value: "Verified correction" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review adjustment" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and record adjustment" }));

    expect(
      await screen.findByText(
        "The server denied this finance operation. Adjustment is not permitted.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Credit adjustment recorded|Debit adjustment recorded/)).toBeNull();
  });
});
