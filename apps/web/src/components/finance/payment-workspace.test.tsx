import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { PaymentWorkspace } from "./payment-workspace";

const student = {
  id: "student-1",
  admissionNumber: "2026/001",
  givenName: "Amina",
  familyName: "Otieno",
};

const payment = {
  id: "payment-1",
  studentId: student.id,
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

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: { id: "school-1", name: "Elimara Academy", permissions: [] as string[] },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderWorkspace(
  permissions = [
    "students.profile.read",
    "finance.payments.read",
    "finance.payments.record",
    "finance.accounts.read",
    "finance.adjustments.manage",
  ],
) {
  useAuthMock.mockReturnValue({
    school: { id: "school-1", name: "Elimara Academy", permissions },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentWorkspace
        canManageAllocations={permissions.includes("finance.adjustments.manage")}
        canManageAdjustments={permissions.includes("finance.adjustments.manage")}
        canManageRefunds={permissions.includes("finance.refunds.manage")}
        canReadAccounts={permissions.includes("finance.accounts.read")}
        canReadPayments={permissions.includes("finance.payments.read")}
        canReconcilePayments={permissions.includes("finance.payments.reconcile")}
        canReadStudents={permissions.includes("students.profile.read")}
        canRecordPayments={permissions.includes("finance.payments.record")}
      />
    </QueryClientProvider>,
  );
}

function studentListResponse() {
  return jsonResponse(200, {
    data: [student],
    meta: { limit: 25, offset: 0, total: 1 },
  });
}

function paymentListResponse(items = [payment]) {
  return jsonResponse(200, {
    data: items,
    meta: { limit: 25, offset: 0, total: items.length },
  });
}

function chargeListResponse() {
  return jsonResponse(200, {
    data: [
      {
        id: "charge-1",
        studentId: student.id,
        structureName: "Term 1 fees",
        totalAmount: "2000.00",
        allocatedAmount: "0.00",
        allocationReversedAmount: "0.00",
        outstandingAmount: "1400.00",
        reversed: false,
        createdAt: "2026-10-01T09:00:00.000Z",
      },
    ],
    meta: { limit: 25, offset: 0, total: 1 },
  });
}

async function openPaymentForm() {
  const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
  await waitFor(() => expect(studentSelect.disabled).toBe(false));
  fireEvent.change(studentSelect, {
    target: { value: student.id },
  });
  const button = await screen.findByRole<HTMLButtonElement>("button", {
    name: "Record manual payment",
  });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  return button;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
    if (url.pathname.endsWith("/finance/account")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            accountId: "account-1",
            studentId: student.id,
            totalRefunds: "0.00",
            totalDebits: "0.00",
            totalCredits: "0.00",
            balanceDue: "1000.00",
            netBalance: "1000.00",
            outstandingCharges: "1000.00",
            unappliedCredit: "0.00",
          },
        }),
      );
    }
    if (url.pathname.endsWith("/finance/payments")) return Promise.resolve(paymentListResponse());
    if (url.pathname.endsWith("/finance/charges")) return Promise.resolve(chargeListResponse());
    return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
  });
});

