import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { ReconciliationWorkspace } from "./reconciliation-workspace";

const payment = {
  id: "payment-1",
  amount: "2500.00",
  receivedAt: "2026-10-24T10:15:00.000Z",
  reference: "CASH-REC-17",
};

const exception = {
  id: "reconciliation-1",
  paymentId: payment.id,
  paymentAmount: "2500.00",
  statementAmount: "2400.00",
  statementReference: "BANK-REC-1",
  outcome: "EXCEPTION" as const,
  note: "Statement amount differs.",
  createdAt: "2026-10-24T11:00:00.000Z",
};

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: { id: "school-1", name: "Elimara Academy", permissions: [] as string[] },
  })),
}));
vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderReconciliation({
  canReadPayments = true,
  canReconcilePayments = true,
  payments = [payment],
  paymentsError = null,
  paymentsPending = false,
  onRetryPayments = vi.fn(),
}: {
  canReadPayments?: boolean;
  canReconcilePayments?: boolean;
  payments?: (typeof payment)[];
  paymentsError?: Error | null;
  paymentsPending?: boolean;
  onRetryPayments?: () => void;
} = {}) {
  useAuthMock.mockReturnValue({
    school: { id: "school-1", name: "Elimara Academy", permissions: [] },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReconciliationWorkspace
        canReadPayments={canReadPayments}
        canReconcilePayments={canReconcilePayments}
        payments={payments}
        paymentsError={paymentsError}
        paymentsPending={paymentsPending}
        onRetryPayments={onRetryPayments}
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
    school: { id: "school-1", name: "Elimara Academy", permissions: [] },
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname.endsWith("/finance/reconciliation/exceptions")) {
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

describe("ReconciliationWorkspace", () => {
  it("does not fetch or display reconciliation data without its permission", () => {
    renderReconciliation({ canReconcilePayments: false });

    expect(screen.queryByRole("heading", { name: "Payment reconciliation" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists only historical exception observations using supported pagination", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/reconciliation/exceptions")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [exception],
            meta: { limit: 25, offset: 0, total: 1 },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderReconciliation();

    expect(await screen.findByText("EXCEPTION")).toBeTruthy();
    expect(screen.getByText("KES 2,500.00")).toBeTruthy();
    expect(screen.getByText("KES 2,400.00")).toBeTruthy();
    expect(screen.getByText("Statement amount differs.")).toBeTruthy();
    expect(screen.getByText(/Historical exception observations/i)).toBeTruthy();
    expect(screen.getByText(/does not indicate each payment's latest status/i)).toBeTruthy();
    const request = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/finance/reconciliation/exceptions"),
    );
    expect(request).toBeTruthy();
    const url = new URL(String(request?.[0]), window.location.origin);
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.has("status")).toBe(false);
  });

  it("does not offer a reconciliation form without payment-list permission", async () => {
    renderReconciliation({ canReadPayments: false });

    expect(await screen.findByText(/finance\.payments\.read is not granted/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review observation" })).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("does not offer reconciliation from stale payments after a payment-list failure", async () => {
    const onRetryPayments = vi.fn();
    renderReconciliation({
      payments: [payment],
      paymentsError: new Error("Payment list unavailable"),
      onRetryPayments,
    });

    expect(
      await screen.findByText("Payment records could not be loaded for reconciliation."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review observation" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryPayments).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("validates the statement amount and required note before confirmation", async () => {
    renderReconciliation();

    fireEvent.change(await screen.findByLabelText("Statement amount (KES)"), {
      target: { value: "2500.001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review observation" }));

    expect(await screen.findByText("Enter an amount with up to two decimal places.")).toBeTruthy();
    expect(screen.getByText("Enter a reconciliation note.")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Confirm reconciliation observation" }),
    ).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("confirms the observation, shows the API outcome, and refreshes exception data", async () => {
    const result = {
      id: "reconciliation-2",
      paymentId: payment.id,
      paymentAmount: "2500.00",
      statementAmount: "2500.00",
      statementReference: "BANK-REC-2",
      outcome: "MATCHED",
      note: "Verified against statement.",
      createdAt: "2026-10-24T12:00:00.000Z",
    };
    let submittedBody: unknown;
    let submittedIdempotencyKey: string | null = null;
    let exceptionRequestCount = 0;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/finance/reconciliation/exceptions")) {
        exceptionRequestCount += 1;
        return Promise.resolve(
          jsonResponse(200, {
            data: [exception],
            meta: { limit: 25, offset: 0, total: 1 },
          }),
        );
      }
      if (
        url.pathname.endsWith("/finance/payments/payment-1/reconciliation") &&
        init?.method === "POST"
      ) {
        submittedBody = JSON.parse(String(init.body));
        submittedIdempotencyKey = new Headers(init.headers).get("Idempotency-Key");
        return Promise.resolve(jsonResponse(201, { data: result }));
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderReconciliation();

    fireEvent.change(await screen.findByLabelText("Statement amount (KES)"), {
      target: { value: "2500.00" },
    });
    fireEvent.change(screen.getByLabelText("Statement reference (optional)"), {
      target: { value: "BANK-REC-2" },
    });
    fireEvent.change(screen.getByLabelText("Reconciliation note"), {
      target: { value: "Verified against statement." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review observation" }));
    expect(
      await screen.findByRole("heading", { name: "Confirm reconciliation observation" }),
    ).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirm and record observation" }));

    expect(await screen.findByText("Reconciliation observation recorded: MATCHED.")).toBeTruthy();
    expect(submittedBody).toEqual({
      statementAmount: "2500.00",
      statementReference: "BANK-REC-2",
      note: "Verified against statement.",
    });
    expect(submittedIdempotencyKey).toMatch(/^[\x21-\x7e]{1,128}$/);
    await waitFor(() => expect(exceptionRequestCount).toBeGreaterThan(1));
  });

  it("shows server failures without claiming that an observation was recorded", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/finance/payments/payment-1/reconciliation") &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          jsonResponse(409, {
            error: { code: "CONFLICT", message: "The payment is no longer available." },
          }),
        );
      }
      if (url.pathname.endsWith("/finance/reconciliation/exceptions")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 25, offset: 0, total: 0 },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderReconciliation();

    fireEvent.change(await screen.findByLabelText("Statement amount (KES)"), {
      target: { value: "2500.00" },
    });
    fireEvent.change(screen.getByLabelText("Reconciliation note"), {
      target: { value: "Checked statement." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review observation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and record observation" }));

    expect(await screen.findByText("The payment is no longer available.")).toBeTruthy();
    expect(screen.queryByText(/Reconciliation observation recorded:/)).toBeNull();
  });

  it("prevents duplicate submissions while the API request is pending", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/finance/payments/payment-1/reconciliation") &&
        init?.method === "POST"
      ) {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      if (url.pathname.endsWith("/finance/reconciliation/exceptions")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 25, offset: 0, total: 0 },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderReconciliation();

    fireEvent.change(await screen.findByLabelText("Statement amount (KES)"), {
      target: { value: "2500.00" },
    });
    fireEvent.change(screen.getByLabelText("Reconciliation note"), {
      target: { value: "Checked statement." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review observation" }));
    const confirmButton = await screen.findByRole("button", {
      name: "Confirm and record observation",
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    });
    resolvePost?.(
      jsonResponse(201, {
        data: {
          ...exception,
          outcome: "MATCHED",
          statementAmount: payment.amount,
        },
      }),
    );
    expect(await screen.findByText("Reconciliation observation recorded: MATCHED.")).toBeTruthy();
  });
});
