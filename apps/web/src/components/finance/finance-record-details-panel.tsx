import { FileText, ReceiptText } from "lucide-react";
import {
  type FinanceStatus,
  FinanceStatusBadge,
} from "@/components/finance/finance-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type FinanceRecordDetails = {
  kind: "payment" | "invoice";
  title: string;
  fields: Array<{ label: string; value: string }>;
  status: FinanceStatus;
};

type FinanceRecordDetailsPanelProps = {
  record: FinanceRecordDetails | null;
  kind: FinanceRecordDetails["kind"];
};

const emptyCopy = {
  payment: {
    title: "No payment selected",
    description: "Payment details will appear when real payment records exist.",
    Icon: ReceiptText,
  },
  invoice: {
    title: "No invoice selected",
    description: "Invoice details will appear when real invoice records exist.",
    Icon: FileText,
  },
};

export function FinanceRecordDetailsPanel({
  record,
  kind,
}: FinanceRecordDetailsPanelProps) {
  const copy = emptyCopy[kind];

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">
          {record ? record.title : kind === "payment" ? "Payment details" : "Invoice details"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Financial record information is not connected.
        </p>
      </CardHeader>
      <CardContent>
        {record ? (
          <div className="space-y-5">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {record.fields.map(({ label, value }) => (
                <div key={label} className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="text-sm font-medium text-foreground">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Status
              </p>
              <FinanceStatusBadge status={record.status} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <copy.Icon aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">{copy.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy.description}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
