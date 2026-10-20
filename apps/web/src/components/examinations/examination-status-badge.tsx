import { Badge } from "@/components/ui/badge";

export type ExaminationStatus =
  | "Draft"
  | "Scheduled"
  | "In Progress"
  | "Completed"
  | "Published";

type ExaminationStatusBadgeProps = {
  status: ExaminationStatus;
};

const statusStyles: Record<ExaminationStatus, string> = {
  Draft:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  Scheduled:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  "In Progress":
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Completed:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
  Published:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

export function ExaminationStatusBadge({
  status,
}: ExaminationStatusBadgeProps) {
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
