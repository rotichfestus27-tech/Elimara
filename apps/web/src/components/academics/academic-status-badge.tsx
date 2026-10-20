import { Badge } from "@/components/ui/badge";

export type AcademicStatus = "Active" | "Inactive" | "Upcoming" | "Completed";

type AcademicStatusBadgeProps = {
  status: AcademicStatus;
};

const statusStyles: Record<AcademicStatus, string> = {
  Active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  Inactive:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  Upcoming:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  Completed:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
};

export function AcademicStatusBadge({ status }: AcademicStatusBadgeProps) {
  return (
    <Badge
      className={`normal-case tracking-normal ${statusStyles[status]}`}
      variant="outline"
    >
      <span
        aria-hidden="true"
        className="mr-1.5 size-1.5 rounded-full bg-current"
      />
      {status}
    </Badge>
  );
}
