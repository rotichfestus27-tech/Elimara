import { Badge } from "@/components/ui/badge";

export type StaffEmploymentStatus =
  | "Active"
  | "Inactive"
  | "On leave"
  | "Terminated";

type StaffStatusBadgeProps = {
  status: StaffEmploymentStatus;
};

const statusStyles: Record<StaffEmploymentStatus, string> = {
  Active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  Inactive:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  "On leave":
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Terminated:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

export function StaffStatusBadge({ status }: StaffStatusBadgeProps) {
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