describe("PaymentWorkspace", () => {
  it("lists only returned student payment details and does not invent a status", async () => {
    renderWorkspace();
    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, {
      target: { value: student.id },
    });

    expect(await screen.findByText("KES 2,500.00")).toBeTruthy();
    expect(screen.getByText("CASH-REC-17")).toBeTruthy();
    expect(screen.getByText("KES 1,500.00")).toBeTruthy();
    expect(screen.getByText("receipt-1")).toBeTruthy();
    expect(screen.getAllByText("Amina Otieno").length).toBeGreaterThan(0);
    expect(screen.getByText("Recorded entry; no settlement status returned")).toBeTruthy();
    expect(
      screen.getByText(/no payment-date, status, or reference filter is supported/i),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/schools\/school-1\/students\/student-1\/finance\/payments\?limit=25&offset=0/,
      ),
      expect.any(Object),
    );
  });

  it("uses only the student endpoint's supported name and admission-number search", async () => {
    renderWorkspace();

    const search = await screen.findByLabelText("Search students");
    fireEvent.change(search, { target: { value: "Amina" } });

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input]) => {
        const url = new URL(String(input), window.location.origin);
        return (
          url.pathname.endsWith("/schools/school-1/students") &&
          url.searchParams.get("q") === "Amina"
        );
      });
      expect(request).toBeTruthy();
      const url = new URL(String(request?.[0]), window.location.origin);
      expect(url.searchParams.get("q")).toBe("Amina");
      expect(url.searchParams.has("status")).toBe(false);
    });
  });

  it("uses the student endpoint's supported status filter", async () => {
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText("Student status"), {
      target: { value: "WITHDRAWN" },
    });

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([input]) => {
        const url = new URL(String(input), window.location.origin);
        return (
          url.pathname.endsWith("/schools/school-1/students") &&
          url.searchParams.get("status") === "WITHDRAWN"
        );
      });
      expect(request).toBeTruthy();
    });
  });

  it("records an independently verified manual payment with an idempotency key", async () => {
    let submittedBody: unknown;
    const submittedIdempotencyKey = { current: "" };
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/payments") && init?.method === "POST") {
        submittedBody = JSON.parse(String(init.body));
        submittedIdempotencyKey.current = new Headers(init.headers).get("Idempotency-Key") ?? "";
        return Promise.resolve(jsonResponse(201, { data: payment }));
      }
      if (url.pathname.endsWith("/finance/payments")) {
        return Promise.resolve(paymentListResponse());
      }
      if (url.pathname.endsWith("/finance/charges")) return Promise.resolve(chargeListResponse());
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    const recordButton = await openPaymentForm();
    await waitFor(() => expect(recordButton.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.change(await screen.findByLabelText("Amount (KES)"), {
      target: { value: "2500.00" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "CASH" },
    });
    fireEvent.change(screen.getByLabelText("Verified reference (optional)"), {
      target: { value: "CASH-REC-17" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review payment record" }));

    expect(await screen.findByRole("heading", { name: "Confirm payment record" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).includes("/finance/payments") && init?.method === "POST",
      ),
    ).toBe(false);
    const confirmButton = screen.getByRole("button", { name: "Confirm and record payment" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(
      await screen.findByText(
        /was saved\. This records the staff attestation and does not independently verify receipt/i,
      ),
    ).toBeTruthy();
    expect(submittedBody).toEqual({
      amount: "2500.00",
      method: "CASH",
      reference: "CASH-REC-17",
    });
    expect(submittedIdempotencyKey.current).toMatch(/^[\x21-\x7e]{1,128}$/);
    expect(JSON.stringify(submittedBody)).not.toContain("receivedAt");
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).includes("/finance/payments") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => String(input).includes("/finance/payments") && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("rejects invalid amounts and missing verification before sending a payment", async () => {
    renderWorkspace();

    await openPaymentForm();
    fireEvent.change(await screen.findByLabelText("Amount (KES)"), {
      target: { value: "0.001" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "CASH" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review payment record" }));

    expect(
      await screen.findByText("Enter a positive amount with up to two decimal places."),
    ).toBeTruthy();
    expect(screen.getByText("Confirm that receipt was independently verified.")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).includes("/finance/payments") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("shows server-side failures without presenting a successful payment state", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/payments") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(403, {
            error: { code: "FORBIDDEN", message: "Payment recording is not permitted." },
          }),
        );
      }
      if (url.pathname.endsWith("/finance/payments"))
        return Promise.resolve(paymentListResponse([]));
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    await openPaymentForm();
    fireEvent.change(await screen.findByLabelText("Amount (KES)"), {
      target: { value: "2500.00" },
    });
    fireEvent.change(screen.getByLabelText("Payment method"), {
      target: { value: "CASH" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review payment record" }));
    expect(await screen.findByRole("heading", { name: "Confirm payment record" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record payment" }));

    expect(
      await screen.findByText(
        "The server denied this finance operation. Payment recording is not permitted.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/was saved\./i)).toBeNull();
  });

  it("allocates a payment to an outstanding charge and refreshes school finance data", async () => {
    let allocationBody: unknown;
    let allocationKey: string | null = null;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/charges")) return Promise.resolve(chargeListResponse());
      if (
        url.pathname.endsWith("/finance/payments/payment-1/allocations") &&
        init?.method === "POST"
      ) {
        allocationBody = JSON.parse(String(init.body));
        allocationKey = new Headers(init.headers).get("Idempotency-Key");
        return Promise.resolve(
          jsonResponse(201, {
            data: {
              id: "allocation-1",
              paymentId: "payment-1",
              chargeId: "charge-1",
              amount: "1000.00",
              reversedAmount: "0.00",
              createdAt: "2026-10-24T11:00:00.000Z",
            },
          }),
        );
      }
      if (url.pathname.endsWith("/finance/payments")) return Promise.resolve(paymentListResponse());
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, {
      target: { value: student.id },
    });
    expect(await screen.findByText("KES 2,500.00")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Allocate" }));
    fireEvent.change(await screen.findByLabelText("Outstanding charge"), {
      target: { value: "charge-1" },
    });
    fireEvent.change(screen.getByLabelText("Allocation amount (KES)"), {
      target: { value: "1000.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review allocation" }));
    expect(await screen.findByRole("heading", { name: "Confirm payment allocation" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes("/finance/payments/payment-1/allocations") &&
          init?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save allocation" }));

    expect(
      await screen.findByText(/Allocation allocation-1 was recorded for KES 1,000.00/),
    ).toBeTruthy();
    expect(allocationBody).toEqual({ chargeId: "charge-1", amount: "1000.00" });
    expect(allocationKey).toMatch(/^[\x21-\x7e]{1,128}$/);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).includes("/finance/payments?"))
          .length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("keeps charge lookup failures out of the empty-charge and allocation states", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/charges")) {
        return Promise.resolve(
          jsonResponse(404, { error: { code: "NOT_FOUND", message: "Student not found." } }),
        );
      }
      if (url.pathname.endsWith("/finance/payments")) return Promise.resolve(paymentListResponse());
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, { target: { value: student.id } });
    expect(await screen.findByText("KES 2,500.00")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Allocate" }));

    expect(await screen.findByText("Student charges could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("No available charges")).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Review allocation" }).disabled,
    ).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("prevents allocation amounts above available funds and shows allocation failures", async () => {
    let allowFailure = false;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/charges")) return Promise.resolve(chargeListResponse());
      if (
        url.pathname.endsWith("/finance/payments/payment-1/allocations") &&
        init?.method === "POST"
      ) {
        return allowFailure
          ? Promise.resolve(
              jsonResponse(409, {
                error: { code: "CONFLICT", message: "Payment availability changed." },
              }),
            )
          : Promise.resolve(
              jsonResponse(201, {
                data: {
                  id: "allocation-1",
                  paymentId: "payment-1",
                  chargeId: "charge-1",
                  amount: "1000.00",
                  reversedAmount: "0.00",
                  createdAt: "2026-10-24T11:00:00.000Z",
                },
              }),
            );
      }
      if (url.pathname.endsWith("/finance/payments")) return Promise.resolve(paymentListResponse());
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, {
      target: { value: student.id },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Allocate" }));
    fireEvent.change(await screen.findByLabelText("Outstanding charge"), {
      target: { value: "charge-1" },
    });
    fireEvent.change(screen.getByLabelText("Allocation amount (KES)"), {
      target: { value: "1500.01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review allocation" }));
    expect(
      await screen.findByText("Amount exceeds the selected charge's outstanding amount."),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes("/finance/payments/payment-1/allocations") &&
          init?.method === "POST",
      ),
    ).toBe(false);

    fireEvent.change(screen.getByLabelText("Allocation amount (KES)"), {
      target: { value: "1000.00" },
    });
    allowFailure = true;
    fireEvent.click(screen.getByRole("button", { name: "Review allocation" }));
    expect(await screen.findByRole("heading", { name: "Confirm payment allocation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save allocation" }));
    expect(await screen.findByText("Payment availability changed.")).toBeTruthy();
    expect(screen.queryByText(/Allocation allocation-1 was recorded/)).toBeNull();
  });

  it("does not expose actions when the required permissions or student scope are missing", () => {
    renderWorkspace(["finance.payments.record"]);

    expect(screen.getByText("Student selection access unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record manual payment" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not show allocation controls without the server-returned adjustment permission", async () => {
    renderWorkspace(["students.profile.read", "finance.payments.read", "finance.accounts.read"]);

    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, {
      target: { value: student.id },
    });
    expect(await screen.findByText("KES 2,500.00")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Allocate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record manual payment" })).toBeNull();
  });

  it("shows a clear authorization state when the server denies payment history", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/payments")) {
        return Promise.resolve(
          jsonResponse(403, {
            error: { code: "FORBIDDEN", message: "Payment history is not permitted." },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, {
      target: { value: student.id },
    });

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("No payment records")).toBeNull();
  });

  it("does not interpret a missing or out-of-scope payment response as an empty history", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/students")) return Promise.resolve(studentListResponse());
      if (url.pathname.endsWith("/finance/payments")) {
        return Promise.resolve(
          jsonResponse(404, {
            error: { code: "NOT_FOUND", message: "The student account was not found." },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    renderWorkspace();

    const studentSelect = await screen.findByLabelText<HTMLSelectElement>("Student account");
    await waitFor(() => expect(studentSelect.disabled).toBe(false));
    fireEvent.change(studentSelect, { target: { value: student.id } });

    expect(await screen.findByText("Payment records could not be loaded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText("No payment records")).toBeNull();
  });
});
