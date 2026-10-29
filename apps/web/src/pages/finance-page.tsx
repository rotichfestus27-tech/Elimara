import { WalletCards } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/app/auth-provider";
import {
  DashboardDataTable,
  DashboardPageHeading,
} from "@/components/dashboard/dashboard-primitives";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { FeeStructureEditor } from "@/components/finance/fee-structure-editor";
import { PaymentWorkspace } from "@/components/finance/payment-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import { ApiClientError, downloadReport } from "@/lib/api/client";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";
import { formatKes } from "@/lib/finance-format";

const pageSize = 25;

type FeeStructure = {
  id: string;
  name: string;
  academicYearId: string;
  termId: string;
  classId: string;
  status: "ACTIVE" | "INACTIVE";
  items: Array<{ id: string; name: string; amount: string }>;
};

type FinancialAccount = {
  accountId: string;
  studentId: string;
  admissionNumber: string;
  studentGivenName: string;
  studentFamilyName: string;
  totalPayments: string;
  outstandingCharges: string;
  unappliedCredit: string;
  balanceDue: string;
  netBalance: string;
};

type FinanceSection = "structures" | "accounts" | "payments";

type FinanceReport = {
  from: string;
  to: string;
  paymentsReceived: string;
  paymentCount: number;
  chargeCount: number;
  outstandingCharges: string;
  unappliedCredit: string;
  reconciliationExceptionCount: number;
};

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function FinancePage() {
  const { school } = useAuth();
  const permissions = new Set(school?.permissions ?? []);
  const canReadStructures = permissions.has("finance.fees.read");
  const canManageStructures = permissions.has("finance.fees.manage");
  const canReadAccounts = permissions.has("finance.accounts.read");
  const canReadPayments = permissions.has("finance.payments.read");
  const canRecordPayments = permissions.has("finance.payments.record");
  const canManageAllocations = permissions.has("finance.adjustments.manage");
  const canManageRefunds = permissions.has("finance.refunds.manage");
  const canManageAdjustments = permissions.has("finance.adjustments.manage");
  const canReconcilePayments = permissions.has("finance.payments.reconcile");
  const canReadStudents = permissions.has("students.profile.read");
  const canOpenPayments =
    canReadPayments ||
    canRecordPayments ||
    canManageRefunds ||
    canManageAdjustments ||
    canReconcilePayments;
  const canReadReport = permissions.has("finance.reports.read");
  const canExportFinanceReport =
    canReadReport &&
    permissions.has("reports.finance.read") &&
    permissions.has("reports.exports.generate");
  const [section, setSection] = useState<FinanceSection>(
    canReadAccounts ? "accounts" : "structures",
  );
  const activeSection: FinanceSection =
    section === "payments" && canOpenPayments
      ? "payments"
      : section === "accounts" && canReadAccounts
        ? "accounts"
        : canReadStructures || canManageStructures
          ? "structures"
          : canReadAccounts
            ? "accounts"
            : "payments";
  const [to, setTo] = useState(() => localDate(new Date()));
  const [structureOffset, setStructureOffset] = useState(0);
  const [accountOffset, setAccountOffset] = useState(0);
  const [feeStructureMessage, setFeeStructureMessage] = useState("");
  const [exportingReport, setExportingReport] = useState(false);
  const [reportExportError, setReportExportError] = useState<Error | null>(null);
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return localDate(date);
  });
  const periodError = financePeriodError(from, to);
  const invalidPeriod = periodError !== null;
  const report = useSchoolData<{ data: FinanceReport }>(
    "/finance/reports/summary",
    { from, to },
    { enabled: canReadReport && !invalidPeriod },
  );

  async function exportFinanceReport() {
    if (!school || !canExportFinanceReport || invalidPeriod || exportingReport) return;
    const query = new URLSearchParams({ from, to });
    setReportExportError(null);
    setExportingReport(true);
    try {
      await downloadReport(
        `/schools/${encodeURIComponent(school.id)}/reports/finance/export.csv?${query.toString()}`,
        "finance.csv",
      );
    } catch (error) {
      setReportExportError(
        error instanceof Error ? error : new Error("The finance report could not be exported."),
      );
    } finally {
      setExportingReport(false);
    }
  }
  const structures = useSchoolList<FeeStructure>(
    "/finance/fee-structures",
    {
      limit: pageSize,
      offset: structureOffset,
    },
    { enabled: canReadStructures && activeSection === "structures" },
  );
  const accounts = useSchoolList<FinancialAccount>(
    "/finance/accounts",
    {
      limit: pageSize,
      offset: accountOffset,
    },
    { enabled: canReadAccounts && activeSection === "accounts" },
  );

  if (
    !canReadStructures &&
    !canManageStructures &&
    !canReadAccounts &&
    !canOpenPayments &&
    !canReadReport
  ) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border p-8">
        <UnauthorizedState
          description="The server returned no finance read permissions for this school context."
          title="Finance access unavailable"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        eyebrow="School finance"
        title="Finance"
        description="Review permitted fee structures, student balances, payment records, and finance summaries. Payment entries are staff-reported manual records, not gateway confirmations."
      />

      {canReadReport && (
        <section aria-label="Finance summary" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold">Financial summary</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                API-reported collections and current balances. The period uses inclusive UTC dates;
                current balances reflect report execution.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span className="block">From</span>
                <input
                  aria-label="Finance summary from"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  onChange={(event) => setFrom(event.target.value)}
                  type="date"
                  value={from}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span className="block">To</span>
                <input
                  aria-label="Finance summary to"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  onChange={(event) => setTo(event.target.value)}
                  type="date"
                  value={to}
                />
              </label>
              <Button
                disabled={invalidPeriod}
                onClick={() => void report.refetch()}
                size="sm"
                variant="outline"
              >
                Refresh
              </Button>
              {canExportFinanceReport && (
                <Button
                  disabled={invalidPeriod || exportingReport}
                  onClick={() => void exportFinanceReport()}
                  size="sm"
                  variant="outline"
                >
                  {exportingReport ? "Generating CSV..." : "Download finance CSV"}
                </Button>
              )}
            </div>
          </div>
          {report.data && !report.isError && !invalidPeriod && (
            <p className="text-xs text-muted-foreground" role="note">
              Report period: {report.data.data.from} through {report.data.data.to} (inclusive UTC).
              CSV export uses the same dates and authoritative finance report source.
            </p>
          )}
          {invalidPeriod && (
            <p className="text-sm text-destructive" role="alert">
              {periodError}
            </p>
          )}
          {reportExportError instanceof ApiClientError && reportExportError.status === 403 ? (
            <UnauthorizedState
              description="The server denied finance report export access. Export requires reports.exports.generate, reports.finance.read, and finance.reports.read."
              title="Finance report export access denied"
            />
          ) : reportExportError ? (
            <ErrorState
              message={`The finance report could not be exported. ${reportExportError.message}`}
              onRetry={() => void exportFinanceReport()}
            />
          ) : null}
          {invalidPeriod ? null : report.isPending ? (
            <LoadingState className="min-h-32" message="Loading financial summary..." />
          ) : report.isError && isPermissionDenied(report.error) ? (
            <UnauthorizedState
              description="The server denied access to the financial summary for this school."
              title="Financial summary access denied"
            />
          ) : report.isError ? (
            <ErrorState
              message="The financial summary could not be loaded."
              onRetry={() => void report.refetch()}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryCard
                item={{
                  title: "Payments received",
                  description: "Collections during selected period",
                  icon: WalletCards,
                  value: formatKes(report.data.data.paymentsReceived),
                  subtext: `${report.data.data.paymentCount} payments in the period`,
                }}
              />
              <SummaryCard
                item={{
                  title: "Charges posted",
                  description: "Charges posted during selected period",
                  icon: WalletCards,
                  value: report.data.data.chargeCount,
                }}
              />
              <SummaryCard
                item={{
                  title: "Outstanding charges",
                  description: "Current outstanding balance",
                  icon: WalletCards,
                  value: formatKes(report.data.data.outstandingCharges),
                  subtext: "Current balance at report time",
                }}
              />
              <SummaryCard
                item={{
                  title: "Unapplied credit",
                  description: "Current unallocated payment amount",
                  icon: WalletCards,
                  value: formatKes(report.data.data.unappliedCredit),
                  subtext: "Current balance at report time",
                }}
              />
              <SummaryCard
                item={{
                  title: "Reconciliation exceptions",
                  description: "Exceptions observed during selected period",
                  icon: WalletCards,
                  value: report.data.data.reconciliationExceptionCount,
                }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <Link className="text-primary underline-offset-4 hover:underline" to="/reports">
              Open authorized reports
            </Link>
          </p>
        </section>
      )}

      {(canReadAccounts || canReadStructures || canManageStructures || canOpenPayments) && (
        <nav aria-label="Finance records" className="flex gap-1 overflow-x-auto border-b">
          {canReadAccounts && (
            <button
              aria-pressed={activeSection === "accounts"}
              className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
                activeSection === "accounts"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
              onClick={() => setSection("accounts")}
              type="button"
            >
              Student accounts
            </button>
          )}
          {(canReadStructures || canManageStructures) && (
            <button
              aria-pressed={activeSection === "structures"}
              className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
                activeSection === "structures"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
              onClick={() => setSection("structures")}
              type="button"
            >
              Fee structures
            </button>
          )}
          {canOpenPayments && (
            <button
              aria-pressed={activeSection === "payments"}
              className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
                activeSection === "payments"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
              onClick={() => setSection("payments")}
              type="button"
            >
              Payments
            </button>
          )}
        </nav>
      )}

      {(canReadAccounts || canReadStructures || canManageStructures || canOpenPayments) && (
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-4 sm:p-5">
            {activeSection === "payments" ? (
              <PaymentWorkspace
                key={school?.id ?? "no-school"}
                canManageAdjustments={canManageAdjustments}
                canManageAllocations={canManageAllocations}
                canManageRefunds={canManageRefunds}
                canReconcilePayments={canReconcilePayments}
                canReadAccounts={canReadAccounts}
                canReadPayments={canReadPayments}
                canReadStudents={canReadStudents}
                canRecordPayments={canRecordPayments}
              />
            ) : (
              activeSection === "structures" &&
              canManageStructures && (
                <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Manage fee structures</h3>
                    <p className="text-sm text-muted-foreground">
                      Create class-specific structures from active academic configuration.
                    </p>
                    {feeStructureMessage && (
                      <p className="mt-1 text-sm text-green-700" role="status">
                        {feeStructureMessage}
                      </p>
                    )}
                  </div>
                  <FeeStructureEditor
                    key={school?.id ?? "no-school"}
                    onSaved={() => {
                      setStructureOffset(0);
                      setFeeStructureMessage("Fee structure created successfully.");
                    }}
                  />
                </div>
              )
            )}
            {activeSection === "structures" ? (
              !canReadStructures ? (
                <UnauthorizedState
                  description="You can create fee structures, but listing them requires the separate finance.fees.read permission."
                  title="Fee structure list access unavailable"
                />
              ) : structures.isPending ? (
                <LoadingState className="min-h-32" message="Loading fee structures..." />
              ) : structures.isError ? (
                <FinanceRequestError
                  error={structures.error}
                  message="Fee structures could not be loaded."
                  onRetry={() => void structures.refetch()}
                />
              ) : structures.data.data.length === 0 ? (
                <EmptyState
                  className="min-h-36 justify-center"
                  description="No fee structures were returned for this school."
                  title="No fee structures"
                />
              ) : (
                <>
                  <DashboardDataTable
                    caption="School fee structures"
                    headers={["Fee structure", "Academic year", "Term", "Class", "Items", "Status"]}
                  >
                    {structures.data.data.map((item) => (
                      <tr className="border-t" key={item.id}>
                        <th className="px-4 py-3 text-left font-medium" scope="row">
                          {item.name}
                        </th>
                        <td className="px-4 py-3">{item.academicYearId}</td>
                        <td className="px-4 py-3">{item.termId}</td>
                        <td className="px-4 py-3">{item.classId}</td>
                        <td className="px-4 py-3">
                          <ul className="space-y-1">
                            {item.items.map((feeItem) => (
                              <li
                                className="flex flex-wrap justify-between gap-x-3"
                                key={feeItem.id}
                              >
                                <span>{feeItem.name}</span>
                                <span className="font-medium tabular-nums">
                                  {formatKes(feeItem.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-4 py-3">{item.status.toLowerCase()}</td>
                      </tr>
                    ))}
                  </DashboardDataTable>
                  <p className="text-xs text-muted-foreground">
                    Showing {pageRange(structureOffset, structures.data.data.length)} of{" "}
                    {structures.data.meta.total} fee structures.
                  </p>
                  <FinancePagination
                    count={structures.data.data.length}
                    offset={structureOffset}
                    onNext={() => setStructureOffset((offset) => offset + pageSize)}
                    onPrevious={() =>
                      setStructureOffset((offset) => Math.max(0, offset - pageSize))
                    }
                    total={structures.data.meta.total}
                  />
                </>
              )
            ) : accounts.isPending ? (
              <LoadingState className="min-h-32" message="Loading student accounts..." />
            ) : accounts.isError ? (
              <FinanceRequestError
                error={accounts.error}
                message="Student accounts could not be loaded."
                onRetry={() => void accounts.refetch()}
              />
            ) : accounts.data.data.length === 0 ? (
              <EmptyState
                className="min-h-36 justify-center"
                description="No financial accounts were returned for this school."
                title="No financial accounts"
              />
            ) : (
              <>
                <DashboardDataTable
                  caption="School student financial accounts"
                  headers={[
                    "Admission number",
                    "Student",
                    "Payments recorded",
                    "Outstanding charges",
                    "Unapplied credit",
                    "Balance due",
                  ]}
                >
                  {accounts.data.data.map((account) => (
                    <tr className="border-t" key={account.accountId}>
                      <th className="px-4 py-3 text-left font-medium" scope="row">
                        {account.admissionNumber}
                      </th>
                      <td className="px-4 py-3">
                        {account.studentGivenName} {account.studentFamilyName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(account.totalPayments)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(account.outstandingCharges)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(account.unappliedCredit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatKes(account.balanceDue)}
                      </td>
                    </tr>
                  ))}
                </DashboardDataTable>
                <p className="text-xs text-muted-foreground">
                  Showing {pageRange(accountOffset, accounts.data.data.length)} of{" "}
                  {accounts.data.meta.total} student accounts.
                </p>
                <p className="text-xs text-muted-foreground">
                  Balance figures are returned by the finance API. This account list supports
                  pagination only; no student search or additional filters are available.
                </p>
                <FinancePagination
                  count={accounts.data.data.length}
                  offset={accountOffset}
                  onNext={() => setAccountOffset((offset) => offset + pageSize)}
                  onPrevious={() => setAccountOffset((offset) => Math.max(0, offset - pageSize))}
                  total={accounts.data.meta.total}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FinanceRequestError({
  error,
  message,
  onRetry,
}: {
  error: Error | null;
  message: string;
  onRetry: () => void;
}) {
  if (isPermissionDenied(error)) {
    return (
      <UnauthorizedState
        className="py-6"
        description="The server denied access to this financial data for the current school context."
        title="Finance data access denied"
      />
    );
  }

  return <ErrorState message={message} onRetry={onRetry} />;
}

function FinancePagination({
  count,
  offset,
  onNext,
  onPrevious,
  total,
}: {
  count: number;
  offset: number;
  onNext: () => void;
  onPrevious: () => void;
  total: number;
}) {
  if (total <= pageSize) return null;

  return (
    <nav aria-label="Finance records pagination" className="flex flex-wrap justify-end gap-2">
      <Button
        disabled={offset === 0}
        onClick={onPrevious}
        size="sm"
        type="button"
        variant="outline"
      >
        Previous
      </Button>
      <Button
        disabled={offset + count >= total}
        onClick={onNext}
        size="sm"
        type="button"
        variant="outline"
      >
        Next
      </Button>
    </nav>
  );
}

function pageRange(offset: number, count: number) {
  return count === 0 ? "0" : `${offset + 1}–${offset + count}`;
}

function isPermissionDenied(error: Error | null): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

function financePeriodError(from: string, to: string): string | null {
  if (!from || !to) return "Select both a start date and an end date.";
  if (from > to) return "The start date must be on or before the end date.";
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
    return "Enter a valid start date and end date.";
  }
  if ((toTime - fromTime) / 86_400_000 + 1 > 367) {
    return "The selected period cannot exceed 367 calendar days.";
  }
  return null;
}
