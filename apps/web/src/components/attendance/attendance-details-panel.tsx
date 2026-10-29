import { ClipboardCheck } from "lucide-react";
import {
  type AttendanceStatus,
  AttendanceStatusBadge,
} from "@/components/attendance/attendance-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AttendanceDetails = {
  admissionNumber: string;
  studentName: string;
  classProgramme: string;
  date: string;
  checkInTime: string;
  status: AttendanceStatus;
  notes?: string;
};

type AttendanceDetailsPanelProps = {
  entry: AttendanceDetails | null;
};

const detailLabels: Array<{
  key: Exclude<keyof AttendanceDetails, "status">;
  label: string;
}> = [
  { key: "admissionNumber", label: "Admission number" },
  { key: "studentName", label: "Student name" },
  { key: "classProgramme", label: "Class / programme" },
  { key: "date", label: "Date" },
  { key: "checkInTime", label: "Check-in time" },
  { key: "notes", label: "Notes" },
];

export function AttendanceDetailsPanel({
  entry,
}: AttendanceDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Attendance details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Inspect an attendance entry when records are available.
        </p>
      </CardHeader>
      <CardContent>
        {entry ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {detailLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {entry[key] || "—"}
                </dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <AttendanceStatusBadge status={entry.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <ClipboardCheck aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No attendance entry selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entry details will appear here when attendance data is available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
