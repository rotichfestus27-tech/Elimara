import {
  ClipboardCheck,
  GraduationCap,
  UserRoundPlus,
  WalletCards,
} from "lucide-react";
import { ActivityPanel } from "@/components/dashboard/activity-panel";
import { QuickActions } from "@/components/dashboard/quick-actions";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Students",
    description: "Enrolled learners across your school",
    icon: GraduationCap,
  },
  {
    title: "New Admissions",
    description: "Applications and enrolments",
    icon: UserRoundPlus,
  },
  {
    title: "Attendance Rate",
    description: "Attendance overview",
    icon: ClipboardCheck,
  },
  {
    title: "Fee Collection",
    description: "Fee collection overview",
    icon: WalletCards,
  },
];

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">School overview</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome to your school workspace
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            A thoughtful starting point for your team to stay connected to
            school operations.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-amber-500"
          />
          Preview · Data not connected
        </span>
      </section>

      <section aria-labelledby="overview-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="overview-heading" className="text-base font-semibold">
              At a glance
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              School figures will appear when an approved data source is
              connected.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Values unavailable
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section
        aria-label="School activity and quick actions"
        className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]"
      >
        <ActivityPanel />
        <QuickActions />
      </section>
    </div>
  );
}
