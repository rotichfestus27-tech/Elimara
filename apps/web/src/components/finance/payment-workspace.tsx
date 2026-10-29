import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { FinanceCorrections } from "@/components/finance/finance-corrections";
import { ReconciliationWorkspace } from "@/components/finance/reconciliation-workspace";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";
import { formatKes } from "@/lib/finance-format";

type FinanceAccount = {
  accountId: string;
  studentId: string;
  admissionNumber: string;
  studentGivenName: string;
  studentFamilyName: string;
};

type Student = {
  id: string;
  admissionNumber: string;
  givenName: string;
  familyName: string;
};

type StudentChoice = {
  id: string;
  admissionNumber: string;
  givenName: string;
  familyName: string;
};

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

type FinanceCharge = {
  id: string;
  studentId: string;
  structureName: string;
  totalAmount: string;
  allocatedAmount: string;
  allocationReversedAmount: string;
  outstandingAmount: string;
  reversed: boolean;
  createdAt: string;
};

type PaymentAllocation = {
  id: string;
  paymentId: string;
  chargeId: string;
  amount: string;
  reversedAmount: string;
  createdAt: string;
};

type PaymentBody = {
  amount: string;
  method: string;
  reference?: string;
};

type PaymentConfirmation = {
  schoolId: string;
  studentId: string;
  body: PaymentBody;
  fingerprint: string;
};

type AllocationBody = {
  chargeId: string;
  amount: string;
};

type AllocationConfirmation = {
  schoolId: string;
  paymentId: string;
  chargeId: string;
  chargeName: string;
  amount: string;
};

