import { Badge } from "@/components/ui/badge";

export type FinanceStatus =
  | "Active"
  | "Inactive"
  | "Paid"
  | "Pending"
  | "Partially paid"
  | "Overdue"
  | "Cancelled";

type FinanceStatusBadgeProps = {
  status: FinanceStatus;
};

const statusStyles: Record<FinanceStatus, string> = {
  Active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  Inactive:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  Paid: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  Pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "Partially paid":
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  Overdue:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
  Cancelled:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
};

export function FinanceStatusBadge({ status }: FinanceStatusBadgeProps) {
  return (
    <Badge className={`normal-case tracking-normal ${statusStyles[status]}`} variant="outline">
      <span aria-hidden="true" className="mr-1.5 size-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}
