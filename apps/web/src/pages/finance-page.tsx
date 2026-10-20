import {
  CalendarDays,
  CircleDollarSign,
  FileClock,
  FileText,
  ReceiptText,
  Search,
  WalletCards,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import {
  FinanceRecordDetailsPanel,
  type FinanceRecordDetails,
} from "@/components/finance/finance-record-details-panel";
import {
  FinanceStatusBadge,
  type FinanceStatus,
} from "@/components/finance/finance-status-badge";
import { RecordPaymentSheet } from "@/components/finance/record-payment-sheet";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FinanceSection = "fees" | "payments" | "invoices" | "balances";

type FinanceTab = {
  id: FinanceSection;
  label: string;
  icon: typeof WalletCards;
  columns: string[];
  emptyTitle: string;
  emptyDescription: string;
  statuses?: FinanceStatus[];
  showAcademicYear?: boolean;
  showProgramme?: boolean;
  showDate?: boolean;
};

const tabs: FinanceTab[] = [
  {
    id: "fees",
    label: "Fee Structures",
    icon: WalletCards,
    columns: [
      "Fee structure",
      "Programme / class",
      "Academic year",
      "Amount",
      "Status",
      "Actions",
    ],
    emptyTitle: "No fee structures to display",
    emptyDescription:
      "Fee structure data is not connected. No fees or amounts are shown.",
    statuses: ["Active", "Inactive"],
    showAcademicYear: true,
    showProgramme: true,
  },
  {
    id: "payments",
    label: "Payments",
    icon: ReceiptText,
    columns: [
      "Receipt number",
      "Student",
      "Admission number",
      "Payment date",
      "Payment method",
      "Amount",
      "Status",
      "Actions",
    ],
    emptyTitle: "No payments to display",
    emptyDescription:
      "Payment records are not connected. No students, receipts, methods, or amounts are shown.",
    statuses: ["Paid", "Pending", "Partially paid", "Cancelled"],
    showDate: true,
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: FileText,
    columns: [
      "Invoice number",
      "Student",
      "Admission number",
      "Issue date",
      "Due date",
      "Amount due",
      "Amount paid",
      "Balance",
      "Status",
      "Actions",
    ],
    emptyTitle: "No invoices to display",
    emptyDescription:
      "Invoice records are not connected. No students, invoice numbers, or balances are shown.",
    statuses: ["Paid", "Pending", "Partially paid", "Overdue", "Cancelled"],
    showAcademicYear: true,
    showProgramme: true,
    showDate: true,
  },
  {
    id: "balances",
    label: "Student Balances",
    icon: CircleDollarSign,
    columns: [
      "Student",
      "Admission number",
      "Programme / class",
      "Total fees",
      "Total paid",
      "Outstanding balance",
      "Actions",
    ],
    emptyTitle: "No student balances to display",
    emptyDescription:
      "Student balance information is not connected. No student details or financial amounts are shown.",
    showAcademicYear: true,
    showProgramme: true,
  },
];

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Fees Due",
    description: "Fees due across the school",
    icon: WalletCards,
  },
  {
    title: "Total Payments Received",
    description: "Payments recorded",
    icon: ReceiptText,
  },
  {
    title: "Outstanding Balance",
    description: "Unpaid fee balance",
    icon: CircleDollarSign,
  },
  {
    title: "Overdue Invoices",
    description: "Invoices past due date",
    icon: FileClock,
  },
];

