import { Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type AcademicSection = "classes" | "terms" | "subjects" | "years";

type AcademicField = {
  name: string;
  label: string;
  type?: "text" | "date" | "select";
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  unavailable?: boolean;
};

const formFields: Record<AcademicSection, AcademicField[]> = {
  classes: [
    {
      name: "academicYearId",
      label: "Academic year",
      type: "select",
      placeholder: "Academic year options unavailable",
      required: true,
      unavailable: true,
    },
    {
      name: "name",
      label: "Class name",
      placeholder: "Enter class name",
      required: true,
      maxLength: 100,
    },
  ],
  terms: [
    {
      name: "academicYearId",
      label: "Academic year",
      type: "select",
      placeholder: "Academic year options unavailable",
      required: true,
      unavailable: true,
    },
    {
      name: "name",
      label: "Term name",
      placeholder: "Enter term name",
      required: true,
      maxLength: 100,
    },
    {
      name: "startsOn",
      label: "Start date",
      type: "date",
      required: true,
    },
    {
      name: "endsOn",
      label: "End date",
      type: "date",
      required: true,
    },
  ],
  subjects: [
    {
      name: "name",
      label: "Subject name",
      placeholder: "Enter subject name",
      required: true,
      maxLength: 120,
    },
  ],
  years: [
    {
      name: "name",
      label: "Academic year name",
      placeholder: "Enter academic year name",
      required: true,
      maxLength: 100,
    },
    {
      name: "startsOn",
      label: "Start date",
      type: "date",
      required: true,
    },
    {
      name: "endsOn",
      label: "End date",
      type: "date",
      required: true,
    },
  ],
};

const sectionTitles: Record<AcademicSection, string> = {
  classes: "Class",
  terms: "Term",
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
          {title} form preview
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="academic-item-form-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>{title} form preview</SheetTitle>
          <SheetDescription id="academic-item-form-description">
            This form follows the documented field shape for review only.
            Nothing is saved while the API contract and access grants remain
            unapproved.
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
                  {field.required ? " *" : ""}
                </label>
                {field.type === "select" ? (
                  <select
                    aria-describedby={
                      field.unavailable
                        ? "academic-year-context-unavailable"
                        : undefined
                    }
                    className={controlClassName}
                    disabled={field.unavailable}
                    id={`academic-${field.name}`}
                    name={field.name}
                    required={field.required}
                    value=""
                  >
                    <option value="">{field.placeholder}</option>
                  </select>
                ) : (
                  <input
                    className={controlClassName}
                    id={`academic-${field.name}`}
                    maxLength={field.maxLength}
                    name={field.name}
                    placeholder={field.placeholder}
                    required={field.required}
                    type={field.type ?? "text"}
                  />
                )}
                {field.unavailable && (
                  <p
                    className="text-xs text-muted-foreground"
                    id="academic-year-context-unavailable"
                  >
                    Academic-year choices require an approved data connection.
                  </p>
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
              No academic records are created by this preview. Academic
              configuration access requires an approved contract and
              server-side permission grant.
            </p>
          </div>
          <Button className="w-full" disabled type="submit" variant="secondary">
            Save unavailable pending approval
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
