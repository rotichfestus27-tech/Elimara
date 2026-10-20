import { Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type AcademicSection = "classes" | "programmes" | "subjects" | "years";

type AcademicField = {
  name: string;
  label: string;
  type?: "text" | "date" | "select";
  options?: string[];
  placeholder?: string;
};

const formFields: Record<AcademicSection, AcademicField[]> = {
  classes: [
    { name: "className", label: "Class name", placeholder: "Enter class name" },
    { name: "classCode", label: "Class code", placeholder: "Enter class code" },
    {
      name: "programme",
      label: "Programme",
      type: "select",
      options: [],
      placeholder: "Programme options unavailable",
    },
    {
      name: "academicYear",
      label: "Academic year",
      type: "select",
      options: [],
      placeholder: "Academic year options unavailable",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Active", "Inactive"],
      placeholder: "Select status",
    },
  ],
  programmes: [
    {
      name: "programmeName",
      label: "Programme name",
      placeholder: "Enter programme name",
    },
    {
      name: "programmeCode",
      label: "Programme code",
      placeholder: "Enter programme code",
    },
    {
      name: "qualification",
      label: "Qualification / level",
      placeholder: "Enter qualification or level",
    },
    { name: "duration", label: "Duration", placeholder: "Enter duration" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Active", "Inactive"],
      placeholder: "Select status",
    },
  ],
  subjects: [
    {
      name: "subjectName",
      label: "Subject name",
      placeholder: "Enter subject name",
    },
    {
      name: "subjectCode",
      label: "Subject code",
      placeholder: "Enter subject code",
    },
    {
      name: "classOrProgramme",
      label: "Class / programme",
      type: "select",
      options: [],
      placeholder: "Class and programme options unavailable",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Active", "Inactive"],
      placeholder: "Select status",
    },
  ],
  years: [
    { name: "yearName", label: "Academic year name", placeholder: "Enter year name" },
    { name: "startDate", label: "Start date", type: "date" },
    { name: "endDate", label: "End date", type: "date" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Upcoming", "Active", "Completed"],
      placeholder: "Select status",
    },
  ],
};

const sectionTitles: Record<AcademicSection, string> = {
  classes: "Class",
  programmes: "Programme",
  subjects: "Subject",
  years: "Academic year",
};

type AcademicItemSheetProps = {
  section: AcademicSection;
};

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function AcademicItemSheet({ section }: AcademicItemSheetProps) {
  const title = sectionTitles[section];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Add Academic Item
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="academic-item-form-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Add {title}</SheetTitle>
          <SheetDescription id="academic-item-form-description">
            Presentational preview only. Academic records are not saved.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {formFields[section].map((field) => (
              <div key={field.name} className="space-y-1.5">
                <label
                  className="text-xs font-medium text-foreground"
                  htmlFor={`academic-${field.name}`}
                >
                  {field.label}
                </label>
                {field.type === "select" ? (
                  <select
                    className={controlClassName}
                    defaultValue=""
                    disabled={!field.options?.length}
                    id={`academic-${field.name}`}
                    name={field.name}
                  >
                    <option disabled value="">
                      {field.placeholder}
                    </option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={controlClassName}
                    id={`academic-${field.name}`}
                    name={field.name}
                    placeholder={field.placeholder}
                    type={field.type ?? "text"}
                  />
                )}
              </div>
            ))}
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
              This form is a UI preview. Saving and validation against school
              records are not connected.
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
