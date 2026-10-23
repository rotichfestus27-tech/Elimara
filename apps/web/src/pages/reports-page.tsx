import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RequestError } from "@/components/api/request-state";
import { useAuth } from "@/app/auth-provider";
import { downloadReport } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";

type ReportType = "students" | "attendance" | "academics" | "finance" | "staff";
type AcademicYear = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Term = { id: string; name: string; academicYearId: string; status: "ACTIVE" | "INACTIVE" };

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReportsPage() {
  const { school } = useAuth();
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
  const years = useSchoolList<AcademicYear>("/academic-years", { limit: 100, offset: 0, status: "ACTIVE" });
  const terms = useSchoolList<Term>(
    "/terms",
    { academicYearId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: Boolean(academicYearId) },
  );

  async function exportSelected() {
    if (!school) return;
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (report === "attendance" || report === "finance") {
        query.set("from", from);
        query.set("to", to);
      }
      if (report === "academics") {
        query.set("academicYearId", academicYearId);
        query.set("termId", termId);
      }
      const suffix = query.size ? `?${query.toString()}` : "";
      await downloadReport(
        `/schools/${encodeURIComponent(school.id)}/reports/${report}/export.csv${suffix}`,
        `${report}-report.csv`,
      );
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError : new Error("Report export failed."));
    } finally {
      setBusy(false);
    }
  }

  const invalidRange = from > to;
  const requiresAcademicContext = report === "academics";
  const disabled =
    busy ||
    invalidRange ||
    (requiresAcademicContext && (!academicYearId || !termId)) ||
    ((report === "attendance" || report === "finance") && (!from || !to));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Reporting</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reports</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Generate authorized CSV reports from the school’s current source records. Large exports are bounded by the API.
        </p>
      </section>
      <Card className="max-w-3xl shadow-none">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <label className="block space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Report</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              onChange={(event) => setReport(event.target.value as ReportType)}
              value={report}
            >
              <option value="students">Student directory</option>
              <option value="attendance">Attendance summary</option>
              <option value="academics">Academic summary</option>
              <option value="finance">Finance summary</option>
              <option value="staff">Staff directory</option>
            </select>
          </label>

          {(report === "attendance" || report === "finance") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">From</span>
                <input className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">To</span>
                <input className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setTo(event.target.value)} type="date" value={to} />
              </label>
            </div>
          )}

          {report === "academics" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Academic year</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  onChange={(event) => {
                    setAcademicYearId(event.target.value);
                    setTermId("");
                  }}
                  value={academicYearId}
                >
                  <option value="">Choose a year</option>
                  {years.data?.data.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
                </select>
                {years.isError && <RequestError error={years.error} />}
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Term</span>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setTermId(event.target.value)} value={termId}>
                  <option value="">Choose a term</option>
                  {terms.data?.data.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
                </select>
                {terms.isError && <RequestError error={terms.error} />}
              </label>
            </div>
          )}

          {invalidRange && <p className="text-sm text-destructive" role="alert">The start date must be on or before the end date.</p>}
          {error && <RequestError error={error} />}
          <Button disabled={disabled} onClick={() => void exportSelected()} type="button">
            {busy ? "Generating report..." : "Download CSV"}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Reports are permission-checked and audited by the backend. This feature does not retain generated files.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
