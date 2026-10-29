import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TimetableEntryDetails = {
  classOrProgramme: string;
  subject: string;
  teacher: string;
  room: string;
  weekdayOrDate: string;
  startTime: string;
  endTime: string;
  notes?: string;
};

type TimetableEntryDetailsPanelProps = {
  entry: TimetableEntryDetails | null;
};

const detailLabels: Array<{
  key: keyof TimetableEntryDetails;
  label: string;
}> = [
  { key: "classOrProgramme", label: "Class / programme" },
  { key: "subject", label: "Subject" },
  { key: "teacher", label: "Teacher" },
  { key: "room", label: "Room / venue" },
  { key: "weekdayOrDate", label: "Weekday / date" },
  { key: "startTime", label: "Start time" },
  { key: "endTime", label: "End time" },
  { key: "notes", label: "Notes" },
];

export function TimetableEntryDetailsPanel({ entry }: TimetableEntryDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Timetable entry details</CardTitle>
        <p className="text-sm text-muted-foreground">Timetable information is not connected.</p>
      </CardHeader>
      <CardContent>
        {entry ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {detailLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium text-foreground">{entry[key] || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <CalendarClock aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No timetable entry selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entry details will appear here when timetable records are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
