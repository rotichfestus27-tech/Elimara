import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, LibraryBig, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { SummaryCard, type SummaryCardItem } from "@/components/dashboard/summary-card";
import { LibraryCatalogWorkspace } from "@/components/library/library-catalog-workspace";
import { LibraryLoanWorkspace } from "@/components/library/library-loan-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import { ApiClientError } from "@/lib/api/client";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

type LibraryItem = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  categoryId: string | null;
  archivedAt: string | null;
};

type LibraryLoanSummary = {
  checkedOut: number;
  active: number;
  returned: number;
  overdue: number;
};

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function getDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: localDate(from), to: localDate(to) };
}

function validateReportRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return "Enter both report dates in YYYY-MM-DD format.";
  }
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
    return "Enter valid report dates.";
  }
  if (
    new Date(fromTime).toISOString().slice(0, 10) !== from ||
    new Date(toTime).toISOString().slice(0, 10) !== to
  ) {
    return "Enter valid report dates.";
  }
  if (from > to) return "The start date must be on or before the end date.";
  if ((toTime - fromTime) / 86_400_000 > 365) {
    return "The report range cannot exceed 366 calendar days.";
  }
  return null;
}

export function LibraryPage() {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const permissions = new Set(school?.permissions ?? []);
  const canReadCatalog = permissions.has("library.catalog.read");
  const canManageCatalog = permissions.has("library.catalog.manage");
  const canReadLoans = permissions.has("library.loans.read");
  const canManageLoans = permissions.has("library.loans.manage");
  const canReadReport = permissions.has("library.reports.read");
  const canReadLibrary =
    canReadCatalog || canManageCatalog || canReadLoans || canManageLoans || canReadReport;
  const [dateRange, setDateRange] = useState(getDateRange);
  const [reportDraft, setReportDraft] = useState(dateRange);
  const [reportFilterError, setReportFilterError] = useState("");
  const catalogQuery = useSchoolList<LibraryItem>(
    "/library/catalog/items",
    { limit: 25, offset: 0, includeArchived: "true" },
    { enabled: canReadCatalog },
  );
  const loanSummaryQuery = useSchoolList<{ id: string }>(
    "/library/loans",
    { limit: 25, offset: 0, status: "ACTIVE" },
    { enabled: canReadLoans },
  );
  const reportQuery = useSchoolData<{ data: LibraryLoanSummary }>(
    "/library/reports/loans",
    dateRange,
    { enabled: canReadReport },
  );

  function applyReportRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateReportRange(reportDraft.from, reportDraft.to);
    if (validationError) {
      setReportFilterError(validationError);
      return;
    }
    setReportFilterError("");
    setDateRange(reportDraft);
  }

  if (!canReadLibrary) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border p-8">
        <UnauthorizedState
          description="The server returned no library catalog, loan, or report permission for this school context. Contact an administrator if access is expected."
          title="Library access unavailable"
        />
      </div>
    );
  }

  const summary: SummaryCardItem[] = [
    ...(canReadCatalog
      ? [
          {
            title: "Catalog records",
            description: "All catalog titles, including archived records",
            icon: BookOpen,
            value: catalogQuery.isPending
              ? "Loading..."
              : catalogQuery.isError
                ? "Unavailable"
                : (catalogQuery.data?.meta.total ?? 0),
            subtext: catalogQuery.isError
              ? "Catalog count could not be loaded"
              : catalogQuery.data?.meta.total === 0
                ? "No catalog records yet"
                : "Total from the school catalog API",
          },
        ]
      : []),
    ...(canReadLoans
      ? [
          {
            title: "Active loans",
            description: "All currently unreturned loans",
            icon: LibraryBig,
            value: loanSummaryQuery.isPending
              ? "Loading..."
              : loanSummaryQuery.isError
                ? "Unavailable"
                : (loanSummaryQuery.data?.meta.total ?? 0),
            subtext: loanSummaryQuery.isError
              ? "Active loan count could not be loaded"
              : loanSummaryQuery.data?.meta.total === 0
                ? "No active loans"
                : "Total from the school loan list API",
          },
        ]
      : []),
    ...(canReadReport && reportQuery.data && !reportQuery.isError
      ? [
          {
            title: "Checkouts",
            description: `${dateRange.from} through ${dateRange.to}`,
            icon: LibraryBig,
            value: reportQuery.data.data.checkedOut,
            subtext: "Loans checked out in the selected inclusive date range",
          },
          {
            title: "Active loans in range",
            description: "Currently active among loans checked out in this window",
            icon: LibraryBig,
            value: reportQuery.data.data.active,
            subtext: "Current state for loans checked out in the selected date range",
          },
          {
            title: "Overdue loans",
            description: "Backend-reported overdue count for the checkout date window",
            icon: TriangleAlert,
            value: reportQuery.data.data.overdue,
            subtext: "Active loans in this range due before today's UTC date",
          },
          {
            title: "Returned loans",
            description: "Currently returned among loans checked out in this range",
            icon: LibraryBig,
            value: reportQuery.data.data.returned,
            subtext: "Current state for loans checked out in the selected date range",
          },
        ]
      : canReadReport
        ? [
            {
              title: "Checkouts",
              description: "Loans checked out in the report date window",
              icon: LibraryBig,
              value: reportQuery.isPending ? "Loading..." : "Unavailable",
              subtext: reportQuery.isError
                ? "Loan report could not be loaded"
                : "Report summary not returned",
            },
            {
              title: "Overdue loans",
              description: "Backend-reported overdue count for the checkout date window",
              icon: LibraryBig,
              value: reportQuery.isPending ? "Loading..." : "Unavailable",
              subtext: reportQuery.isError
                ? "Loan report could not be loaded"
                : "Requires the Library loan report",
            },
            {
              title: "Active loans in range",
              description: "Currently active among loans checked out in this window",
              icon: LibraryBig,
              value: reportQuery.isPending ? "Loading..." : "Unavailable",
              subtext: reportQuery.isError
                ? "Loan report could not be loaded"
                : "Requires the Library loan report",
            },
            {
              title: "Returned loans",
              description: "Currently returned among loans checked out in this window",
              icon: LibraryBig,
              value: reportQuery.isPending ? "Loading..." : "Unavailable",
              subtext: reportQuery.isError
                ? "Loan report could not be loaded"
                : "Requires the Library loan report",
            },
          ]
        : []),
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Badge variant="secondary">School library</Badge>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Library overview</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Catalog and circulation information available to the active school context. This page
            does not infer a Librarian role.
          </p>
        </div>
        <Button
          onClick={() => {
            if (canReadCatalog) {
              void queryClient.invalidateQueries({
                queryKey: ["school-data", school?.id, "/library/catalog/items"],
              });
            }
            if (canReadLoans || canManageLoans) {
              void queryClient.invalidateQueries({
                queryKey: ["school-data", school?.id, "/library/loans"],
              });
            }
            if (canReadReport) void reportQuery.refetch();
          }}
          size="sm"
          variant="outline"
        >
          Refresh
        </Button>
      </section>

      {canReadReport && (
        <form
          aria-label="Library loan report filters"
          className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-end"
          onSubmit={applyReportRange}
        >
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                setReportDraft((value) => ({ ...value, from: event.target.value }))
              }
              required
              type="date"
              value={reportDraft.from}
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                setReportDraft((value) => ({ ...value, to: event.target.value }))
              }
              required
              type="date"
              value={reportDraft.to}
            />
          </label>
          <Button
            className="w-full sm:w-auto"
            disabled={reportQuery.isFetching}
            size="sm"
            type="submit"
          >
            {reportQuery.isFetching ? "Loading report..." : "Apply date range"}
          </Button>
          {reportFilterError && (
            <p className="text-sm text-destructive sm:col-span-3" role="alert">
              {reportFilterError}
            </p>
          )}
        </form>
      )}

      {canReadReport && reportQuery.isFetching && (
        <LoadingState className="min-h-12" message="Loading Library loan summary..." />
      )}

      {canReadReport &&
        !reportQuery.isError &&
        reportQuery.data?.data.checkedOut === 0 &&
        !reportQuery.isFetching && (
          <EmptyState
            className="rounded-lg border p-4"
            description={`No books were checked out from ${dateRange.from} through ${dateRange.to}.`}
            title="No loans in this report range"
          />
        )}

      {summary.length > 0 && (
        <section aria-label="Library summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <SummaryCard item={item} key={item.title} />
          ))}
        </section>
      )}

      {(canReadCatalog || canManageCatalog) && (
        <LibraryCatalogWorkspace
          canManageCatalog={canManageCatalog}
          canReadCatalog={canReadCatalog}
        />
      )}

      {(canReadLoans || canManageLoans) && (
        <LibraryLoanWorkspace
          canManageLoans={canManageLoans}
          canReadCatalog={canReadCatalog}
          canReadLoans={canReadLoans}
        />
      )}

      {canReadReport &&
        reportQuery.isError &&
        (reportQuery.error instanceof ApiClientError && reportQuery.error.status === 403 ? (
          <UnauthorizedState
            className="rounded-lg border p-4"
            description="The server denied access to the Library loan report."
            title="Loan report access unavailable"
          />
        ) : (
          <ErrorState
            className="rounded-lg border p-4"
            message="The circulation summary could not be loaded."
            onRetry={() => void reportQuery.refetch()}
          />
        ))}
    </div>
  );
}
