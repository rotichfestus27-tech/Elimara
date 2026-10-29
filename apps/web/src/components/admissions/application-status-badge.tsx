import { Badge } from "@/components/ui/badge";

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "ADMITTED";

type ApplicationStatusBadgeProps = {
  status: ApplicationStatus;
};

const statusStyles: Record<ApplicationStatus, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className:
      "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200",
  },
  SUBMITTED: {
    label: "Submitted",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  },
  UNDER_REVIEW: {
    label: "Under review",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  ACCEPTED: {
    label: "Accepted",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  REJECTED: {
    label: "Rejected",
    className:
      "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    className:
      "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  },
  ADMITTED: {
    label: "Admitted",
    className:
      "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-200",
  },
};

export function ApplicationStatusBadge({ status }: ApplicationStatusBadgeProps) {
  const config = statusStyles[status];

  return (
    <Badge
      className={`normal-case tracking-normal text-xs font-medium ${config.className}`}
      variant="outline"
    >
      <span aria-hidden="true" className="mr-1.5 size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
