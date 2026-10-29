import { Info, ListChecks } from "lucide-react";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

const attendanceStatuses = ["Present", "Absent", "Late", "Excused"] as const;

export function MarkAttendanceSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <ListChecks aria-hidden="true" />
          Mark Attendance
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="mark-attendance-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Mark attendance</SheetTitle>
          <SheetDescription id="mark-attendance-description">
            Presentational preview only. Attendance is not saved.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="attendance-date" label="Attendance date">
              <input
                className={controlClassName}
                id="attendance-date"
                name="attendanceDate"
                type="date"
              />
            </FormField>
            <FormField id="attendance-class" label="Class / programme">
              <select
                className={controlClassName}
                defaultValue=""
                disabled
                id="attendance-class"
                name="classProgramme"
              >
                <option value="">Class options unavailable</option>
              </select>
            </FormField>
            <FormField id="attendance-student" label="Student">
              <select
                className={controlClassName}
                defaultValue=""
                disabled
                id="attendance-student"
                name="student"
              >
                <option value="">Student list unavailable</option>
              </select>
            </FormField>
            <FormField id="attendance-status" label="Attendance status">
              <select
                className={controlClassName}
                defaultValue=""
                id="attendance-status"
                name="status"
              >
                <option disabled value="">
                  Select a status
                </option>
                {attendanceStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField id="attendance-notes" label="Notes (optional)">
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  id="attendance-notes"
                  name="notes"
                  placeholder="Add optional notes"
                />
              </FormField>
            </div>
          </div>

          <div className="rounded-xl border border-dashed bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm">
                <ListChecks aria-hidden="true" className="size-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Student list unavailable</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Student and class options will appear when an approved
                  attendance data source is connected. No student entries are
                  shown in this preview.
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex gap-3 rounded-lg border bg-muted/30 p-3.5"
            role="note"
          >
            <Info
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Attendance saving is not connected. This form does not update
              student records or create attendance entries.
            </p>
          </div>
          <Button className="w-full" disabled type="submit" variant="secondary">
            Save unavailable in preview
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
