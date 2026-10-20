import {
  BookOpenCheck,
  CalendarCheck,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  Search,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import {
  ReportConfigurationSheet,
  type ReportOption,
} from "@/components/reports/report-configuration-sheet";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ReportCategoryId =
  | "students"
  | "attendance"
  | "academic"
  | "finance"
  | "staff";

type ReportCategory = {
  id: ReportCategoryId;
  label: string;
  icon: typeof GraduationCap;
  reports: ReportOption[];
};

const categories: ReportCategory[] = [
  {
    id: "students",
    label: "Student Reports",
    icon: GraduationCap,
    reports: [
      {
        id: "student-enrolment",
        title: "Student enrolment report",
        description:
          "Review enrolment totals and patterns when student data is connected.",
        category: "Student Reports",
        supportsStudentFilter: false,
      },
      {
        id: "student-directory",
        title: "Student directory report",
        description:
          "Prepare a student directory using connected student records.",
        category: "Student Reports",
        supportsStudentFilter: true,
      },
      {
        id: "class-distribution",
        title: "Class / programme distribution",
        description:
          "View how students are distributed across classes or programmes.",
        category: "Student Reports",
        supportsStudentFilter: false,
      },
    ],
  },
  {
    id: "attendance",
    label: "Attendance Reports",
    icon: CalendarCheck,
    reports: [
      {
        id: "daily-attendance",
        title: "Daily attendance",
        description: "Review attendance records for a selected date range.",
        category: "Attendance Reports",
        supportsStudentFilter: true,
      },
      {
        id: "attendance-by-class",
        title: "Attendance by class",
        description: "Compare attendance across classes when records exist.",
        category: "Attendance Reports",
        supportsStudentFilter: false,
      },
      {
        id: "attendance-trends",
        title: "Attendance trends",
        description:
          "Explore attendance patterns after live data is connected.",
        category: "Attendance Reports",
        supportsStudentFilter: false,
      },
    ],
  },
  {
    id: "academic",
    label: "Academic Reports",
    icon: BookOpenCheck,
    reports: [
      {
        id: "examination-performance",
        title: "Examination performance",
        description:
          "Review examination performance when verified results are available.",
        category: "Academic Reports",
        supportsStudentFilter: false,
      },
      {
        id: "subject-performance",
        title: "Subject performance",
        description:
          "View subject-level performance from connected examination results.",
        category: "Academic Reports",
        supportsStudentFilter: false,
      },
      {
        id: "student-results",
        title: "Student results",
        description:
          "Prepare a results view for a student once results are connected.",
        category: "Academic Reports",
        supportsStudentFilter: true,
      },
    ],
  },
  {
    id: "finance",
    label: "Finance Reports",
    icon: CircleDollarSign,
    reports: [
      {
        id: "fee-collection",
        title: "Fee collection",
        description:
          "Review fee collection information when financial records are connected.",
        category: "Finance Reports",
        supportsStudentFilter: false,
      },
      {
        id: "outstanding-balances",
        title: "Outstanding balances",
        description:
          "View verified balances only after finance data is available.",
        category: "Finance Reports",
        supportsStudentFilter: true,
      },
      {
        id: "payment-history",
        title: "Payment history",
        description:
          "Review payment history from connected finance records.",
        category: "Finance Reports",
        supportsStudentFilter: true,
      },
    ],
  },
  {
    id: "staff",
    label: "Staff Reports",
    icon: UsersRound,
    reports: [
      {
        id: "staff-directory",
        title: "Staff directory",
        description:
          "Prepare a staff directory when staff profiles are connected.",
        category: "Staff Reports",
        supportsStudentFilter: false,
      },
      {
        id: "staff-department-distribution",
        title: "Staff distribution by department",
        description:
          "Review staff distribution after department records are available.",
        category: "Staff Reports",
        supportsStudentFilter: false,
      },
    ],
  },
];

const analyticsCards: SummaryCardItem[] = [
  {
    title: "Student Enrolment",
    description: "Current student enrolment",
    icon: GraduationCap,
  },
  {
    title: "Attendance Rate",
    description: "Attendance across the selected period",
    icon: ClipboardCheck,
  },
  {
    title: "Examination Performance",
    description: "Performance from available results",
    icon: FileBarChart,
  },
  {
    title: "Fee Collection",
    description: "Payments against fees due",
    icon: WalletCards,
  },
];

export function ReportsPage() {
  const [activeCategory, setActiveCategory] =
    useState<ReportCategoryId>("students");
  const [selectedReport, setSelectedReport] = useState<ReportOption | null>(
    null,
  );
  const activeTab =
    categories.find((category) => category.id === activeCategory) ??
    categories[0];

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = categories.findIndex(
      (category) => category.id === activeCategory,
    );
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % categories.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + categories.length) % categories.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = categories.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = categories[nextIndex];
    setActiveCategory(nextTab.id);
    document.getElementById(`reports-tab-${nextTab.id}`)?.focus();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Insights</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Reports &amp; Analytics
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          View and prepare school performance, attendance, academic, and
          financial reports.
        </p>
      </section>

      <div
        className="flex gap-3 rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        role="note"
      >
        <ChartNoAxesCombined
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0"
        />
        <div>
          <p className="text-sm font-semibold">
            Reports and analytics are not connected to live data
          </p>
          <p className="mt-1 text-xs leading-5 opacity-85">
            Report options and filters are interface previews only. No data,
            charts, trends, or downloadable reports are currently available.
          </p>
        </div>
      </div>

      <section aria-labelledby="analytics-overview-heading" className="space-y-4">
        <div>
          <h3
            id="analytics-overview-heading"
            className="text-base font-semibold"
          >
            Analytics overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Values remain unavailable until approved live data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {analyticsCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="report-catalog-heading" className="space-y-4">
        <div>
          <h3 id="report-catalog-heading" className="text-base font-semibold">
            Report catalogue
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a report type to preview its configuration options.
          </p>
        </div>

        <div
          aria-label="Report categories"
          className="flex gap-1 overflow-x-auto border-b"
          onKeyDown={handleTabKeyDown}
          role="tablist"
        >
          {categories.map((category) => {
            const Icon = category.icon;
            const isActive = category.id === activeCategory;

            return (
              <button
                key={category.id}
                id={`reports-tab-${category.id}`}
                aria-controls={`reports-panel-${category.id}`}
                aria-selected={isActive}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveCategory(category.id)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
                {category.label}
              </button>
            );
          })}
        </div>

        <div
          aria-labelledby={`reports-tab-${activeTab.id}`}
          id={`reports-panel-${activeTab.id}`}
          role="tabpanel"
          tabIndex={0}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeTab.reports.map((report) => (
              <Card
                key={report.id}
                className="flex flex-col shadow-none transition-colors hover:border-primary/30"
              >
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                      <FileBarChart
                        aria-hidden="true"
                        className="size-[18px]"
                        strokeWidth={1.8}
                      />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold">{report.title}</h4>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                        {report.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto pt-1">
                    <Button
                      className="w-full"
                      onClick={() => setSelectedReport(report)}
                      type="button"
                      variant="outline"
                    >
                      <Search aria-hidden="true" />
                      Prepare Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <ReportConfigurationSheet
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
