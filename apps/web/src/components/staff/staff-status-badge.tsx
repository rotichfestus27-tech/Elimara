import { Badge } from "@/components/ui/badge";

export type StaffProfileStatus = "ACTIVE" | "INACTIVE";

type StaffStatusBadgeProps = {
  status: StaffProfileStatus;
};

const statusLabels: Record<StaffProfileStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const statusStyles: Record<StaffProfileStatus, string> = {
  ACTIVE:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  INACTIVE:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
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
      {statusLabels[status]}
    </Badge>
  );
}
