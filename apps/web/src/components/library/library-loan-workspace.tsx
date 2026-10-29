import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, RotateCcw } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { DashboardDataTable } from "@/components/dashboard/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

type LibraryLoan = {
  id: string;
  itemId: string;
  copyId: string;
  studentId: string | null;
  staffId: string | null;
  checkedOutAt: string;
  dueOn: string;
  returnedAt: string | null;
  renewalCount: number;
};

type LibraryItem = {
  id: string;
  title: string;
  archivedAt: string | null;
};

type LibraryCopy = {
  id: string;
  itemId: string;
  archivedAt: string | null;
};

type LoanFilters = {
  itemId?: string;
  studentId?: string;
  staffId?: string;
};

const pageSize = 25;
const chooserPageSize = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(loan: LibraryLoan) {
  return loan.returnedAt === null && loan.dueOn < new Date().toISOString().slice(0, 10);
}

function checkoutError(error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error ? error.message : "The book could not be issued.";
  }
  switch (error.code) {
    case "COPY_UNAVAILABLE":
      return "This copy is already on loan. Select another copy.";
    case "COPY_RESERVED":
      return "This copy is reserved for another borrower. Select another copy or the reservation's borrower.";
    case "POLICY_NOT_CONFIGURED":
      return "The school Library policy must be configured before books can be issued.";
    case "INVALID_RELATIONSHIP":
      return "The borrower must be one active Student or Staff profile in this school.";
    case "MAX_ACTIVE_LOANS":
      return "The borrower has reached the active-loan limit configured by the school.";
    case "NOT_FOUND":
      return "The borrower or active physical copy could not be found in this school.";
    default:
      return error.message;
  }
}

function lifecycleError(action: "return" | "renew", error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error ? error.message : "The loan could not be updated.";
  }
  if (error.status === 403) return "The server denied this loan-management action.";
  if (error.code === "RECORD_NOT_FOUND") {
    return "This loan is no longer active. Refresh the list to see its current state.";
  }
  if (error.code === "POLICY_NOT_CONFIGURED") {
    return "The school Library policy must be configured before this action.";
  }
  if (error.code === "RENEWAL_LIMIT_REACHED") {
    return "This loan has reached the renewal limit configured by the school.";
  }
  return (
    error.message ||
    (action === "return" ? "The loan could not be returned." : "The loan could not be renewed.")
  );
}

