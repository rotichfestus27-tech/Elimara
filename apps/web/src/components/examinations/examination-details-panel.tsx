import { ClipboardList } from "lucide-react";
import {
  type ExaminationStatus,
  ExaminationStatusBadge,
} from "@/components/examinations/examination-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ExaminationDetails = {
  name: string;
  type: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: ExaminationStatus;
  description?: string;
};

type ExaminationDetailsPanelProps = {
  examination: ExaminationDetails | null;
};

const detailLabels: Array<{
  key: Exclude<keyof ExaminationDetails, "status">;
  label: string;
}> = [
  { key: "name", label: "Examination name" },
  { key: "type", label: "Examination type" },
  { key: "academicYear", label: "Academic year" },
  { key: "startDate", label: "Start date" },
  { key: "endDate", label: "End date" },
  { key: "description", label: "Description / instructions" },
];

export function ExaminationDetailsPanel({
  examination,
}: ExaminationDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Examination details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Examination information will appear here when records are available.
        </p>
      </CardHeader>
      <CardContent>
        {examination ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {detailLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {examination[key] || "—"}
                </dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <ExaminationStatusBadge status={examination.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <ClipboardList aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No examination selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Details will appear when examination data is connected.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
