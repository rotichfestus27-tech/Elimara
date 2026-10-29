import { useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { RequestError } from "@/components/api/request-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { downloadReport } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";

type ReportType = "students" | "attendance" | "academics" | "finance" | "staff";
type AcademicYear = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Term = { id: string; name: string; academicYearId: string; status: "ACTIVE" | "INACTIVE" };

const reportPermissions: Record<ReportType, readonly string[]> = {
  students: ["reports.exports.generate", "reports.students.read", "students.profile.read"],
  attendance: ["reports.exports.generate", "reports.attendance.read", "attendance.register.read"],
  academics: [
    "reports.exports.generate",
    "reports.academics.read",
    "assessments.read",
    "academics.configuration.read",
  ],
  finance: ["reports.exports.generate", "reports.finance.read", "finance.reports.read"],
  staff: ["reports.exports.generate", "reports.staff.read", "staff.profile.read"],
};

const reportOptions: readonly { value: ReportType; label: string }[] = [
  { value: "students", label: "Student directory" },
  { value: "attendance", label: "Attendance summary" },
  { value: "academics", label: "Academic summary" },
  { value: "finance", label: "Finance summary" },
  { value: "staff", label: "Staff directory" },
];

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRangeError(from: string, to: string) {
  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };

  if (!from || !to) return "Choose both a start and end date.";
  if (!isValidDate(from) || !isValidDate(to)) return "Enter valid start and end dates.";

  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (start > end) return "The start date must be on or before the end date.";
  if ((end - start) / 86_400_000 + 1 > 366) {
    return "Choose a date range of no more than 366 days.";
  }
  return null;
}

export function ReportsPage() {
  const { school } = useAuth();
  const permissions = new Set(school?.permissions ?? []);
  const availableReports = reportOptions.filter(({ value }) =>
    reportPermissions[value].every((permission) => permissions.has(permission)),
  );
  const [report, setReport] = useState<ReportType>("students");
  const [from, setFrom] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return localDate(start);
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeReport = availableReports.some((option) => option.value === report)
    ? report
    : availableReports[0]?.value;
  const canExportAcademics = availableReports.some((option) => option.value === "academics");
  const years = useSchoolList<AcademicYear>(
    "/academic-years",
    { limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: canExportAcademics },
  );
  const terms = useSchoolList<Term>(
    "/terms",
    { academicYearId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: canExportAcademics && Boolean(academicYearId) },
  );

  async function exportSelected() {
    if (!school || !activeReport) return;
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (activeReport === "attendance" || activeReport === "finance") {
        query.set("from", from);
        query.set("to", to);
      }
      if (activeReport === "academics") {
        query.set("academicYearId", academicYearId);
        query.set("termId", termId);
      }
      const suffix = query.size ? `?${query.toString()}` : "";
      await downloadReport(
        `/schools/${encodeURIComponent(school.id)}/reports/${activeReport}/export.csv${suffix}`,
        `${activeReport}-report.csv`,
      );
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError : new Error("Report export failed."));
    } finally {
      setBusy(false);
    }
  }

  const usesDateRange = activeReport === "attendance" || activeReport === "finance";
  const dateRangeError = usesDateRange ? getDateRangeError(from, to) : null;
  const requiresAcademicContext = activeReport === "academics";
  const disabled =
    busy ||
    !activeReport ||
    Boolean(dateRangeError) ||
    (requiresAcademicContext && (!academicYearId || !termId)) ||
    (requiresAcademicContext && (years.isError || terms.isError));

  return (
    <div className="space-y-6">
      <PageHeader
        description="Generate authorized CSV reports from the school’s current source records. Large exports are bounded by the API."
        eyebrow={<p className="text-sm font-medium text-primary">Reporting</p>}
        title="Reports"
      />
      <Card className="max-w-3xl shadow-none">
        <CardContent className="space-y-5 p-4 sm:p-6">
          {availableReports.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              No report exports are available for the permissions in this school context.
            </p>
          ) : (
            <>
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Report</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  onChange={(event) => setReport(event.target.value as ReportType)}
                  value={activeReport}
                >
                  {availableReports.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {usesDateRange && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">From</span>
                    <input
                      className="h-10 w-full rounded-md border border-input bg-background px-3"
                      onChange={(event) => setFrom(event.target.value)}
                      type="date"
                      value={from}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">To</span>
                    <input
                      className="h-10 w-full rounded-md border border-input bg-background px-3"
                      onChange={(event) => setTo(event.target.value)}
                      type="date"
                      value={to}
                    />
                  </label>
                </div>
              )}

              {requiresAcademicContext && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">
                        Academic year
                      </span>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3"
                        disabled={years.isPending}
                        onChange={(event) => {
                          setAcademicYearId(event.target.value);
                          setTermId("");
                        }}
                        value={academicYearId}
                      >
                        <option value="">Choose a year</option>
                        {years.data?.data.map((year) => (
                          <option key={year.id} value={year.id}>
                            {year.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {years.isPending && (
                      <p className="text-xs text-muted-foreground" role="status">
                        Loading academic years...
                      </p>
                    )}
                    {years.data?.data.length === 0 && !years.isError && (
                      <p className="text-xs text-muted-foreground" role="status">
                        No active academic years are available.
                      </p>
                    )}
                    {years.isError && (
                      <div className="space-y-2">
                        <RequestError error={years.error} />
                        <Button
                          onClick={() => void years.refetch()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Retry academic years
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block space-y-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Term</span>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3"
                        disabled={!academicYearId || terms.isPending || years.isError}
                        onChange={(event) => setTermId(event.target.value)}
                        value={termId}
                      >
                        <option value="">Choose a term</option>
                        {terms.data?.data.map((term) => (
                          <option key={term.id} value={term.id}>
                            {term.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {academicYearId && terms.isPending && (
                      <p className="text-xs text-muted-foreground" role="status">
                        Loading terms...
                      </p>
                    )}
                    {academicYearId && terms.data?.data.length === 0 && !terms.isError && (
                      <p className="text-xs text-muted-foreground" role="status">
                        No active terms are available for this academic year.
                      </p>
                    )}
                    {terms.isError && (
                      <div className="space-y-2">
                        <RequestError error={terms.error} />
                        <Button
                          onClick={() => void terms.refetch()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Retry terms
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {dateRangeError && (
                <p className="text-sm text-destructive" role="alert">
                  {dateRangeError}
                </p>
              )}
              {error && <RequestError error={error} />}
              <Button disabled={disabled} onClick={() => void exportSelected()} type="button">
                {busy ? "Generating report..." : "Download CSV"}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                Reports are permission-checked and audited by the backend. This feature does not
                retain generated files.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