export function LibraryLoanWorkspace({
  canReadLoans,
  canManageLoans,
  canReadCatalog,
}: {
  canReadLoans: boolean;
  canManageLoans: boolean;
  canReadCatalog: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [returnedOffset, setReturnedOffset] = useState(0);
  const [borrowerKind, setBorrowerKind] = useState<"student" | "staff">("student");
  const [borrowerIdInput, setBorrowerIdInput] = useState("");
  const [itemIdInput, setItemIdInput] = useState("");
  const [filters, setFilters] = useState<LoanFilters>({});
  const [filterError, setFilterError] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{
    action: "return" | "renew";
    loan: LibraryLoan;
  } | null>(null);

  const loansQuery = useSchoolList<LibraryLoan>(
    "/library/loans",
    { limit: pageSize, offset, status: "ACTIVE", ...filters },
    { enabled: canReadLoans },
  );
  const returnedLoansQuery = useSchoolList<LibraryLoan>(
    "/library/loans",
    { limit: pageSize, offset: returnedOffset, status: "RETURNED", ...filters },
    { enabled: canReadLoans },
  );
  const loans = loansQuery.data?.data ?? [];
  const total = loansQuery.data?.meta.total ?? 0;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const borrowerId = borrowerIdInput.trim();
    const itemId = itemIdInput.trim();
    if (borrowerId && !uuidPattern.test(borrowerId)) {
      setFilterError("Enter a valid borrower profile UUID.");
      return;
    }
    if (itemId && !uuidPattern.test(itemId)) {
      setFilterError("Enter a valid catalog item UUID.");
      return;
    }
    setFilterError("");
    setOffset(0);
    setReturnedOffset(0);
    setFilters({
      ...(itemId ? { itemId } : {}),
      ...(borrowerId && borrowerKind === "student" ? { studentId: borrowerId } : {}),
      ...(borrowerId && borrowerKind === "staff" ? { staffId: borrowerId } : {}),
    });
  }

  function clearFilters() {
    setBorrowerIdInput("");
    setItemIdInput("");
    setFilterError("");
    setFilters({});
    setOffset(0);
    setReturnedOffset(0);
  }

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Active loans</CardTitle>
            <p className="text-sm text-muted-foreground">
              Loan responses include borrower IDs only. Book titles appear when catalog-read access
              is available; loan dates and lifecycle actions remain server-controlled.
            </p>
          </div>
          {canManageLoans && (
            <Button
              className="w-full shrink-0 sm:w-auto"
              onClick={() => setIssueOpen(true)}
              size="sm"
            >
              <Plus aria-hidden="true" />
              Issue book
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {canReadLoans ? (
            <>
              <form
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,0.8fr)_minmax(14rem,1fr)_minmax(14rem,1fr)_auto]"
                onSubmit={applyFilters}
              >
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Borrower type</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setBorrowerKind(event.target.value as "student" | "staff")}
                    value={borrowerKind}
                  >
                    <option value="student">Student</option>
                    <option value="staff">Staff</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Borrower profile ID
                  </span>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setBorrowerIdInput(event.target.value)}
                    placeholder="UUID"
                    value={borrowerIdInput}
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Catalog item ID</span>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setItemIdInput(event.target.value)}
                    placeholder="UUID"
                    value={itemIdInput}
                  />
                </label>
                <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
                  <Button className="flex-1 xl:flex-none" size="sm" type="submit" variant="outline">
                    Filter
                  </Button>
                  <Button
                    className="flex-1 xl:flex-none"
                    onClick={clearFilters}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Clear
                  </Button>
                </div>
              </form>
              {filterError && (
                <p className="text-sm text-destructive" role="alert">
                  {filterError}
                </p>
              )}
              {loansQuery.isPending || loansQuery.isFetching ? (
                <LoadingState className="min-h-32" message="Loading active loans..." />
              ) : loansQuery.error instanceof ApiClientError && loansQuery.error.status === 403 ? (
                <UnauthorizedState
                  description="The server denied access to school loan records."
                  title="Loan history access unavailable"
                />
              ) : loansQuery.isError ? (
                <ErrorState onRetry={() => void loansQuery.refetch()} />
              ) : loans.length === 0 ? (
                <EmptyState
                  className="min-h-32 justify-center"
                  description={
                    Object.keys(filters).length
                      ? "No active loans match these filters."
                      : "There are no active loans in this school."
                  }
                  title={Object.keys(filters).length ? "No matching loans" : "No active loans"}
                />
              ) : (
                <>
                  <DashboardDataTable
                    caption="Active school library loans"
                    headers={[
                      "Book",
                      "Copy ID",
                      "Borrower",
                      "Due date",
                      "Status",
                      "Checked out",
                      ...(canManageLoans ? ["Actions"] : []),
                    ]}
                  >
                    {loans.map((loan) => (
                      <tr className="border-t" key={loan.id}>
                        <td className="max-w-56 px-4 py-3">
                          <LibraryBookReference
                            canReadCatalog={canReadCatalog}
                            itemId={loan.itemId}
                          />
                        </td>
                        <td className="max-w-48 break-all px-4 py-3 font-mono text-xs">
                          {loan.copyId}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block">{loan.studentId ? "Student" : "Staff"}</span>
                          <span className="break-all font-mono text-xs text-muted-foreground">
                            {loan.studentId ?? loan.staffId}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{formatDate(loan.dueOn)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={isOverdue(loan) ? "default" : "secondary"}>
                            {isOverdue(loan) ? "Overdue" : "Active"}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {new Date(loan.checkedOutAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        {canManageLoans && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                aria-label={`Return loan ${loan.id}`}
                                disabled={loansQuery.isFetching}
                                onClick={() => setSelectedAction({ action: "return", loan })}
                                size="sm"
                                title={`Return loan ${loan.id}`}
                                variant="outline"
                              >
                                <RotateCcw aria-hidden="true" />
                                Return
                              </Button>
                              <Button
                                aria-label={`Renew loan ${loan.id}`}
                                disabled={loansQuery.isFetching}
                                onClick={() => setSelectedAction({ action: "renew", loan })}
                                size="sm"
                                title={`Renew loan ${loan.id}`}
                                variant="outline"
                              >
                                <RefreshCw aria-hidden="true" />
                                Renew
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </DashboardDataTable>
                  <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p aria-live="polite" className="text-sm text-muted-foreground">
                      Showing {offset + 1}-{Math.min(offset + loans.length, total)} of {total}{" "}
                      active loans
                    </p>
                    <div className="flex gap-2">
                      <Button
                        disabled={offset === 0}
                        onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
                        size="sm"
                        variant="outline"
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={offset + pageSize >= total}
                        onClick={() => setOffset((value) => value + pageSize)}
                        size="sm"
                        variant="outline"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Loan-reading permission is not available. Issue actions remain subject to the server's
              separate loan-management permission.
            </p>
          )}
        </CardContent>
      </Card>

      {canReadLoans && (
        <ReturnedLoanHistory
          canReadCatalog={canReadCatalog}
          offset={returnedOffset}
          onOffsetChange={setReturnedOffset}
          query={returnedLoansQuery}
        />
      )}

      {issueOpen && canManageLoans && (
        <IssueLibraryLoanDialog
          canReadCatalog={canReadCatalog}
          onClose={() => setIssueOpen(false)}
        />
      )}
      {selectedAction && canManageLoans && (
        <LibraryLoanLifecycleDialog
          action={selectedAction.action}
          loan={selectedAction.loan}
          loanListReady={Boolean(loansQuery.data) && !loansQuery.isError && !loansQuery.isFetching}
          loanListFetching={loansQuery.isFetching}
          loanListPermissionDenied={
            loansQuery.error instanceof ApiClientError && loansQuery.error.status === 403
          }
          onRetryLoanList={() => void loansQuery.refetch()}
          onClose={() => setSelectedAction(null)}
        />
      )}
    </>
  );
}

function ReturnedLoanHistory({
  canReadCatalog,
  offset,
  onOffsetChange,
  query,
}: {
  canReadCatalog: boolean;
  offset: number;
  onOffsetChange(offset: number): void;
  query: ReturnType<typeof useSchoolList<LibraryLoan>>;
}) {
  const loans = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Returned loan history</CardTitle>
        <p className="text-sm text-muted-foreground">
          Returned records and dates from the school loan API. Filters above apply here too.
        </p>
      </CardHeader>
      <CardContent>
        {query.isPending || query.isFetching ? (
          <LoadingState className="min-h-32" message="Loading returned loan history..." />
        ) : query.error instanceof ApiClientError && query.error.status === 403 ? (
          <UnauthorizedState
            description="The server denied access to returned school loan records."
            title="Returned history access unavailable"
          />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : loans.length === 0 ? (
          <EmptyState
            className="min-h-32 justify-center"
            description="No returned loans match the current filters."
            title="No returned loans"
          />
        ) : (
          <>
            <DashboardDataTable
              caption="Returned school library loans"
              headers={[
                "Loan ID",
                "Book",
                "Copy ID",
                "Borrower",
                "Due date",
                "Status",
                "Returned at",
              ]}
            >
              {loans.map((loan) => (
                <tr className="border-t" key={loan.id}>
                  <td className="max-w-40 break-all px-4 py-3 font-mono text-xs">{loan.id}</td>
                  <td className="max-w-56 px-4 py-3">
                    <LibraryBookReference canReadCatalog={canReadCatalog} itemId={loan.itemId} />
                  </td>
                  <td className="max-w-40 break-all px-4 py-3 font-mono text-xs">{loan.copyId}</td>
                  <td className="px-4 py-3">
                    <span className="block">{loan.studentId ? "Student" : "Staff"}</span>
                    <span className="break-all font-mono text-xs text-muted-foreground">
                      {loan.studentId ?? loan.staffId}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(loan.dueOn)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">Returned</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {loan.returnedAt
                      ? new Date(loan.returnedAt).toLocaleString("en-GB")
                      : "Unavailable"}
                  </td>
                </tr>
              ))}
            </DashboardDataTable>
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Showing {offset + 1}-{Math.min(offset + loans.length, total)} of {total} returned
                loans
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={offset === 0}
                  onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
                  size="sm"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={offset + pageSize >= total}
                  onClick={() => onOffsetChange(offset + pageSize)}
                  size="sm"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LibraryBookReference({
  canReadCatalog,
  itemId,
}: {
  canReadCatalog: boolean;
  itemId: string;
}) {
  const query = useSchoolData<{ data: LibraryItem }>(
    `/library/catalog/items/${encodeURIComponent(itemId)}`,
    {},
    { enabled: canReadCatalog },
  );
  const title = !canReadCatalog
    ? "Catalog details unavailable"
    : query.isPending
      ? "Loading book title..."
      : query.isError
        ? query.error instanceof ApiClientError && query.error.status === 403
          ? "Book title access denied"
          : "Book title unavailable"
        : (query.data?.data.title ?? "Book title unavailable");
  const canRetry =
    query.isError &&
    (!(query.error instanceof ApiClientError) ||
      query.error.status === 0 ||
      query.error.status >= 500);

  return (
    <div className="space-y-1">
      <span className="block font-medium">{title}</span>
      <span className="block break-all font-mono text-xs text-muted-foreground">
        Catalog item ID: {itemId}
      </span>
      {canRetry && (
        <Button onClick={() => void query.refetch()} size="sm" variant="outline">
          Retry title
        </Button>
      )}
    </div>
  );
}

function LibraryLoanLifecycleDialog({
  action,
  loan,
  loanListReady,
  loanListFetching,
  loanListPermissionDenied,
  onRetryLoanList,
  onClose,
}: {
  action: "return" | "renew";
  loan: LibraryLoan;
  loanListReady: boolean;
  loanListFetching: boolean;
  loanListPermissionDenied: boolean;
  onRetryLoanList(): void;
  onClose(): void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [updatedLoan, setUpdatedLoan] = useState<LibraryLoan | null>(null);
  const [actionError, setActionError] = useState("");
  const submissionLock = useRef(false);
  const isReturn = action === "return";

  const lifecycleMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("Select a school before updating a loan.");
      const endpoint = isReturn ? "return" : "renew";
      const response = await apiRequest<{ data: LibraryLoan }>(
        `/schools/${encodeURIComponent(school.id)}/library/loans/${encodeURIComponent(loan.id)}/${endpoint}`,
        { method: "POST" },
      );
      return response.data;
    },
    onSuccess: async (result) => {
      if (!school?.id) return;
      submissionLock.current = false;
      setActionError("");
      setUpdatedLoan(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["school-data", school.id, "/library/loans"] }),
        queryClient.invalidateQueries({
          queryKey: ["school-data", school.id, "/library/reports/loans"],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "school-data" &&
            query.queryKey[1] === school.id &&
            typeof query.queryKey[2] === "string" &&
            query.queryKey[2].startsWith("/library/catalog/items/") &&
            query.queryKey[2].endsWith("/copies"),
        }),
      ]);
    },
    onError: (error) => {
      submissionLock.current = false;
      setActionError(lifecycleError(action, error));
    },
  });

  function confirmAction() {
    setActionError("");
    if (submissionLock.current || lifecycleMutation.isPending || updatedLoan) return;
    if (!loanListReady) {
      setActionError("Reload the active loan list before recording this action.");
      return;
    }
    submissionLock.current = true;
    lifecycleMutation.mutate();
  }

  return (
    <Dialog onOpenChange={(open) => !open && !lifecycleMutation.isPending && onClose()} open>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {updatedLoan
              ? isReturn
                ? "Book returned"
                : "Loan renewed"
              : isReturn
                ? "Confirm return"
                : "Confirm renewal"}
          </DialogTitle>
          <DialogDescription>
            {updatedLoan
              ? "The details below were returned by the Library API."
              : isReturn
                ? "Return this active loan? The server will determine whether the return can be completed and record its date."
                : "Renew this active loan? The server will apply the configured policy and enforce the renewal limit."}
          </DialogDescription>
        </DialogHeader>
        {updatedLoan ? (
          <div className="space-y-4 py-2">
            <p
              className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
              role="status"
            >
              {isReturn ? "Return confirmed by the server." : "Renewal confirmed by the server."}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <ReceiptField label="Loan ID" value={updatedLoan.id} />
              <ReceiptField
                label="Loan status"
                value={updatedLoan.returnedAt ? "Returned" : "Active"}
              />
              {isReturn ? (
                <ReceiptField
                  label="Returned at"
                  value={
                    updatedLoan.returnedAt
                      ? new Date(updatedLoan.returnedAt).toLocaleString("en-GB")
                      : "Not returned by server"
                  }
                />
              ) : (
                <>
                  <ReceiptField label="Previous due date" value={formatDate(loan.dueOn)} />
                  <ReceiptField label="Updated due date" value={formatDate(updatedLoan.dueOn)} />
                  <ReceiptField label="Renewal count" value={String(updatedLoan.renewalCount)} />
                </>
              )}
            </dl>
            <DialogFooter>
              <Button onClick={onClose} type="button">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <dl className="grid gap-3 sm:grid-cols-2">
              <ReceiptField label="Loan ID" value={loan.id} />
              <ReceiptField label="Copy ID" value={loan.copyId} />
              <ReceiptField label="Current due date" value={formatDate(loan.dueOn)} />
              <ReceiptField
                label="Borrower profile ID"
                value={loan.studentId ?? loan.staffId ?? "Unavailable"}
              />
            </dl>
            {!loanListReady &&
              (loanListPermissionDenied ? (
                <UnauthorizedState
                  description="The server denied access to active loan records in the current school context."
                  title="Loan history access denied"
                />
              ) : loanListFetching ? (
                <LoadingState className="min-h-20" message="Refreshing active loan data..." />
              ) : (
                <ErrorState
                  message="Active loan data could not be verified. Reload it before recording a return or renewal."
                  onRetry={onRetryLoanList}
                />
              ))}
            {actionError && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {actionError}
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                disabled={lifecycleMutation.isPending}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={lifecycleMutation.isPending || !loanListReady}
                onClick={confirmAction}
                type="button"
              >
                {lifecycleMutation.isPending
                  ? isReturn
                    ? "Returning..."
                    : "Renewing..."
                  : isReturn
                    ? "Confirm return"
                    : "Confirm renewal"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IssueLibraryLoanDialog({
  canReadCatalog,
  onClose,
}: {
  canReadCatalog: boolean;
  onClose: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [borrowerKind, setBorrowerKind] = useState<"student" | "staff">("student");
  const [borrowerId, setBorrowerId] = useState("");
  const [copyId, setCopyId] = useState("");
  const [itemId, setItemId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemOffset, setItemOffset] = useState(0);
  const [copyOffset, setCopyOffset] = useState(0);
  const [formError, setFormError] = useState("");
  const [confirmedLoan, setConfirmedLoan] = useState<LibraryLoan | null>(null);
  const submissionLock = useRef(false);

  const itemsQuery = useSchoolList<LibraryItem>(
    "/library/catalog/items",
    { limit: chooserPageSize, offset: itemOffset, search: itemSearch.trim() || undefined },
    { enabled: canReadCatalog },
  );
  const copiesPath = itemId
    ? `/library/catalog/items/${encodeURIComponent(itemId)}/copies`
    : "/library/catalog/items/unknown/copies";
  const copiesQuery = useSchoolList<LibraryCopy>(
    copiesPath,
    { limit: chooserPageSize, offset: copyOffset },
    { enabled: canReadCatalog && itemId !== "" },
  );
  const selectedItem = itemsQuery.data?.data.find((item) => item.id === itemId && !item.archivedAt);
  const selectedCopy = copiesQuery.data?.data.find(
    (copy) => copy.id === copyId && !copy.archivedAt,
  );
  const catalogSelectionReady =
    !canReadCatalog ||
    (Boolean(selectedItem) &&
      !itemsQuery.isError &&
      !itemsQuery.isFetching &&
      Boolean(selectedCopy) &&
      !copiesQuery.isError &&
      !copiesQuery.isFetching);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("Select a school before issuing a book.");
      if (!catalogSelectionReady) {
        throw new Error("Reload the catalog and select an active physical copy before issuing.");
      }
      const body = {
        copyId: copyId.trim(),
        ...(borrowerKind === "student"
          ? { studentId: borrowerId.trim() }
          : { staffId: borrowerId.trim() }),
      };
      const response = await apiRequest<{ data: LibraryLoan }>(
        `/schools/${encodeURIComponent(school.id)}/library/loans`,
        { method: "POST", body },
      );
      return response.data;
    },
    onSuccess: async (loan) => {
      if (!school?.id) return;
      submissionLock.current = false;
      setConfirmedLoan(loan);
      setFormError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["school-data", school.id, "/library/loans"] }),
        queryClient.invalidateQueries({
          queryKey: ["school-data", school.id, "/library/reports/loans"],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "school-data" &&
            query.queryKey[1] === school.id &&
            typeof query.queryKey[2] === "string" &&
            query.queryKey[2].startsWith("/library/catalog/items/") &&
            query.queryKey[2].endsWith("/copies"),
        }),
      ]);
    },
    onError: (error) => {
      submissionLock.current = false;
      setFormError(checkoutError(error));
    },
  });

  function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!uuidPattern.test(borrowerId.trim())) {
      setFormError("Enter a valid Student or Staff profile UUID.");
      return;
    }
    if (!uuidPattern.test(copyId.trim())) {
      setFormError("Select a physical copy or enter a valid copy UUID.");
      return;
    }
    if (!catalogSelectionReady) {
      setFormError("Reload the catalog and select an active physical copy before issuing.");
      return;
    }
    if (submissionLock.current || checkoutMutation.isPending) return;
    submissionLock.current = true;
    checkoutMutation.mutate();
  }

  return (
    <Dialog onOpenChange={(open) => !open && !checkoutMutation.isPending && onClose()} open>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue a book</DialogTitle>
          <DialogDescription>
            Choose exactly one Student or Staff profile ID and a physical copy. The server confirms
            eligibility and availability. The due date comes from the configured school Library
            policy.
          </DialogDescription>
        </DialogHeader>
        {confirmedLoan ? (
          <div className="space-y-4 py-2">
            <p
              className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
              role="status"
            >
              Book issued successfully. Details below were returned by the server.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <ReceiptField label="Loan ID" value={confirmedLoan.id} />
              <ReceiptField label="Catalog item ID" value={confirmedLoan.itemId} />
              <ReceiptField label="Copy ID" value={confirmedLoan.copyId} />
              <ReceiptField
                label={confirmedLoan.studentId ? "Student profile ID" : "Staff profile ID"}
                value={confirmedLoan.studentId ?? confirmedLoan.staffId ?? "Unavailable"}
              />
              <ReceiptField
                label="Checked out"
                value={new Date(confirmedLoan.checkedOutAt).toLocaleString("en-GB")}
              />
              <ReceiptField label="Due date" value={formatDate(confirmedLoan.dueOn)} />
            </dl>
            <DialogFooter>
              <Button onClick={onClose} type="button">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4 py-2" onSubmit={submitCheckout}>
            <div className="grid gap-3 sm:grid-cols-[minmax(10rem,0.55fr)_minmax(0,1fr)]">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Borrower profile type
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setBorrowerKind(event.target.value as "student" | "staff")}
                  value={borrowerKind}
                >
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Borrower profile UUID
                </span>
                <input
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setBorrowerId(event.target.value)}
                  placeholder="UUID returned by the school's profile API"
                  required
                  value={borrowerId}
                />
              </label>
            </div>
            {canReadCatalog ? (
              <>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Search catalog title
                  </span>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={120}
                    onChange={(event) => {
                      setItemSearch(event.target.value);
                      setItemOffset(0);
                      setItemId("");
                      setCopyId("");
                    }}
                    placeholder="Search titles"
                    type="search"
                    value={itemSearch}
                  />
                </label>
                {itemsQuery.isPending || itemsQuery.isFetching ? (
                  <LoadingState className="min-h-20" message="Loading titles..." />
                ) : itemsQuery.isError ? (
                  itemsQuery.error instanceof ApiClientError && itemsQuery.error.status === 403 ? (
                    <UnauthorizedState
                      description="The server denied access to catalog titles in the current school context."
                      title="Catalog access denied"
                    />
                  ) : (
                    <ErrorState
                      message="Titles could not be loaded. Retry before issuing a book."
                      onRetry={() => void itemsQuery.refetch()}
                    />
                  )
                ) : (
                  <>
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Book title</span>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(event) => {
                          setItemId(event.target.value);
                          setCopyId("");
                          setCopyOffset(0);
                        }}
                        value={itemId}
                      >
                        <option value="">Select a title</option>
                        {(itemsQuery.data?.data ?? [])
                          .filter((item) => !item.archivedAt)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    {itemsQuery.data && itemsQuery.data.meta.total > chooserPageSize && (
                      <ChooserPagination
                        offset={itemOffset}
                        pageSize={chooserPageSize}
                        total={itemsQuery.data.meta.total}
                        onOffsetChange={(next) => {
                          setItemOffset(next);
                          setItemId("");
                          setCopyId("");
                        }}
                      />
                    )}
                    {itemId &&
                      (copiesQuery.isPending || copiesQuery.isFetching ? (
                        <LoadingState className="min-h-20" message="Loading physical copies..." />
                      ) : copiesQuery.isError ? (
                        copiesQuery.error instanceof ApiClientError &&
                        copiesQuery.error.status === 403 ? (
                          <UnauthorizedState
                            description="The server denied access to physical copies in the current school context."
                            title="Physical copy access denied"
                          />
                        ) : (
                          <ErrorState
                            message="Physical copies could not be loaded."
                            onRetry={() => void copiesQuery.refetch()}
                          />
                        )
                      ) : (
                        <>
                          <label className="block space-y-1.5 text-sm">
                            <span className="text-xs font-medium text-muted-foreground">
                              Active copy record
                            </span>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onChange={(event) => setCopyId(event.target.value)}
                              value={copyId}
                            >
                              <option value="">Select a physical copy</option>
                              {(copiesQuery.data?.data ?? [])
                                .filter((copy) => !copy.archivedAt)
                                .map((copy) => (
                                  <option key={copy.id} value={copy.id}>
                                    {copy.id}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {copiesQuery.data &&
                            !copiesQuery.data.data.some((copy) => !copy.archivedAt) && (
                              <p className="text-sm text-muted-foreground">
                                No active copy records exist on this page.
                              </p>
                            )}
                          <p className="text-xs text-muted-foreground">
                            Copy records do not include availability. The server checks active loans
                            and reservations when issuing.
                          </p>
                          {copiesQuery.data && copiesQuery.data.meta.total > chooserPageSize && (
                            <ChooserPagination
                              offset={copyOffset}
                              pageSize={chooserPageSize}
                              total={copiesQuery.data.meta.total}
                              onOffsetChange={(next) => {
                                setCopyOffset(next);
                                setCopyId("");
                              }}
                            />
                          )}
                        </>
                      ))}
                  </>
                )}
              </>
            ) : (
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Physical copy UUID
                </span>
                <input
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setCopyId(event.target.value)}
                  placeholder="Copy UUID"
                  required
                  value={copyId}
                />
              </label>
            )}
            {formError && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                disabled={checkoutMutation.isPending}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={checkoutMutation.isPending || !catalogSelectionReady} type="submit">
                {checkoutMutation.isPending ? "Issuing..." : "Issue book"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}

function ChooserPagination({
  offset,
  pageSize: size,
  total,
  onOffsetChange,
}: {
  offset: number;
  pageSize: number;
  total: number;
  onOffsetChange(offset: number): void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">
        Showing {offset + 1}-{Math.min(offset + size, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - size))}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={offset + size >= total}
          onClick={() => onOffsetChange(offset + size)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
