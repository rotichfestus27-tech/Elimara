import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { useSchoolData } from "@/lib/api/school-data";
import { formatKes } from "@/lib/finance-format";

type FinancePayment = {
  id: string;
  studentId: string;
  amount: string;
  method: string;
  reference: string | null;
  receivedAt: string;
  receiptId: string;
  allocatedAmount: string;
  allocationReversedAmount: string;
  refundedAmount: string;
  unappliedAmount: string;
};

type AccountSummary = {
  accountId: string;
  studentId: string;
  totalCharges: string;
  totalChargeReversals: string;
  totalPayments: string;
  totalRefunds: string;
  totalDebits: string;
  totalCredits: string;
  totalAllocated: string;
  totalAllocationReversals: string;
  outstandingCharges: string;
  unappliedCredit: string;
  balanceDue: string;
  netBalance: string;
};

type RefundInput = {
  amount: string;
  reference: string;
  reason: string;
};

type AdjustmentInput = {
  direction: "DEBIT" | "CREDIT";
  amount: string;
  reason: string;
};

type CorrectionConfirmation<T> = {
  fingerprint: string;
  input: T;
};

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function FinanceCorrections({
  studentId,
  payments,
  paymentsPending,
  paymentsError,
  onRetryPayments,
  canReadPayments,
  canReadAccounts,
  canManageRefunds,
  canManageAdjustments,
}: {
  studentId: string;
  payments: FinancePayment[];
  paymentsPending: boolean;
  paymentsError: Error | null;
  onRetryPayments: () => void;
  canReadPayments: boolean;
  canReadAccounts: boolean;
  canManageRefunds: boolean;
  canManageAdjustments: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundVerification, setRefundVerification] = useState(false);
  const [refundErrors, setRefundErrors] = useState<Record<string, string>>({});
  const [refundConfirmation, setRefundConfirmation] =
    useState<CorrectionConfirmation<RefundInput> | null>(null);
  const [refundError, setRefundError] = useState<Error | null>(null);
  const [refundMessage, setRefundMessage] = useState("");
  const [savingRefund, setSavingRefund] = useState(false);
  const refundSavingRef = useRef(false);
  const refundIdempotencyKeys = useRef(new Map<string, string>());
  const refundFormRef = useRef<HTMLFormElement>(null);

  const [adjustmentDirection, setAdjustmentDirection] =
    useState<AdjustmentInput["direction"]>("DEBIT");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentErrors, setAdjustmentErrors] = useState<Record<string, string>>({});
  const [adjustmentConfirmation, setAdjustmentConfirmation] =
    useState<CorrectionConfirmation<AdjustmentInput> | null>(null);
  const [adjustmentError, setAdjustmentError] = useState<Error | null>(null);
  const [adjustmentMessage, setAdjustmentMessage] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const adjustmentSavingRef = useRef(false);
  const adjustmentIdempotencyKeys = useRef(new Map<string, string>());
  const adjustmentFormRef = useRef<HTMLFormElement>(null);

  const selectedPayment = payments.find(({ id }) => id === selectedPaymentId);
  const canSubmitRefund = canManageRefunds && canReadPayments;
  const canSubmitAdjustment = canManageAdjustments;
  const accountQuery = useSchoolData<{ data: AccountSummary }>(
    `/students/${encodeURIComponent(studentId)}/finance/account`,
    {},
    { enabled: canReadAccounts && Boolean(studentId) },
  );

  useEffect(() => {
    if (Object.keys(refundErrors).length > 0) {
      refundFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [refundErrors]);

  useEffect(() => {
    if (Object.keys(adjustmentErrors).length > 0) {
      adjustmentFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [adjustmentErrors]);

  useEffect(() => {
    if (!payments.some(({ id }) => id === selectedPaymentId)) {
      setSelectedPaymentId(payments[0]?.id ?? "");
    }
  }, [payments, selectedPaymentId]);

  function handleRefundReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canSubmitRefund ||
      !selectedPayment ||
      paymentsPending ||
      paymentsError ||
      refundSavingRef.current
    )
      return;
    const errors: Record<string, string> = {};
    const input: RefundInput = {
      amount: refundAmount.trim(),
      reference: refundReference.trim(),
      reason: refundReason.trim(),
    };
    if (!isPositiveAmount(input.amount)) {
      errors.amount = "Enter a positive amount with up to two decimal places.";
    } else if (toMinorUnits(input.amount) > toMinorUnits(selectedPayment.unappliedAmount)) {
      errors.amount = "Refund cannot exceed this payment's unapplied amount.";
    }
    if (!input.reference) errors.reference = "Enter the refund transaction reference.";
    else if (input.reference.length > 120)
      errors.reference = "Reference must be 120 characters or fewer.";
    if (!input.reason) errors.reason = "Enter the reason for this refund.";
    else if (input.reason.length > 500) errors.reason = "Reason must be 500 characters or fewer.";
    if (!refundVerification) {
      errors.verification = "Confirm that the refund was independently verified.";
    }
    setRefundErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setRefundError(null);
    setRefundConfirmation({ fingerprint: JSON.stringify([selectedPayment.id, input]), input });
  }

  async function confirmRefund() {
    if (
      refundSavingRef.current ||
      !school ||
      !selectedPayment ||
      !refundConfirmation ||
      !canSubmitRefund ||
      paymentsPending ||
      paymentsError
    )
      return;
    const { input, fingerprint } = refundConfirmation;
    const idempotencyKey = getIdempotencyKey(refundIdempotencyKeys.current, fingerprint);
    refundSavingRef.current = true;
    setSavingRefund(true);
    setRefundError(null);
    try {
      const response = await apiRequest<{ data: FinancePayment }>(
        `/schools/${encodeURIComponent(school.id)}/finance/payments/${encodeURIComponent(selectedPayment.id)}/refunds`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: input,
        },
      );
      refundIdempotencyKeys.current.clear();
      setRefundConfirmation(null);
      setRefundAmount("");
      setRefundReference("");
      setRefundReason("");
      setRefundVerification(false);
      setRefundErrors({});
      setRefundMessage(
        `Refund was recorded. The payment now reports ${formatKes(response.data.refundedAmount)} refunded and ${formatKes(response.data.unappliedAmount)} unapplied.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
    } catch (error) {
      setRefundError(asError(error, "The refund could not be recorded."));
    } finally {
      refundSavingRef.current = false;
      setSavingRefund(false);
    }
  }

  function handleAdjustmentReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitAdjustment || adjustmentSavingRef.current) return;
    const errors: Record<string, string> = {};
    const input: AdjustmentInput = {
      direction: adjustmentDirection,
      amount: adjustmentAmount.trim(),
      reason: adjustmentReason.trim(),
    };
    if (!isPositiveAmount(input.amount)) {
      errors.amount = "Enter a positive amount with up to two decimal places.";
    }
    if (!input.reason) errors.reason = "Enter the reason for this adjustment.";
    else if (input.reason.length > 500) errors.reason = "Reason must be 500 characters or fewer.";
    setAdjustmentErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAdjustmentError(null);
    setAdjustmentConfirmation({
      fingerprint: JSON.stringify([studentId, input]),
      input,
    });
  }

  async function confirmAdjustment() {
    if (adjustmentSavingRef.current || !school || !adjustmentConfirmation || !canSubmitAdjustment)
      return;
    const { input, fingerprint } = adjustmentConfirmation;
    const idempotencyKey = getIdempotencyKey(adjustmentIdempotencyKeys.current, fingerprint);
    adjustmentSavingRef.current = true;
    setSavingAdjustment(true);
    setAdjustmentError(null);
    try {
      const response = await apiRequest<{ data: AccountSummary }>(
        `/schools/${encodeURIComponent(school.id)}/students/${encodeURIComponent(studentId)}/finance/adjustments`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: input,
        },
      );
      adjustmentIdempotencyKeys.current.clear();
      setAdjustmentConfirmation(null);
      setAdjustmentAmount("");
      setAdjustmentReason("");
      setAdjustmentErrors({});
      setAdjustmentMessage(
        `${input.direction === "DEBIT" ? "Debit" : "Credit"} adjustment recorded. Current balance due: ${formatKes(response.data.balanceDue)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
    } catch (error) {
      setAdjustmentError(asError(error, "The financial adjustment could not be recorded."));
    } finally {
      adjustmentSavingRef.current = false;
      setSavingAdjustment(false);
    }
  }

  if (!canManageRefunds && !canManageAdjustments) return null;

  return (
    <section aria-labelledby="finance-corrections-title" className="space-y-4 border-t pt-5">
      <div>
        <h3 className="text-base font-semibold" id="finance-corrections-title">
          Refunds and adjustments
        </h3>
        <p className="text-sm text-muted-foreground">
          These operations append financial records; they do not delete or overwrite original
          entries. The backend does not return an approval state or expose individual refund or
          adjustment history; the available responses provide payment-level refund totals and
          account-level totals only. Formal approval workflows are not implemented.
        </p>
      </div>

      {canReadAccounts ? (
        accountQuery.isPending ? (
          <LoadingState className="min-h-20" message="Loading current account totals..." />
        ) : accountQuery.isError ? (
          isNotFound(accountQuery.error) ? (
            <EmptyState
              className="min-h-20 justify-center"
              description="No account summary is available for this student yet."
              title="No account summary"
            />
          ) : (
            <RequestFailure
              error={accountQuery.error}
              message="Current account totals could not be loaded."
              onRetry={() => void accountQuery.refetch()}
            />
          )
        ) : (
          <dl
            aria-label="Student account balances and totals"
            className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2 lg:grid-cols-4"
          >
            <Metric label="Total charges" value={accountQuery.data.data.totalCharges} />
            <Metric label="Charge reversals" value={accountQuery.data.data.totalChargeReversals} />
            <Metric label="Total payments" value={accountQuery.data.data.totalPayments} />
            <Metric label="Total refunds" value={accountQuery.data.data.totalRefunds} />
            <Metric label="Total debits" value={accountQuery.data.data.totalDebits} />
            <Metric label="Total credits" value={accountQuery.data.data.totalCredits} />
            <Metric label="Total allocated" value={accountQuery.data.data.totalAllocated} />
            <Metric
              label="Allocation reversals"
              value={accountQuery.data.data.totalAllocationReversals}
            />
            <Metric label="Outstanding charges" value={accountQuery.data.data.outstandingCharges} />
            <Metric label="Unapplied credit" value={accountQuery.data.data.unappliedCredit} />
            <Metric label="Balance due" value={accountQuery.data.data.balanceDue} />
            <Metric label="Net balance" value={accountQuery.data.data.netBalance} />
          </dl>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          Account totals require finance.accounts.read. No adjustment history-list endpoint is
          available.
        </p>
      )}

      {canManageRefunds && (
        <section aria-labelledby="refund-form-title" className="space-y-4 rounded-md border p-4">
          <div>
            <h4 className="font-medium" id="refund-form-title">
              Record verified refund
            </h4>
            <p className="text-sm text-muted-foreground">
              A refund can use only funds currently unapplied on the selected payment. Verify the
              refund independently before recording it.
            </p>
          </div>
          {!canReadPayments ? (
            <UnauthorizedState
              description="Refund management does not grant payment-list access. finance.payments.read is required to select the payment."
              title="Payment selection access unavailable"
            />
          ) : paymentsPending ? (
            <LoadingState className="min-h-20" message="Loading payment records..." />
          ) : paymentsError ? (
            paymentsError instanceof ApiClientError && paymentsError.status === 403 ? (
              <UnauthorizedState
                description="The server denied access to payment records in the current school context."
                title="Payment access denied"
              />
            ) : (
              <ErrorState
                message="Payment records could not be loaded for refund selection."
                onRetry={onRetryPayments}
              />
            )
          ) : payments.length === 0 ? (
            <EmptyState
              className="min-h-20 justify-center"
              description="No payment record is available on the current page to select for refund."
              title="No selectable payment"
            />
          ) : (
            <>
              {refundMessage && (
                <p className="text-sm" role="status">
                  {refundMessage}
                </p>
              )}
              {refundError && <ApiErrorMessage error={refundError} />}
              {refundConfirmation ? (
                <section
                  aria-labelledby="refund-confirmation-title"
                  className="space-y-3 rounded-md border bg-muted/20 p-4"
                >
                  <h5 className="font-medium" id="refund-confirmation-title">
                    Confirm refund
                  </h5>
                  <p className="text-sm">
                    Record a refund of <strong>{formatKes(refundConfirmation.input.amount)}</strong>{" "}
                    for payment <code>{selectedPayment?.id}</code>, reference{" "}
                    <strong>{refundConfirmation.input.reference}</strong>.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Reason: {refundConfirmation.input.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The API records the staff-verified refund; it does not execute a transfer or
                    return an approval state.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={savingRefund}
                      onClick={() => setRefundConfirmation(null)}
                      type="button"
                      variant="outline"
                    >
                      Back to form
                    </Button>
                    <Button
                      disabled={savingRefund || !canSubmitRefund}
                      onClick={() => void confirmRefund()}
                      type="button"
                    >
                      {savingRefund ? "Recording refund..." : "Confirm and record refund"}
                    </Button>
                  </div>
                </section>
              ) : (
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  noValidate
                  onSubmit={handleRefundReview}
                  ref={refundFormRef}
                >
                  <FormField id="refund-payment" label="Payment">
                    <select
                      className={controlClassName}
                      id="refund-payment"
                      onChange={(event) => {
                        setSelectedPaymentId(event.target.value);
                        setRefundErrors({});
                        setRefundMessage("");
                      }}
                      value={selectedPaymentId}
                    >
                      {payments.map((payment) => (
                        <option key={payment.id} value={payment.id}>
                          {payment.id} — received {formatKes(payment.amount)}; unapplied{" "}
                          {formatKes(payment.unappliedAmount)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField id="refund-amount" label="Refund amount (KES)">
                    <input
                      aria-describedby={refundErrors.amount ? "refund-amount-error" : undefined}
                      aria-invalid={Boolean(refundErrors.amount)}
                      className={controlClassName}
                      id="refund-amount"
                      inputMode="decimal"
                      onChange={(event) => setRefundAmount(event.target.value)}
                      required
                      value={refundAmount}
                    />
                    <FieldError id="refund-amount-error" message={refundErrors.amount} />
                  </FormField>
                  <FormField id="refund-reference" label="Refund transaction reference">
                    <input
                      aria-describedby={
                        refundErrors.reference ? "refund-reference-error" : undefined
                      }
                      aria-invalid={Boolean(refundErrors.reference)}
                      className={controlClassName}
                      id="refund-reference"
                      maxLength={120}
                      onChange={(event) => setRefundReference(event.target.value)}
                      required
                      value={refundReference}
                    />
                    <FieldError id="refund-reference-error" message={refundErrors.reference} />
                  </FormField>
                  <FormField id="refund-reason" label="Refund reason">
                    <textarea
                      aria-describedby={refundErrors.reason ? "refund-reason-error" : undefined}
                      aria-invalid={Boolean(refundErrors.reason)}
                      className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      id="refund-reason"
                      maxLength={500}
                      onChange={(event) => setRefundReason(event.target.value)}
                      required
                      value={refundReason}
                    />
                    <FieldError id="refund-reason-error" message={refundErrors.reason} />
                  </FormField>
                  <label className="flex items-start gap-3 rounded-md border p-3 text-sm sm:col-span-2">
                    <input
                      aria-describedby={
                        refundErrors.verification ? "refund-verification-error" : undefined
                      }
                      aria-invalid={Boolean(refundErrors.verification)}
                      checked={refundVerification}
                      className="mt-1 size-4 shrink-0"
                      onChange={(event) => setRefundVerification(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      I independently verified this refund through the school's approved process.
                      {refundErrors.verification && (
                        <span
                          className="mt-1 block text-xs text-destructive"
                          id="refund-verification-error"
                        >
                          {refundErrors.verification}
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="sm:col-span-2">
                    <Button
                      disabled={!canSubmitRefund || !selectedPayment}
                      type="submit"
                      variant="outline"
                    >
                      Review refund
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      )}

      {canManageAdjustments && (
        <section
          aria-labelledby="adjustment-form-title"
          className="space-y-4 rounded-md border p-4"
        >
          <div>
            <h4 className="font-medium" id="adjustment-form-title">
              Record account adjustment
            </h4>
            <p className="text-sm text-muted-foreground">
              The API records an attributable debit or credit with a required reason. It does not
              define amount caps, an approval workflow, or a balance correction shortcut.
            </p>
          </div>
          {adjustmentMessage && (
            <p className="text-sm" role="status">
              {adjustmentMessage}
            </p>
          )}
          {adjustmentError && <ApiErrorMessage error={adjustmentError} />}
          {adjustmentConfirmation ? (
            <section
              aria-labelledby="adjustment-confirmation-title"
              className="space-y-3 rounded-md border bg-muted/20 p-4"
            >
              <h5 className="font-medium" id="adjustment-confirmation-title">
                Confirm account adjustment
              </h5>
              <p className="text-sm">
                Record a {adjustmentConfirmation.input.direction.toLowerCase()} of{" "}
                <strong>{formatKes(adjustmentConfirmation.input.amount)}</strong> for the selected
                student's account.
              </p>
              <p className="text-sm text-muted-foreground">
                Reason: {adjustmentConfirmation.input.reason}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={savingAdjustment}
                  onClick={() => setAdjustmentConfirmation(null)}
                  type="button"
                  variant="outline"
                >
                  Back to form
                </Button>
                <Button
                  disabled={savingAdjustment || !canSubmitAdjustment}
                  onClick={() => void confirmAdjustment()}
                  type="button"
                >
                  {savingAdjustment ? "Recording adjustment..." : "Confirm and record adjustment"}
                </Button>
              </div>
            </section>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-2"
              noValidate
              onSubmit={handleAdjustmentReview}
              ref={adjustmentFormRef}
            >
              <FormField id="adjustment-direction" label="Adjustment direction">
                <select
                  className={controlClassName}
                  id="adjustment-direction"
                  onChange={(event) => {
                    if (isAdjustmentDirection(event.target.value)) {
                      setAdjustmentDirection(event.target.value);
                    }
                  }}
                  value={adjustmentDirection}
                >
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </FormField>
              <FormField id="adjustment-amount" label="Adjustment amount (KES)">
                <input
                  aria-describedby={adjustmentErrors.amount ? "adjustment-amount-error" : undefined}
                  aria-invalid={Boolean(adjustmentErrors.amount)}
                  className={controlClassName}
                  id="adjustment-amount"
                  inputMode="decimal"
                  onChange={(event) => setAdjustmentAmount(event.target.value)}
                  required
                  value={adjustmentAmount}
                />
                <FieldError id="adjustment-amount-error" message={adjustmentErrors.amount} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField id="adjustment-reason" label="Adjustment reason">
                  <textarea
                    aria-describedby={
                      adjustmentErrors.reason ? "adjustment-reason-error" : undefined
                    }
                    aria-invalid={Boolean(adjustmentErrors.reason)}
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    id="adjustment-reason"
                    maxLength={500}
                    onChange={(event) => setAdjustmentReason(event.target.value)}
                    required
                    value={adjustmentReason}
                  />
                  <FieldError id="adjustment-reason-error" message={adjustmentErrors.reason} />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <Button disabled={!canSubmitAdjustment} type="submit" variant="outline">
                  Review adjustment
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{formatKes(value)}</dd>
    </div>
  );
}

function RequestFailure({
  error,
  message,
  onRetry,
}: {
  error: Error | null;
  message: string;
  onRetry: () => void;
}) {
  if (error instanceof ApiClientError && error.status === 403) {
    return (
      <UnauthorizedState
        description="The server denied access to the account information in the current school context."
        title="Account access denied"
      />
    );
  }
  return <ErrorState message={message} onRetry={onRetry} />;
}

function ApiErrorMessage({ error }: { error: Error }) {
  return (
    <div
      className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      role="alert"
    >
      <p>
        {error instanceof ApiClientError && error.status === 403
          ? `The server denied this finance operation. ${error.message}`
          : error.message}
      </p>
      {error instanceof ApiClientError && error.issues.length > 0 && (
        <ul className="list-inside list-disc">
          {error.issues.map((issue) => (
            <li key={`${issue.path ?? "request"}-${issue.message}`}>
              {issue.path ? `${issue.path}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs">
        If the response was lost, retrying unchanged data reuses the same idempotency key.
      </p>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive" id={id}>
      {message}
    </p>
  );
}

function isPositiveAmount(value: string): boolean {
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value) && toMinorUnits(value) > 0n;
}

function toMinorUnits(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) return 0n;
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function getIdempotencyKey(keys: Map<string, string>, fingerprint: string): string {
  const existing = keys.get(fingerprint);
  if (existing) return existing;
  const key = crypto.randomUUID();
  keys.set(fingerprint, key);
  return key;
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function isNotFound(error: Error): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

function isAdjustmentDirection(value: string): value is AdjustmentInput["direction"] {
  return value === "DEBIT" || value === "CREDIT";
}