export function FinancePage() {
  const [activeSection, setActiveSection] =
    useState<FinanceSection>("fees");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState("all");
  const [programme, setProgramme] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const activeTab = tabs.find((tab) => tab.id === activeSection) ?? tabs[0];
  const ActiveIcon = activeTab.icon;
  const showDetails = activeSection === "payments" || activeSection === "invoices";
  const detailsKind: FinanceRecordDetails["kind"] =
    activeSection === "invoices" ? "invoice" : "payment";

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeSection);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveSection(nextTab.id);
    document.getElementById(`finance-tab-${nextTab.id}`)?.focus();
  }

  function handleSectionChange(section: FinanceSection) {
    setActiveSection(section);
    setSearchTerm("");
    setStatusFilter("all");
    setAcademicYear("all");
    setProgramme("all");
    setFilterDate("");
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">School finance</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Finance
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Manage student fees, payments, invoices, and outstanding balances.
            Financial records will appear when an approved data source is
            connected.
          </p>
        </div>
        <RecordPaymentSheet />
      </section>

      <section aria-labelledby="finance-overview-heading" className="space-y-4">
        <div>
          <h3 id="finance-overview-heading" className="text-base font-semibold">
            Finance overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Amounts and invoice totals are unavailable until finance data is
            connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="finance-records-heading" className="space-y-4">
        <div>
          <h3 id="finance-records-heading" className="text-base font-semibold">
            Finance records
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse fee structures, payments, invoices, and student balances.
          </p>
        </div>

        <div
          aria-label="Finance sections"
          className="flex gap-1 overflow-x-auto border-b"
          onKeyDown={handleTabKeyDown}
          role="tablist"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;

            return (
              <button
                key={tab.id}
                id={`finance-tab-${tab.id}`}
                aria-controls={`finance-panel-${tab.id}`}
                aria-selected={isActive}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handleSectionChange(tab.id)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id={`finance-panel-${activeTab.id}`}
          aria-labelledby={`finance-tab-${activeTab.id}`}
          role="tabpanel"
          tabIndex={0}
        >
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div
                className={cn(
                  "grid gap-3 sm:grid-cols-2",
                  activeTab.showDate
                    ? "xl:grid-cols-4"
                    : activeTab.showAcademicYear || activeTab.showProgramme
                      ? "xl:grid-cols-3"
                      : "",
                )}
              >
                <label className="relative block">
                  <span className="sr-only">
                    Search students, receipt numbers, or invoice numbers
                  </span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={
                      activeSection === "fees"
                        ? "Search fee structures"
                        : "Search student, receipt, or invoice"
                    }
                    type="search"
                    value={searchTerm}
                  />
                </label>

                {activeTab.statuses && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Payment / record status
                    </span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setStatusFilter(event.target.value)}
                      value={statusFilter}
                    >
                      <option value="all">All statuses</option>
                      {activeTab.statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {activeTab.showAcademicYear && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Academic year
                    </span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setAcademicYear(event.target.value)}
                      value={academicYear}
                    >
                      <option value="all">All academic years</option>
                      <option disabled value="unavailable">
                        Options unavailable
                      </option>
                    </select>
                  </label>
                )}

                {activeTab.showProgramme && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Programme / class
                    </span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) => setProgramme(event.target.value)}
                      value={programme}
                    >
                      <option value="all">All programmes / classes</option>
                      <option disabled value="unavailable">
                        Options unavailable
                      </option>
                    </select>
                  </label>
                )}

                {activeTab.showDate && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Date
                    </span>
                    <span className="relative block">
                      <CalendarDays
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        aria-label="Filter by date"
                        className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(event) => setFilterDate(event.target.value)}
                        type="date"
                        value={filterDate}
                      />
                    </span>
                  </label>
                )}
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                Finance data is not connected. These search and filter controls
                are presentational and do not retrieve or change records.
              </p>

              {activeTab.statuses && (
                <div
                  aria-label="Status label key"
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="mr-1 text-xs font-medium text-muted-foreground">
                    Status labels
                  </span>
                  {[...new Set(activeTab.statuses)].map((status) => (
                    <FinanceStatusBadge key={status} status={status} />
                  ))}
                </div>
              )}

              <div className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                    <caption className="sr-only">{activeTab.label}</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        {activeTab.columns.map((column) => (
                          <th
                            key={column}
                            className="px-4 py-3 font-medium"
                            scope="col"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody aria-live="polite">
                      <tr>
                        <td
                          className="px-4 py-12"
                          colSpan={activeTab.columns.length}
                        >
                          <div className="mx-auto flex max-w-md flex-col items-center text-center">
                            <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <ActiveIcon
                                aria-hidden="true"
                                className="size-5"
                                strokeWidth={1.8}
                              />
                            </span>
                            <p className="text-sm font-semibold">
                              {activeTab.emptyTitle}
                            </p>
                            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                              {activeTab.emptyDescription}
                            </p>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {showDetails && (
        <FinanceRecordDetailsPanel record={null} kind={detailsKind} />
      )}
    </div>
  );
}
