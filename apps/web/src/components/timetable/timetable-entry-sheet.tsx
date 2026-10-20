import { Info, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FormField } from "@/components/students/form-field";

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function TimetableEntrySheet() {
  const [scheduleType, setScheduleType] = useState<"weekday" | "date">(
    "weekday",
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const invalidTimeRange =
    startTime !== "" && endTime !== "" && endTime <= startTime;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Add Timetable Entry
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="timetable-entry-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Add timetable entry</SheetTitle>
          <SheetDescription id="timetable-entry-description">
            Schedule entry preview only. Timetable data is not saved or
            transmitted.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <p className="text-xs text-muted-foreground">
            Fields marked with <span className="text-destructive">*</span> are
            required in a future connected workflow.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="timetable-class" label="Class / programme *">
              <input
                className={inputClassName}
                id="timetable-class"
                name="class"
                placeholder="Enter class or programme"
                required
              />
            </FormField>
            <FormField id="timetable-subject" label="Subject *">
              <input
                className={inputClassName}
                id="timetable-subject"
                name="subject"
                placeholder="Enter subject"
                required
              />
            </FormField>
            <FormField id="timetable-teacher" label="Teacher *">
              <input
                className={inputClassName}
                id="timetable-teacher"
                name="teacher"
                placeholder="Enter teacher name"
                required
              />
            </FormField>
            <FormField id="timetable-room" label="Room / venue *">
              <input
                className={inputClassName}
                id="timetable-room"
                name="room"
                placeholder="Enter room or venue"
                required
              />
            </FormField>
            <FormField id="timetable-schedule-type" label="Schedule by *">
              <select
                className={inputClassName}
                id="timetable-schedule-type"
                onChange={(event) =>
                  setScheduleType(event.target.value as "weekday" | "date")
                }
                value={scheduleType}
              >
                <option value="weekday">Weekday</option>
                <option value="date">Specific date</option>
              </select>
            </FormField>
            {scheduleType === "weekday" ? (
              <FormField id="timetable-weekday" label="Weekday *">
                <select
                  className={inputClassName}
                  defaultValue=""
                  id="timetable-weekday"
                  name="weekday"
                  required
                >
                  <option disabled value="">
                    Select weekday
                  </option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                </select>
              </FormField>
            ) : (
              <FormField id="timetable-date" label="Date *">
                <input
                  className={inputClassName}
                  id="timetable-date"
                  name="date"
                  required
                  type="date"
                />
              </FormField>
            )}
            <FormField id="timetable-start-time" label="Start time *">
              <input
                className={inputClassName}
                id="timetable-start-time"
                name="startTime"
                onChange={(event) => setStartTime(event.target.value)}
                required
                type="time"
                value={startTime}
              />
            </FormField>
            <FormField id="timetable-end-time" label="End time *">
              <input
                aria-describedby={
                  invalidTimeRange ? "timetable-time-error" : undefined
                }
                aria-invalid={invalidTimeRange}
                className={inputClassName}
                id="timetable-end-time"
                min={startTime || undefined}
                name="endTime"
                onChange={(event) => setEndTime(event.target.value)}
                required
                type="time"
                value={endTime}
              />
            </FormField>
            {invalidTimeRange && (
              <p
                className="text-xs text-destructive sm:col-span-2"
                id="timetable-time-error"
                role="alert"
              >
                End time must be later than start time.
              </p>
            )}
            <div className="sm:col-span-2">
              <FormField id="timetable-notes" label="Notes (optional)">
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  id="timetable-notes"
                  name="notes"
                  placeholder="Add optional notes"
                />
              </FormField>
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
              Saving timetable entries is not connected. This preview does not
              persist or transmit the information entered.
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
