import { Badge } from "@/components/ui/badge";

export type StudentStatus =
  | "ACTIVE"
  | "TRANSFERRED"
  | "GRADUATED"
  | "WITHDRAWN";

type StudentStatusBadgeProps = {
  status: StudentStatus;
};

const statusLabels: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  TRANSFERRED: "Transferred",
  GRADUATED: "Graduated",
  WITHDRAWN: "Withdrawn",
};

const statusStyles: Record<StudentStatus, string> = {
  ACTIVE:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  TRANSFERRED:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  GRADUATED:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  WITHDRAWN:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  return (
    <Badge
      className={`normal-case tracking-normal ${statusStyles[status]}`}
      variant="outline"
    >
      <span
        aria-hidden="true"
        className="mr-1.5 size-1.5 rounded-full bg-current"
      />
      {statusLabels[status]}
    </Badge>
  );
}
