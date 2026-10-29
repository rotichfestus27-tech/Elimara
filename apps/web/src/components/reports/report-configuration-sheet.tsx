import { Info } from "lucide-react";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

export type ReportOption = {
  id: string;
  title: string;
  description: string;
  category: string;
  supportsStudentFilter: boolean;
};

type ReportConfigurationSheetProps = {
  report: ReportOption | null;
  onClose: () => void;
};

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ReportConfigurationSheet({
  report,
  onClose,
}: ReportConfigurationSheetProps) {
  return (
    <Sheet
      open={report !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        aria-describedby="report-configuration-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>
            {report ? `Prepare ${report.title}` : "Prepare report"}
          </SheetTitle>
          <SheetDescription id="report-configuration-description">
            Configure preview filters for this report. No report will be
            generated or downloaded.
          </SheetDescription>
        </div>

        {report && (
          <form
            className="mt-7 space-y-6"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="report-type" label="Report type">
                <input
                  className={inputClassName}
                  id="report-type"
                  readOnly
                  value={report.title}
                />
              </FormField>
              <FormField id="report-category" label="Category">
                <input
                  className={inputClassName}
                  id="report-category"
                  readOnly
                  value={report.category}
                />
              </FormField>
              <FormField id="report-start-date" label="Start date">
                <input
                  className={inputClassName}
                  id="report-start-date"
                  name="startDate"
                  type="date"
                />
              </FormField>
              <FormField id="report-end-date" label="End date">
                <input
                  className={inputClassName}
                  id="report-end-date"
                  name="endDate"
                  type="date"
                />
              </FormField>
              <FormField id="report-academic-year" label="Academic year">
                <select
                  className={inputClassName}
                  defaultValue="all"
                  id="report-academic-year"
                  name="academicYear"
                >
                  <option value="all">All academic years</option>
                  <option disabled value="unavailable">
                    Options unavailable
                  </option>
                </select>
              </FormField>
              <FormField id="report-class" label="Class / programme">
                <select
                  className={inputClassName}
                  defaultValue="all"
                  id="report-class"
                  name="class"
                >
                  <option value="all">All classes / programmes</option>
                  <option disabled value="unavailable">
                    Options unavailable
                  </option>
                </select>
              </FormField>
              {report.supportsStudentFilter && (
                <div className="sm:col-span-2">
                  <FormField id="report-student" label="Student">
                    <select
                      className={inputClassName}
                      defaultValue="all"
                      id="report-student"
                      name="student"
                    >
                      <option value="all">All students</option>
                      <option disabled value="unavailable">
                        Student records unavailable
                      </option>
                    </select>
                  </FormField>
                </div>
              )}
              <div className="sm:col-span-2">
                <FormField id="report-format" label="Report format">
                  <select
                    className={inputClassName}
                    defaultValue="pdf"
                    id="report-format"
                    name="format"
                  >
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                  </select>
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
                Live data and report generation are not connected. These
                filters are for presentation only; no report file is created,
                exported, or downloaded.
              </p>
            </div>
            <Button className="w-full" disabled type="button" variant="secondary">
              Report generation unavailable
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
