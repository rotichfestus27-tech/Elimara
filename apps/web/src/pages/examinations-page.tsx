import {
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Search,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import {
  ExaminationDetailsPanel,
} from "@/components/examinations/examination-details-panel";
import { CreateExaminationSheet } from "@/components/examinations/create-examination-sheet";
import {
  ExaminationStatusBadge,
  type ExaminationStatus,
} from "@/components/examinations/examination-status-badge";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ExaminationSection = "examinations" | "timetable" | "results";

type ExaminationTab = {
  id: ExaminationSection;
  label: string;
  icon: typeof ClipboardList;
  columns: string[];
  emptyTitle: string;
  emptyDescription: string;
};

const tabs: ExaminationTab[] = [
  {
    id: "examinations",
    label: "Examinations",
    icon: ClipboardList,
    columns: [
      "Examination name",
      "Examination type",
      "Academic year",
      "Start date",
      "End date",
      "Status",
      "Actions",
    ],
    emptyTitle: "No examinations to display",
    emptyDescription:
      "Examination records are not connected yet. No sample examinations are shown.",
  },
  {
    id: "timetable",
    label: "Exam Timetable",
    icon: CalendarClock,
    columns: [
      "Examination",
      "Subject",
      "Class / programme",
      "Date",
      "Start time",
      "End time",
      "Venue",
      "Actions",
    ],
    emptyTitle: "No timetable entries to display",
    emptyDescription:
      "Exam timetable data is not connected yet. No sample schedules or venues are shown.",
  },
  {
    id: "results",
    label: "Results",
    icon: FileCheck2,
    columns: [
      "Examination",
      "Student",
      "Admission number",
      "Subject",
      "Marks",
      "Grade",
      "Publication status",
    ],
    emptyTitle: "No results to display",
    emptyDescription:
      "Examination results are not connected yet. No student results, marks, or grades are shown.",
  },
];

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Examinations",
    description: "Examinations configured",
    icon: ClipboardList,
  },
  {
    title: "Upcoming Examinations",
    description: "Scheduled examinations",
    icon: CalendarClock,
  },
  {
    title: "Completed Examinations",
    description: "Completed examinations",
    icon: BookOpenCheck,
  },
  {
    title: "Results Published",
    description: "Published examination results",
    icon: GraduationCap,
  },
];

const examinationStatuses: ExaminationStatus[] = [
  "Draft",
  "Scheduled",
  "In Progress",
  "Completed",
  "Published",
];

export function ExaminationsPage() {
  const [activeSection, setActiveSection] =
    useState<ExaminationSection>("examinations");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const activeTab = tabs.find((tab) => tab.id === activeSection) ?? tabs[0];
  const ActiveIcon = activeTab.icon;

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
    document.getElementById(`examinations-tab-${nextTab.id}`)?.focus();
  }

  function handleSectionChange(section: ExaminationSection) {
    setActiveSection(section);
    setSearchTerm("");
    setStatusFilter("all");
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">Assessment</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Examinations
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Manage examinations, schedules, and student results. Examination
            data will appear when an approved data source is connected.
          </p>
        </div>
        <CreateExaminationSheet />
      </section>

      <section
        aria-labelledby="examinations-overview-heading"
        className="space-y-4"
      >
        <div>
          <h3
            id="examinations-overview-heading"
            className="text-base font-semibold"
          >
            Examination overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Statistics and results are unavailable until examination data is
            connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="examination-management-heading"
        className="space-y-4"
      >
        <div>
          <h3
            id="examination-management-heading"
            className="text-base font-semibold"
          >
            Examination management
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse examinations, timetables, and results.
          </p>
        </div>

        <div
          aria-label="Examination sections"
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
                id={`examinations-tab-${tab.id}`}
                aria-controls={`examinations-panel-${tab.id}`}
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
          id={`examinations-panel-${activeTab.id}`}
          aria-labelledby={`examinations-tab-${activeTab.id}`}
          role="tabpanel"
          tabIndex={0}
        >
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_200px]">
                <label className="relative block">
                  <span className="sr-only">Search examinations</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Search ${activeTab.label.toLowerCase()}`}
                    type="search"
                    value={searchTerm}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Status
                  </span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setStatusFilter(event.target.value)}
                    value={statusFilter}
                  >
                    <option value="all">All statuses</option>
                    {examinationStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                aria-label="Examination status key"
                className="flex flex-wrap items-center gap-2"
              >
                <span className="mr-1 text-xs font-medium text-muted-foreground">
                  Status key
                </span>
                {examinationStatuses.map((status) => (
                  <ExaminationStatusBadge key={status} status={status} />
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
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
              <p className="text-xs text-muted-foreground">
                Search and status controls are presentational and will apply
                when examination records are available.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <ExaminationDetailsPanel examination={null} />
    </div>
  );
}