const pageSize = 25;
const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function PaymentWorkspace({
  canReadAccounts,
  canReadPayments,
  canRecordPayments,
  canManageAllocations,
  canManageRefunds,
  canManageAdjustments,
  canReconcilePayments,
  canReadStudents,
}: {
  canReadAccounts: boolean;
  canReadPayments: boolean;
  canRecordPayments: boolean;
  canManageAllocations: boolean;
  canManageRefunds: boolean;
  canManageAdjustments: boolean;
  canReconcilePayments: boolean;
  canReadStudents: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [studentOffset, setStudentOffset] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [paymentOffset, setPaymentOffset] = useState(0);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [paymentFieldErrors, setPaymentFieldErrors] = useState<Record<string, string>>({});
  const [paymentError, setPaymentError] = useState<Error | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [paymentConfirmation, setPaymentConfirmation] = useState<PaymentConfirmation | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const paymentSavingRef = useRef(false);
  const paymentIdempotencyRef = useRef(new Map<string, string>());
  const paymentFormRef = useRef<HTMLFormElement>(null);
  const [allocationPayment, setAllocationPayment] = useState<FinancePayment | null>(null);
  const [allocationAmount, setAllocationAmount] = useState("");
  const [allocationChargeId, setAllocationChargeId] = useState("");
  const [allocationConfirmation, setAllocationConfirmation] =
    useState<AllocationConfirmation | null>(null);
  const [chargeOffset, setChargeOffset] = useState(0);
  const [allocationFieldErrors, setAllocationFieldErrors] = useState<Record<string, string>>({});
  const [allocationError, setAllocationError] = useState<Error | null>(null);
  const [allocationSuccess, setAllocationSuccess] = useState("");
  const [savingAllocation, setSavingAllocation] = useState(false);
  const allocationSavingRef = useRef(false);
  const allocationIdempotencyRef = useRef(new Map<string, string>());
  const allocationFormRef = useRef<HTMLFormElement>(null);

  const canChooseStudent = canReadStudents || canReadAccounts;
  const studentQuery = useSchoolList<Student>(
    "/students",
    {
      limit: pageSize,
      offset: studentOffset,
      q: search.trim() || undefined,
      sortBy: "admissionNumber",
      sortOrder: "asc",
      status: studentStatus === "all" ? undefined : studentStatus,
    },
    { enabled: canReadStudents && canChooseStudent },
  );
  const accountQuery = useSchoolList<FinanceAccount>(
    "/finance/accounts",
    { limit: pageSize, offset: studentOffset },
    { enabled: !canReadStudents && canReadAccounts },
  );

  const studentChoices: StudentChoice[] = canReadStudents
    ? (studentQuery.data?.data ?? []).map((student) => ({
        id: student.id,
        admissionNumber: student.admissionNumber,
        givenName: student.givenName,
        familyName: student.familyName,
      }))
    : (accountQuery.data?.data ?? []).map((account) => ({
        id: account.studentId,
        admissionNumber: account.admissionNumber,
        givenName: account.studentGivenName,
        familyName: account.studentFamilyName,
      }));
  const studentPage = canReadStudents ? studentQuery.data : accountQuery.data;
  const studentQueryPending = canReadStudents ? studentQuery.isPending : accountQuery.isPending;
  const studentQueryFetching = canReadStudents ? studentQuery.isFetching : accountQuery.isFetching;
  const studentQueryError = canReadStudents ? studentQuery.error : accountQuery.error;
  const studentQueryIsError = canReadStudents ? studentQuery.isError : accountQuery.isError;
  const studentRefetch = canReadStudents ? studentQuery.refetch : accountQuery.refetch;

  useEffect(() => {
    if (!studentPage) return;
    if (!studentChoices.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(studentChoices[0]?.id ?? "");
      setPaymentOffset(0);
    }
  }, [studentPage, selectedStudentId, studentChoices]);

  useEffect(() => {
    if (Object.keys(paymentFieldErrors).length > 0) {
      paymentFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [paymentFieldErrors]);

  useEffect(() => {
    if (Object.keys(allocationFieldErrors).length > 0) {
      allocationFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [allocationFieldErrors]);

  const selectedStudent = studentChoices.find(({ id }) => id === selectedStudentId);
  const paymentsQuery = useSchoolList<FinancePayment>(
    `/students/${encodeURIComponent(selectedStudentId)}/finance/payments`,
    { limit: pageSize, offset: paymentOffset },
    { enabled: canReadPayments && Boolean(selectedStudentId) },
  );
  const chargesQuery = useSchoolList<FinanceCharge>(
    `/students/${encodeURIComponent(selectedStudentId)}/finance/charges`,
    { limit: pageSize, offset: chargeOffset },
    {
      enabled:
        Boolean(allocationPayment) &&
        canReadAccounts &&
        canReadPayments &&
        canManageAllocations &&
        Boolean(selectedStudentId),
    },
  );
  const canAllocate = canReadAccounts && canReadPayments && canManageAllocations;
  const chargesReady =
    Boolean(chargesQuery.data) && !chargesQuery.isError && !chargesQuery.isFetching;
  const availableCharges = (chargesQuery.data?.data ?? []).filter(
    (charge) => !charge.reversed && toMinorUnits(charge.outstandingAmount) > 0n,
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    setStudentOffset(0);
    setSelectedStudentId("");
    setPaymentOffset(0);
    setPaymentSuccess("");
  }

  async function handleRecordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      paymentSavingRef.current ||
      !school ||
      !selectedStudentId ||
      !selectedStudent ||
      !studentPage ||
      studentQueryIsError ||
      studentQueryFetching ||
      !canRecordPayments
    ) {
      return;
    }

    const errors: Record<string, string> = {};
    const body: PaymentBody = {
      amount: paymentAmount.trim(),
      method: paymentMethod.trim(),
      ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
    };
    if (!isPositiveAmount(body.amount)) {
      errors.amount = "Enter a positive amount with up to two decimal places.";
    }
    if (!body.method) errors.method = "Enter the verified payment method.";
    else if (body.method.length > 40) errors.method = "Method must be 40 characters or fewer.";
    if (body.reference && body.reference.length > 120) {
      errors.reference = "Reference must be 120 characters or fewer.";
    }
    if (!receiptVerified) errors.verification = "Confirm that receipt was independently verified.";
    setPaymentFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPaymentError(null);
    setPaymentSuccess("");
    setPaymentConfirmation({
      schoolId: school.id,
      studentId: selectedStudentId,
      body,
      fingerprint: JSON.stringify([school.id, selectedStudentId, body]),
    });
  }

  async function confirmRecordPayment() {
    if (
      paymentSavingRef.current ||
      !school ||
      !paymentConfirmation ||
      paymentConfirmation.schoolId !== school.id ||
      paymentConfirmation.studentId !== selectedStudentId ||
      !studentPage ||
      studentQueryIsError ||
      studentQueryFetching ||
      !canRecordPayments
    ) {
      return;
    }

    paymentSavingRef.current = true;
    setSavingPayment(true);
    const idempotencyKey = getIdempotencyKey(
      paymentIdempotencyRef.current,
      paymentConfirmation.fingerprint,
    );
    try {
      const response = await apiRequest<{ data: FinancePayment }>(
        `/schools/${encodeURIComponent(paymentConfirmation.schoolId)}/students/${encodeURIComponent(paymentConfirmation.studentId)}/finance/payments`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: paymentConfirmation.body,
        },
      );
      paymentIdempotencyRef.current.clear();
      setPaymentConfirmation(null);
      setPaymentOffset(0);
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentReference("");
      setReceiptVerified(false);
      setPaymentFieldErrors({});
      setPaymentDialogOpen(false);
      setPaymentSuccess(
        `Payment record ${response.data.id} was saved. This records the staff attestation and does not independently verify receipt.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
    } catch (error) {
      setPaymentError(asError(error, "The payment record could not be saved."));
    } finally {
      paymentSavingRef.current = false;
      setSavingPayment(false);
    }
  }

  function reviewAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      allocationSavingRef.current ||
      !school ||
      !selectedStudentId ||
      !allocationPayment ||
      !chargesReady ||
      !canAllocate
    )
      return;

    const errors: Record<string, string> = {};
    const amount = allocationAmount.trim();
    const selectedCharge = availableCharges.find(({ id }) => id === allocationChargeId);
    if (!isPositiveAmount(amount)) {
      errors.amount = "Enter a positive amount with up to two decimal places.";
    } else {
      const requested = toMinorUnits(amount);
      if (requested > toMinorUnits(allocationPayment.unappliedAmount)) {
        errors.amount = "Amount exceeds the payment's available unapplied amount.";
      }
      if (selectedCharge && requested > toMinorUnits(selectedCharge.outstandingAmount)) {
        errors.amount = "Amount exceeds the selected charge's outstanding amount.";
      }
    }
    if (!selectedCharge) errors.chargeId = "Select an outstanding charge for this student.";
    setAllocationFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !selectedCharge) return;

    const body: AllocationBody = { chargeId: allocationChargeId, amount };
    setAllocationError(null);
    setAllocationSuccess("");
    setAllocationConfirmation({
      schoolId: school.id,
      paymentId: allocationPayment.id,
      chargeId: selectedCharge.id,
      chargeName: selectedCharge.structureName,
      amount: body.amount,
    });
  }

  async function confirmAllocation() {
    if (
      allocationSavingRef.current ||
      !school ||
      !selectedStudentId ||
      !allocationPayment ||
      !allocationConfirmation ||
      allocationConfirmation.schoolId !== school.id ||
      allocationPayment.id !== allocationConfirmation.paymentId ||
      !chargesReady ||
      !canAllocate
    ) {
      return;
    }

    const body: AllocationBody = {
      chargeId: allocationConfirmation.chargeId,
      amount: allocationConfirmation.amount,
    };
    const fingerprint = JSON.stringify([school.id, allocationPayment.id, body]);
    const idempotencyKey = getIdempotencyKey(allocationIdempotencyRef.current, fingerprint);
    allocationSavingRef.current = true;
    setSavingAllocation(true);
    try {
      const response = await apiRequest<{ data: PaymentAllocation }>(
        `/schools/${encodeURIComponent(school.id)}/finance/payments/${encodeURIComponent(allocationPayment.id)}/allocations`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body,
        },
      );
      allocationIdempotencyRef.current.clear();
      setAllocationConfirmation(null);
      setAllocationSuccess(
        `Allocation ${response.data.id} was recorded for ${formatKes(response.data.amount)}.`,
      );
      setAllocationPayment(null);
      setAllocationAmount("");
      setAllocationChargeId("");
      setAllocationFieldErrors({});
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
    } catch (error) {
      setAllocationError(asError(error, "The payment allocation could not be saved."));
    } finally {
      allocationSavingRef.current = false;
      setSavingAllocation(false);
    }
  }

  if (!canChooseStudent) {
    return (
      <div className="space-y-5">
        {canReconcilePayments && (
          <ReconciliationWorkspace
            canReadPayments={canReadPayments}
            canReconcilePayments={canReconcilePayments}
            payments={[]}
            paymentsError={
              canReadPayments
                ? new Error("Student/account access is required to select a payment.")
                : null
            }
          />
        )}
        <UnauthorizedState
          className="min-h-36 justify-center"
          description="Selecting a student requires students.profile.read or finance.accounts.read. No student ID can be entered or guessed here."
          title="Student selection access unavailable"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section aria-label="Payment student selection" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {canReadStudents && (
            <FormField id="payment-student-search" label="Search students">
              <input
                autoComplete="off"
                className={controlClassName}
                id="payment-student-search"
                disabled={paymentDialogOpen || savingPayment || Boolean(allocationPayment)}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search by student name or admission number"
                type="search"
                value={search}
              />
            </FormField>
          )}
          {canReadStudents && (
            <FormField id="payment-student-status" label="Student status">
              <select
                className={controlClassName}
                disabled={paymentDialogOpen || savingPayment || Boolean(allocationPayment)}
                id="payment-student-status"
                onChange={(event) => {
                  setStudentStatus(event.target.value);
                  setStudentOffset(0);
                  setSelectedStudentId("");
                  setPaymentOffset(0);
                }}
                value={studentStatus}
              >
                <option value="all">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="TRANSFERRED">Transferred</option>
                <option value="GRADUATED">Graduated</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
            </FormField>
          )}
          <FormField id="payment-student-select" label="Student account">
            <select
              className={controlClassName}
              disabled={
                studentQueryPending ||
                studentQueryFetching ||
                studentQueryIsError ||
                studentChoices.length === 0 ||
                paymentDialogOpen ||
                savingPayment ||
                Boolean(allocationPayment)
              }
              id="payment-student-select"
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                setPaymentOffset(0);
                setPaymentSuccess("");
              }}
              value={selectedStudentId}
            >
              <option value="">Select a student</option>
              {studentChoices.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.admissionNumber} — {student.givenName} {student.familyName}
                </option>
              ))}
            </select>
          </FormField>
          {canRecordPayments && (
            <Button
              aria-expanded={paymentDialogOpen}
              disabled={
                !selectedStudentId ||
                !selectedStudent ||
                !studentPage ||
                studentQueryIsError ||
                studentQueryFetching
              }
              onClick={() => {
                setPaymentError(null);
                setPaymentDialogOpen(true);
              }}
              type="button"
            >
              Record manual payment
            </Button>
          )}
        </div>
        {canReadStudents && (
          <p className="text-xs text-muted-foreground">
            Student name/admission-number search and these documented status filters come from the
            authorized student-list API.
          </p>
        )}
        {!canReadStudents && (
          <p className="text-xs text-muted-foreground">
            Select from existing finance accounts. This list supports pagination only.
          </p>
        )}
        {studentQueryPending ? (
          <LoadingState className="min-h-20" message="Loading students..." />
        ) : studentQueryIsError ? (
          <RequestFailure
            error={studentQueryError}
            message="Student choices could not be loaded."
            onRetry={() => void studentRefetch()}
          />
        ) : studentChoices.length === 0 ? (
          <EmptyState
            className="min-h-20 justify-center"
            description={
              canReadStudents
                ? "No active students matched the current search."
                : "No existing finance accounts were returned."
            }
            title="No student choices"
          />
        ) : (
          <Pagination
            count={studentChoices.length}
            offset={studentOffset}
            onNext={() => setStudentOffset((offset) => offset + pageSize)}
            onPrevious={() => setStudentOffset((offset) => Math.max(0, offset - pageSize))}
            total={studentPage?.meta.total ?? 0}
            label="Student choices"
            disabled={paymentDialogOpen || savingPayment || Boolean(allocationPayment)}
          />
        )}
      </section>

      {paymentSuccess && (
        <p
          className="rounded-md border border-green-700/20 bg-green-700/5 p-3 text-sm"
          role="status"
        >
          {paymentSuccess}
        </p>
      )}
      {allocationSuccess && (
        <p
          className="rounded-md border border-green-700/20 bg-green-700/5 p-3 text-sm"
          role="status"
        >
          {allocationSuccess}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Payment records contain no settlement status. A saved record represents a staff-reported,
        manually verified receipt; it is not gateway confirmation or independent proof of funds.
      </p>

      {canReadPayments ? (
        !selectedStudentId ? (
          <EmptyState
            className="min-h-28 justify-center"
            description="Choose a student to view their payment records."
            title="Select a student"
          />
        ) : paymentsQuery.isPending || paymentsQuery.isFetching ? (
          <LoadingState className="min-h-32" message="Loading payment records..." />
        ) : paymentsQuery.isError ? (
          <RequestFailure
            error={paymentsQuery.error}
            message="Payment records could not be loaded."
            onRetry={() => void paymentsQuery.refetch()}
          />
        ) : paymentsQuery.data.data.length === 0 ? (
          <EmptyState
            className="min-h-28 justify-center"
            description="The API returned no payment records for this student."
            title="No payment records"
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1280px] text-sm">
                <caption className="sr-only">
                  Payment records for {selectedStudent?.givenName} {selectedStudent?.familyName}
                </caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Received
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Student
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Amount
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Method
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Reference
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Allocated
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Allocation reversals
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Refunded
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Unapplied
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Payment ID
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Receipt ID
                    </th>
                    {canAllocate && (
                      <th className="px-4 py-3 font-medium" scope="col">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paymentsQuery.data.data.map((payment) => (
                    <tr className="border-t align-top" key={payment.id}>
                      <th className="px-4 py-3 text-left font-normal" scope="row">
                        <time dateTime={payment.receivedAt}>
                          {formatReceivedAt(payment.receivedAt)}
                        </time>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Recorded entry; no settlement status returned
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        {selectedStudent?.admissionNumber}
                        <span className="block">
                          {selectedStudent?.givenName} {selectedStudent?.familyName}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {formatKes(payment.amount)}
                      </td>
                      <td className="px-4 py-3">{payment.method}</td>
                      <td className="px-4 py-3">{payment.reference || "Not provided"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(payment.allocatedAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(payment.allocationReversedAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(payment.refundedAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(payment.unappliedAmount)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{payment.id}</td>
                      <td className="px-4 py-3 font-mono text-xs">{payment.receiptId}</td>
                      {canAllocate && (
                        <td className="px-4 py-3">
                          <Button
                            disabled={
                              !isPositiveAmount(payment.unappliedAmount) || savingAllocation
                            }
                            onClick={() => {
                              setAllocationError(null);
                              setAllocationSuccess("");
                              setAllocationConfirmation(null);
                              setAllocationPayment(payment);
                              setAllocationAmount("");
                              setAllocationChargeId("");
                              setChargeOffset(0);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Allocate
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {pageRange(paymentOffset, paymentsQuery.data.data.length)} of{" "}
              {paymentsQuery.data.meta.total} records for this student. Payment records are filtered
              by selected student only; no payment-date, status, or reference filter is supported by
              this endpoint.
            </p>
            <Pagination
              count={paymentsQuery.data.data.length}
              offset={paymentOffset}
              onNext={() => setPaymentOffset((offset) => offset + pageSize)}
              onPrevious={() => setPaymentOffset((offset) => Math.max(0, offset - pageSize))}
              total={paymentsQuery.data.meta.total}
              label="Payment records"
              disabled={paymentDialogOpen || savingPayment || Boolean(allocationPayment)}
            />
          </>
        )
      ) : (
        <UnauthorizedState
          className="min-h-28 justify-center"
          description="Recording payments does not grant permission to read payment history. The backend enforces that access separately."
          title="Payment history access unavailable"
        />
      )}

      {canReconcilePayments && (
        <ReconciliationWorkspace
          canReadPayments={canReadPayments}
          canReconcilePayments={canReconcilePayments}
          payments={
            paymentsQuery.isError || paymentsQuery.isFetching
              ? []
              : (paymentsQuery.data?.data ?? [])
          }
          paymentsError={paymentsQuery.error}
          paymentsPending={Boolean(selectedStudentId) && paymentsQuery.isFetching}
          onRetryPayments={() => void paymentsQuery.refetch()}
        />
      )}

      {selectedStudentId && (
        <FinanceCorrections
          canManageAdjustments={canManageAdjustments}
          canManageRefunds={canManageRefunds}
          canReadAccounts={canReadAccounts}
          canReadPayments={canReadPayments}
          paymentsError={paymentsQuery.error}
          paymentsPending={Boolean(selectedStudentId) && paymentsQuery.isFetching}
          payments={
            paymentsQuery.isError || paymentsQuery.isFetching
              ? []
              : (paymentsQuery.data?.data ?? [])
          }
          onRetryPayments={() => void paymentsQuery.refetch()}
          studentId={selectedStudentId}
        />
      )}

      {paymentDialogOpen && (
        <section
          aria-labelledby="record-payment-title"
          className="space-y-4 rounded-md border p-4 sm:p-5"
        >
          <div className="space-y-1">
            <h3 className="text-lg font-semibold" id="record-payment-title">
              Record verified manual payment
            </h3>
            <p className="text-sm text-muted-foreground">
              Record a payment only after independently verifying receipt through the school's
              approved offline process. This API does not contact a payment provider.
            </p>
          </div>
          {paymentError && <ApiErrorMessage error={paymentError} />}
          <p className="text-sm font-medium">
            {selectedStudent?.admissionNumber} — {selectedStudent?.givenName}{" "}
            {selectedStudent?.familyName}
          </p>
          {paymentConfirmation ? (
            <section
              aria-labelledby="payment-confirmation-title"
              className="space-y-3 rounded-md border bg-muted/20 p-4"
            >
              <h4 className="font-medium" id="payment-confirmation-title">
                Confirm payment record
              </h4>
              <p className="text-sm">
                Record KES <strong>{paymentConfirmation.body.amount}</strong> by{" "}
                <strong>{paymentConfirmation.body.method}</strong>
                {paymentConfirmation.body.reference
                  ? ` with reference ${paymentConfirmation.body.reference}`
                  : ""}{" "}
                for this student.
              </p>
              <p className="text-xs text-muted-foreground">
                This saves a staff attestation of an independently verified receipt; the API does
                not verify or process funds.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  disabled={savingPayment}
                  onClick={() => setPaymentDialogOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={savingPayment}
                  onClick={() => setPaymentConfirmation(null)}
                  type="button"
                  variant="outline"
                >
                  Back to form
                </Button>
                <Button
                  disabled={savingPayment || !canRecordPayments}
                  onClick={() => void confirmRecordPayment()}
                  type="button"
                >
                  {savingPayment ? "Saving record..." : "Confirm and record payment"}
                </Button>
              </div>
            </section>
          ) : (
            <form
              className="space-y-4"
              noValidate
              onSubmit={handleRecordPayment}
              ref={paymentFormRef}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="payment-amount" label="Amount (KES)">
                  <input
                    aria-describedby={
                      paymentFieldErrors.amount ? "payment-amount-error" : undefined
                    }
                    aria-invalid={Boolean(paymentFieldErrors.amount)}
                    className={controlClassName}
                    id="payment-amount"
                    inputMode="decimal"
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    required
                    value={paymentAmount}
                  />
                  <FieldError id="payment-amount-error" message={paymentFieldErrors.amount} />
                </FormField>
                <FormField id="payment-method" label="Payment method">
                  <input
                    aria-describedby={
                      paymentFieldErrors.method ? "payment-method-error" : undefined
                    }
                    aria-invalid={Boolean(paymentFieldErrors.method)}
                    className={controlClassName}
                    id="payment-method"
                    maxLength={40}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    placeholder="Enter the verified method"
                    required
                    value={paymentMethod}
                  />
                  <FieldError id="payment-method-error" message={paymentFieldErrors.method} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField id="payment-reference" label="Verified reference (optional)">
                    <input
                      aria-describedby={
                        paymentFieldErrors.reference ? "payment-reference-error" : undefined
                      }
                      aria-invalid={Boolean(paymentFieldErrors.reference)}
                      className={controlClassName}
                      id="payment-reference"
                      maxLength={120}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      value={paymentReference}
                    />
                    <FieldError
                      id="payment-reference-error"
                      message={paymentFieldErrors.reference}
                    />
                  </FormField>
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  aria-describedby={
                    paymentFieldErrors.verification ? "payment-verification-error" : undefined
                  }
                  aria-invalid={Boolean(paymentFieldErrors.verification)}
                  checked={receiptVerified}
                  className="mt-1 size-4 shrink-0"
                  onChange={(event) => setReceiptVerified(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I independently verified that the school received this payment before recording
                  it. This is a manual staff attestation, not a gateway verification.
                  {paymentFieldErrors.verification && (
                    <span
                      className="mt-1 block text-xs text-destructive"
                      id="payment-verification-error"
                    >
                      {paymentFieldErrors.verification}
                    </span>
                  )}
                </span>
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  disabled={savingPayment}
                  onClick={() => {
                    setPaymentConfirmation(null);
                    setPaymentDialogOpen(false);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={savingPayment || !canRecordPayments} type="submit">
                  Review payment record
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!savingAllocation && !open) {
            setAllocationPayment(null);
            setAllocationConfirmation(null);
          }
        }}
        open={Boolean(allocationPayment)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Allocate payment to a charge</DialogTitle>
            <DialogDescription>
              The server verifies that payment and charge belong to this same student's account and
              that both have enough available balance.
            </DialogDescription>
          </DialogHeader>
          {allocationPayment && (
            <form
              className="space-y-4"
              noValidate
              onSubmit={reviewAllocation}
              ref={allocationFormRef}
            >
              {allocationError && <ApiErrorMessage error={allocationError} />}
              <p className="text-sm">
                Payment amount: <strong>{formatKes(allocationPayment.amount)}</strong>; available
                unapplied amount: <strong>{formatKes(allocationPayment.unappliedAmount)}</strong>.
              </p>
              {chargesQuery.isPending || chargesQuery.isFetching ? (
                <LoadingState className="min-h-24" message="Loading this student's charges..." />
              ) : chargesQuery.isError ? (
                <RequestFailure
                  error={chargesQuery.error}
                  message="Student charges could not be loaded."
                  onRetry={() => void chargesQuery.refetch()}
                />
              ) : allocationConfirmation ? (
                <section
                  aria-labelledby="allocation-confirmation-title"
                  className="space-y-3 rounded-md border bg-muted/20 p-4"
                >
                  <h3 className="font-medium" id="allocation-confirmation-title">
                    Confirm payment allocation
                  </h3>
                  <p className="text-sm">
                    Allocate KES <strong>{allocationConfirmation.amount}</strong> from this payment
                    to <strong>{allocationConfirmation.chargeName}</strong>?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The backend rechecks payment and charge balances and that both belong to this
                    student's account.
                  </p>
                </section>
              ) : availableCharges.length === 0 ? (
                <div className="space-y-3">
                  <EmptyState
                    className="min-h-24 justify-center"
                    description={
                      chargesQuery.data?.meta.total
                        ? "This page has no outstanding, unreversed charges. Continue through the supported pages to check the remaining charges."
                        : "This student has no finance charges."
                    }
                    title="No available charges on this page"
                  />
                  {chargesQuery.data && (
                    <Pagination
                      count={chargesQuery.data.data.length}
                      offset={chargeOffset}
                      onNext={() => setChargeOffset((offset) => offset + pageSize)}
                      onPrevious={() => setChargeOffset((offset) => Math.max(0, offset - pageSize))}
                      total={chargesQuery.data.meta.total}
                      label="Student charges"
                      disabled={savingAllocation}
                    />
                  )}
                </div>
              ) : (
                <>
                  <FormField id="allocation-charge" label="Outstanding charge">
                    <select
                      aria-describedby={
                        allocationFieldErrors.chargeId ? "allocation-charge-error" : undefined
                      }
                      aria-invalid={Boolean(allocationFieldErrors.chargeId)}
                      className={controlClassName}
                      id="allocation-charge"
                      onChange={(event) => setAllocationChargeId(event.target.value)}
                      required
                      value={allocationChargeId}
                    >
                      <option value="">Select a charge</option>
                      {availableCharges.map((charge) => (
                        <option key={charge.id} value={charge.id}>
                          {charge.structureName} — outstanding {formatKes(charge.outstandingAmount)}
                        </option>
                      ))}
                    </select>
                    <FieldError
                      id="allocation-charge-error"
                      message={allocationFieldErrors.chargeId}
                    />
                  </FormField>
                  <FormField id="allocation-amount" label="Allocation amount (KES)">
                    <input
                      aria-describedby={
                        allocationFieldErrors.amount ? "allocation-amount-error" : undefined
                      }
                      aria-invalid={Boolean(allocationFieldErrors.amount)}
                      className={controlClassName}
                      id="allocation-amount"
                      inputMode="decimal"
                      onChange={(event) => setAllocationAmount(event.target.value)}
                      required
                      value={allocationAmount}
                    />
                    <FieldError
                      id="allocation-amount-error"
                      message={allocationFieldErrors.amount}
                    />
                  </FormField>
                  {chargesQuery.data && (
                    <Pagination
                      count={chargesQuery.data.data.length}
                      offset={chargeOffset}
                      onNext={() => setChargeOffset((offset) => offset + pageSize)}
                      onPrevious={() => setChargeOffset((offset) => Math.max(0, offset - pageSize))}
                      total={chargesQuery.data.meta.total}
                      label="Student charges"
                      disabled={savingAllocation}
                    />
                  )}
                </>
              )}
              <DialogFooter>
                <Button
                  disabled={savingAllocation}
                  onClick={() => {
                    setAllocationPayment(null);
                    setAllocationConfirmation(null);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                {allocationConfirmation && (
                  <Button
                    disabled={savingAllocation}
                    onClick={() => setAllocationConfirmation(null)}
                    type="button"
                    variant="outline"
                  >
                    Back to form
                  </Button>
                )}
                <Button
                  disabled={
                    savingAllocation ||
                    !chargesReady ||
                    (!allocationConfirmation && availableCharges.length === 0)
                  }
                  onClick={allocationConfirmation ? () => void confirmAllocation() : undefined}
                  type={allocationConfirmation ? "button" : "submit"}
                >
                  {savingAllocation
                    ? "Saving allocation..."
                    : allocationConfirmation
                      ? "Confirm and save allocation"
                      : "Review allocation"}
                </Button>
              </DialogFooter>
              {allocationSuccess && (
                <p className="text-sm" role="status">
                  {allocationSuccess}
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pagination({
  count,
  offset,
  onNext,
  onPrevious,
  total,
  label,
  disabled = false,
}: {
  count: number;
  offset: number;
  onNext: () => void;
  onPrevious: () => void;
  total: number;
  label: string;
  disabled?: boolean;
}) {
  if (total <= pageSize) return null;
  const range = count === 0 ? "0" : `${offset + 1}–${offset + count}`;
  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      <p className="text-xs text-muted-foreground">
        Showing {range} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          disabled={disabled || offset === 0}
          onClick={onPrevious}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={disabled || offset + count >= total}
          onClick={onNext}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </nav>
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
        className="min-h-24 justify-center"
        description="The server denied access to this financial data in the current school context."
        title="Access denied"
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
        If the response was lost, retrying unchanged data reuses its idempotency key.
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

function formatReceivedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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

function pageRange(offset: number, count: number): string {
  return count === 0 ? "0" : `${offset + 1}–${offset + count}`;
}
