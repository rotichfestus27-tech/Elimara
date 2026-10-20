import { Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FormField } from "@/components/students/form-field";

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function CreateExaminationSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Create Examination
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="create-examination-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Create examination</SheetTitle>
          <SheetDescription id="create-examination-description">
            Presentational preview only. Examination details are not saved.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField id="examination-name" label="Examination name">
                <input
                  className={controlClassName}
                  id="examination-name"
                  name="name"
                  placeholder="Enter examination name"
                />
              </FormField>
            </div>
            <FormField id="examination-type" label="Examination type">
              <select
                className={controlClassName}
                defaultValue=""
                id="examination-type"
                name="type"
              >
                <option disabled value="">
                  Select examination type
                </option>
                <option value="internal">Internal</option>
                <option value="external">External</option>
                <option value="assessment">Assessment</option>
              </select>
            </FormField>
            <FormField id="examination-academic-year" label="Academic year">
              <select
                className={controlClassName}
                defaultValue=""
                disabled
                id="examination-academic-year"
                name="academicYear"
              >
                <option value="">Academic year options unavailable</option>
              </select>
            </FormField>
            <FormField id="examination-start-date" label="Start date">
              <input
                className={controlClassName}
                id="examination-start-date"
                name="startDate"
                type="date"
              />
            </FormField>
            <FormField id="examination-end-date" label="End date">
              <input
                className={controlClassName}
                id="examination-end-date"
                name="endDate"
                type="date"
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                id="examination-description"
                label="Description or instructions"
              >
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  id="examination-description"
                  name="description"
                  placeholder="Add examination instructions (optional)"
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
              Saving is not connected. This form does not create or update
              examination records.
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
