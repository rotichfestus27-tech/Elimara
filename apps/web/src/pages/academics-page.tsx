import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Search,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import {
  AcademicItemDetailsPanel,
} from "@/components/academics/academic-item-details";
import {
  AcademicItemSheet,
  type AcademicSection,
} from "@/components/academics/academic-item-sheet";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AcademicTab = {
  id: AcademicSection;
  label: string;
  icon: typeof GraduationCap;
  emptyTitle: string;
  emptyDescription: string;
  columns: string[];
};

const tabs: AcademicTab[] = [
  {
    id: "classes",
    label: "Classes",
    icon: GraduationCap,
    emptyTitle: "No classes to display",
    emptyDescription:
      "Class records are not connected yet. No sample classes are shown.",
    columns: [
      "Class name",
      "Class code",
      "Programme",
      "Academic year",
      "Status",
      "Actions",
    ],
  },
  {
    id: "programmes",
    label: "Programmes",
    icon: BookOpen,
    emptyTitle: "No programmes to display",
    emptyDescription:
      "Programme records are not connected yet. No sample programmes are shown.",
    columns: [
      "Programme name",
      "Programme code",
      "Qualification / level",
      "Duration",
      "Status",
      "Actions",
    ],
  },
  {
    id: "subjects",
    label: "Subjects",
    icon: ClipboardList,
    emptyTitle: "No subjects to display",
    emptyDescription:
      "Subject records are not connected yet. No sample subjects are shown.",
    columns: [
      "Subject name",
      "Subject code",
      "Class / programme",
      "Status",
      "Actions",
    ],
  },
  {
    id: "years",
    label: "Academic Years",
    icon: CalendarDays,
    emptyTitle: "No academic years to display",
    emptyDescription:
      "Academic year records are not connected yet. No sample years are shown.",
    columns: [
      "Year name",
      "Start date",
      "End date",
      "Status",
      "Actions",
    ],
  },
];

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Classes",
    description: "Classes in your school",
    icon: GraduationCap,
  },
  {
    title: "Total Programmes",
    description: "Programmes of study",
    icon: BookOpen,
  },
  {
    title: "Total Subjects",
    description: "Subjects across classes",
    icon: ClipboardList,
  },
  {
    title: "Academic Years",
    description: "Configured academic years",
    icon: CalendarDays,
  },
];

const academicStatuses = ["Active", "Inactive", "Upcoming", "Completed"];

export function AcademicsPage() {
  const [activeSection, setActiveSection] =
    useState<AcademicSection>("classes");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [programmeFilter, setProgrammeFilter] = useState("all");
  const activeTab = tabs.find((tab) => tab.id === activeSection) ?? tabs[0];
  const ActiveIcon = activeTab.icon;
  const hasProgrammeFilter =
    activeSection === "classes" || activeSection === "subjects";

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
    document.getElementById(`academics-tab-${nextTab.id}`)?.focus();
  }

  function handleSectionChange(section: AcademicSection) {
    setActiveSection(section);
    setSearchTerm("");
    setStatusFilter("all");
    setProgrammeFilter("all");
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">School structure</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Academics
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Manage your academic structure and class organisation. Academic
            records will appear when an approved data source is connected.
          </p>
        </div>
        <AcademicItemSheet section={activeSection} />
      </section>

      <section aria-labelledby="academics-overview-heading" className="space-y-4">
        <div>
          <h3
            id="academics-overview-heading"
            className="text-base font-semibold"
          >
            Academic overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Counts are unavailable until academic data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="academic-structure-heading" className="space-y-4">
        <div>
          <h3
            id="academic-structure-heading"
            className="text-base font-semibold"
          >
            Academic structure
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse classes, programmes, subjects, and academic years.
          </p>
        </div>

        <div
          aria-label="Academic structure sections"
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
                id={`academics-tab-${tab.id}`}
                aria-controls={`academics-panel-${tab.id}`}
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
          id={`academics-panel-${activeTab.id}`}
          aria-labelledby={`academics-tab-${activeTab.id}`}
          role="tabpanel"
          tabIndex={0}
        >
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div
                className={cn(
                  "grid gap-3",
                  hasProgrammeFilter
                    ? "sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px_220px]"
                    : "sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px]",
                )}
              >
                <label className="relative block">
                  <span className="sr-only">Search by name or code</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Search ${activeTab.label.toLowerCase()} by name or code`}
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
                    {academicStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                {hasProgrammeFilter && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {activeSection === "classes" ? "Programme" : "Class"}
                    </span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) =>
                        setProgrammeFilter(event.target.value)
                      }
                      value={programmeFilter}
                    >
                      <option value="all">
                        {activeSection === "classes"
                          ? "All programmes"
                          : "All classes"}
                      </option>
                      <option disabled value="unavailable">
                        Options unavailable
                      </option>
                    </select>
                  </label>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
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
                Search and filters are presentation controls and will apply
                when academic records become available.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <AcademicItemDetailsPanel item={null} />
    </div>
  );
}
