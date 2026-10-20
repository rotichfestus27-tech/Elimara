import { Info, UserRoundPlus } from "lucide-react";
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

export function AddStudentSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <UserRoundPlus aria-hidden="true" />
          Add student
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="student-form-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Add student</SheetTitle>
          <SheetDescription id="student-form-description">
            Presentational preview only. Student information is not saved.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="student-name" label="Student name">
              <input
                autoComplete="off"
                className={inputClassName}
                id="student-name"
                name="studentName"
                placeholder="Enter student name"
              />
            </FormField>
            <FormField id="admission-number" label="Admission number">
              <input
                autoComplete="off"
                className={inputClassName}
                id="admission-number"
                name="admissionNumber"
                placeholder="Enter admission number"
              />
            </FormField>
            <FormField id="programme" label="Programme / class">
              <input
                autoComplete="off"
                className={inputClassName}
                id="programme"
                name="programme"
                placeholder="Enter programme or class"
              />
            </FormField>
            <FormField id="contact" label="Contact">
              <input
                autoComplete="off"
                className={inputClassName}
                id="contact"
                name="contact"
                placeholder="Enter contact details"
              />
            </FormField>
            <FormField id="enrolment-date" label="Enrolment date">
              <input
                className={inputClassName}
                id="enrolment-date"
                name="enrolmentDate"
                type="date"
              />
            </FormField>
            <FormField id="student-status" label="Status">
              <select
                className={inputClassName}
                defaultValue=""
                id="student-status"
                name="status"
              >
                <option disabled value="">
                  Select a status
                </option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
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
              This form demonstrates the future interface only. It does not
              create or save student records.
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
