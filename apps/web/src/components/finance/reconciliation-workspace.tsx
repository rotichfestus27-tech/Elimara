import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";
import { formatKes } from "@/lib/finance-format";

type ReconciliationPayment = {
  id: string;
  amount: string;
  receivedAt: string;
  reference: string | null;
};

type ReconciliationRecord = {
  id: string;
  paymentId: string;
  paymentAmount: string;
  statementAmount: string;
  statementReference: string | null;
  outcome: "MATCHED" | "EXCEPTION";
  note: string;
  createdAt: string;
};

type ReconciliationInput = {
  statementAmount: string;
  statementReference?: string;
  note: string;
};

const pageSize = 25;
const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function ReconciliationWorkspace({
  canReadPayments,
  canReconcilePayments,
  payments,
  paymentsPending = false,
  paymentsError = null,
  onRetryPayments,
}: {
  canReadPayments: boolean;
  canReconcilePayments: boolean;
  payments: ReconciliationPayment[];
  paymentsPending?: boolean;
  paymentsError?: Error | null;
  onRetryPayments?: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [statementAmount, setStatementAmount] = useState("");
  const [statementReference, setStatementReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<ReconciliationInput | null>(null);
  const [result, setResult] = useState<ReconciliationRecord | null>(null);
  const [requestError, setRequestError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const idempotencyKeys = useRef(new Map<string, string>());

  const exceptions = useSchoolList<ReconciliationRecord>(
    "/finance/reconciliation/exceptions",
    { limit: pageSize, offset },
    { enabled: canReconcilePayments },
  );

  useEffect(() => {
    if (!payments.some(({ id }) => id === selectedPaymentId)) {
      setSelectedPaymentId(payments[0]?.id ?? "");
    }
  }, [payments, selectedPaymentId]);

  if (!canReconcilePayments) return null;

  const selectedPayment = payments.find(({ id }) => id === selectedPaymentId);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canReconcilePayments ||
      !canReadPayments ||
      !selectedPayment ||
      paymentsPending ||
      paymentsError ||
      savingRef.current
    ) {
      return;
    }

    const input: ReconciliationInput = {
      statementAmount: statementAmount.trim(),
      ...(statementReference.trim() ? { statementReference: statementReference.trim() } : {}),
      note: note.trim(),
    };
    const nextErrors: Record<string, string> = {};
    if (!isNonNegativeAmount(input.statementAmount)) {
      nextErrors.statementAmount = "Enter an amount with up to two decimal places.";
    }
    if (input.statementReference !== undefined && input.statementReference.length > 120) {
      nextErrors.statementReference = "Reference must be 120 characters or fewer.";
    }
    if (!input.note) nextErrors.note = "Enter a reconciliation note.";
    else if (input.note.length > 500) nextErrors.note = "Note must be 500 characters or fewer.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setRequestError(null);
    setResult(null);
    setConfirmation(input);
  }

  async function confirm() {
    if (
      savingRef.current ||
      !school ||
      !selectedPayment ||
      !confirmation ||
      !canReadPayments ||
      !canReconcilePayments ||
      paymentsPending ||
      paymentsError
    ) {
      return;
    }

    const fingerprint = JSON.stringify([selectedPayment.id, confirmation]);
    let idempotencyKey = idempotencyKeys.current.get(fingerprint);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      idempotencyKeys.current.set(fingerprint, idempotencyKey);
    }
    savingRef.current = true;
    setSaving(true);
    setRequestError(null);
    try {
      const response = await apiRequest<{ data: ReconciliationRecord }>(
        `/schools/${encodeURIComponent(school.id)}/finance/payments/${encodeURIComponent(selectedPayment.id)}/reconciliation`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: confirmation,
        },
      );
      idempotencyKeys.current.clear();
      setResult(response.data);
      setConfirmation(null);
      setStatementAmount("");
      setStatementReference("");
      setNote("");
      setErrors({});
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error
          : new Error("The reconciliation observation could not be recorded."),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="reconciliation-title" className="space-y-4 border-t pt-5">
      <div>
        <h3 className="text-base font-semibold" id="reconciliation-title">
          Payment reconciliation
        </h3>
        <p className="text-sm text-muted-foreground">
          Record a statement observation against a payment. The server compares the supplied
          statement amount with the payment amount and returns its outcome; this does not import or
          match bank transactions. Payment records do not expose a current reconciliation status.
        </p>
      </div>

      <section aria-labelledby="reconciliation-exceptions-title" className="space-y-3">
        <div>
          <h4 className="font-medium" id="reconciliation-exceptions-title">
            Historical exception observations
          </h4>
          <p className="text-xs text-muted-foreground">
            This paginated API contains exception observations only, including older exceptions
            later followed by a matching observation. It does not indicate each payment&apos;s
            latest status.
          </p>
        </div>
        {exceptions.isPending ? (
          <LoadingState className="min-h-20" message="Loading reconciliation exceptions..." />
        ) : exceptions.isError && isPermissionDenied(exceptions.error) ? (
          <UnauthorizedState
            description="The server denied access to reconciliation observations."
            title="Reconciliation access denied"
          />
        ) : exceptions.isError ? (
          <ErrorState
            message="Reconciliation exceptions could not be loaded."
            onRetry={() => void exceptions.refetch()}
          />
        ) : exceptions.data.data.length === 0 ? (
          <EmptyState
            className="min-h-20 justify-center"
            description="The API returned no exception observations on this page."
            title="No reconciliation exceptions"
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">
                  Historical reconciliation exception observations
                </caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Recorded
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Payment ID
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Payment amount
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Statement amount
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Statement reference
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Outcome
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Note
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.data.data.map((record) => (
                    <tr className="border-t align-top" key={record.id}>
                      <td className="px-4 py-3">
                        <time dateTime={record.createdAt}>{formatDateTime(record.createdAt)}</time>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{record.paymentId}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(record.paymentAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(record.statementAmount)}
                      </td>
                      <td className="px-4 py-3">{record.statementReference || "Not provided"}</td>
                      <td className="px-4 py-3 font-medium">{record.outcome}</td>
                      <td className="px-4 py-3">{record.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Reconciliation exception pagination"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-xs text-muted-foreground">
                Showing {offset + 1}–{offset + exceptions.data.data.length} of{" "}
                {exceptions.data.meta.total} historical observations
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={offset === 0}
                  onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={offset + exceptions.data.data.length >= exceptions.data.meta.total}
                  onClick={() => setOffset((current) => current + pageSize)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </nav>
          </>
        )}
      </section>

      {result && (
        <div
          className="rounded-md border border-green-700/20 bg-green-700/5 p-3 text-sm"
          role="status"
        >
          <p className="font-medium">Reconciliation observation recorded: {result.outcome}.</p>
          <p>
            Payment {formatKes(result.paymentAmount)}; statement {formatKes(result.statementAmount)}
            . The API returned this outcome for the submitted observation, not a bank settlement
            confirmation.
          </p>
        </div>
      )}
      {requestError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>
            {requestError instanceof ApiClientError && requestError.status === 403
              ? `The server denied this finance operation. ${requestError.message}`
              : requestError.message}
          </p>
          {requestError instanceof ApiClientError && requestError.issues.length > 0 && (
            <ul className="list-inside list-disc">
              {requestError.issues.map((issue) => (
                <li key={`${issue.path ?? "request"}-${issue.message}`}>
                  {issue.path ? `${issue.path}: ` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs">Retrying unchanged data reuses the same idempotency key.</p>
        </div>
      )}

      {!canReadPayments ? (
        <UnauthorizedState
          description="Recording an observation requires a payment ID from the payment list. finance.payments.read is not granted in this school context."
          title="Payment selection access unavailable"
        />
      ) : paymentsPending ? (
        <LoadingState className="min-h-20" message="Loading payment records..." />
      ) : paymentsError ? (
        isPermissionDenied(paymentsError) ? (
          <UnauthorizedState
            description="The server denied access to payment records in the current school context."
            title="Payment access denied"
          />
        ) : (
          <ErrorState
            message="Payment records could not be loaded for reconciliation."
            onRetry={onRetryPayments}
          />
        )
      ) : payments.length === 0 ? (
        <EmptyState
          className="min-h-20 justify-center"
          description="Select a student with a payment record before recording a reconciliation observation."
          title="No selectable payment"
        />
      ) : confirmation ? (
        <section
          aria-labelledby="reconciliation-confirmation-title"
          className="space-y-3 rounded-md border bg-muted/20 p-4"
        >
          <h4 className="font-medium" id="reconciliation-confirmation-title">
            Confirm reconciliation observation
          </h4>
          <p className="text-sm">
            Record statement amount <strong>{formatKes(confirmation.statementAmount)}</strong>{" "}
            against payment <code>{selectedPayment?.id}</code>
            {confirmation.statementReference
              ? ` with reference ${confirmation.statementReference}`
              : ""}
            .
          </p>
          <p className="text-sm text-muted-foreground">Note: {confirmation.note}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving}
              onClick={() => setConfirmation(null)}
              type="button"
              variant="outline"
            >
              Back to form
            </Button>
            <Button
              disabled={
                saving ||
                !canReconcilePayments ||
                paymentsPending ||
                Boolean(paymentsError) ||
                !selectedPayment
              }
              onClick={() => void confirm()}
              type="button"
            >
              {saving ? "Recording observation..." : "Confirm and record observation"}
            </Button>
          </div>
        </section>
      ) : (
        <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={review}>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Payment</span>
            <select
              className={controlClassName}
              disabled={saving}
              onChange={(event) => setSelectedPaymentId(event.target.value)}
              value={selectedPaymentId}
            >
              {payments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.id} — {formatKes(payment.amount)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Statement amount (KES)</span>
            <input
              aria-describedby={errors.statementAmount ? "statement-amount-error" : undefined}
              aria-invalid={Boolean(errors.statementAmount)}
              className={controlClassName}
              inputMode="decimal"
              maxLength={15}
              onChange={(event) => setStatementAmount(event.target.value)}
              required
              value={statementAmount}
            />
            {errors.statementAmount && (
              <span className="block text-xs text-destructive" id="statement-amount-error">
                {errors.statementAmount}
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Statement reference (optional)</span>
            <input
              aria-describedby={errors.statementReference ? "statement-reference-error" : undefined}
              aria-invalid={Boolean(errors.statementReference)}
              className={controlClassName}
              maxLength={120}
              onChange={(event) => setStatementReference(event.target.value)}
              value={statementReference}
            />
            {errors.statementReference && (
              <span className="block text-xs text-destructive" id="statement-reference-error">
                {errors.statementReference}
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="block font-medium">Reconciliation note</span>
            <textarea
              aria-describedby={errors.note ? "reconciliation-note-error" : undefined}
              aria-invalid={Boolean(errors.note)}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              required
              value={note}
            />
            {errors.note && (
              <span className="block text-xs text-destructive" id="reconciliation-note-error">
                {errors.note}
              </span>
            )}
          </label>
          <div className="sm:col-span-2">
            <Button
              disabled={
                saving ||
                !canReconcilePayments ||
                paymentsPending ||
                Boolean(paymentsError) ||
                !selectedPayment
              }
              type="submit"
              variant="outline"
            >
              Review observation
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function isNonNegativeAmount(value: string): boolean {
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value);
}

function isPermissionDenied(error: Error): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
