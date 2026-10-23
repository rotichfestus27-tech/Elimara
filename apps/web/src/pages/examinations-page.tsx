import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { useSchoolList } from "@/lib/api/school-data";

type Assessment = {
  id: string;
  name: string;
  subjectName: string;
  startsOn: string;
  endsOn: string;
  status: "DRAFT" | "OPEN" | "MODERATION" | "FINALIZED" | "PUBLISHED";
  eligibleCount: number;
  enteredCount: number;
  missingCount: number;
};

export function ExaminationsPage() {
  const [status, setStatus] = useState("all");
  const assessments = useSchoolList<Assessment>("/assessments", {
    limit: 100,
    offset: 0,
    status: status === "all" ? undefined : status,
  });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Assessment</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Assessments and results</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Review assessment schedules and result-entry completion. Published report-card data is accessed through its student-specific workflow.
        </p>
      </section>
      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <label className="block max-w-xs space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Assessment status</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="OPEN">Open</option>
              <option value="MODERATION">Moderation</option>
              <option value="FINALIZED">Finalized</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Assessment</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Results entered</th>
                  <th className="px-4 py-3 font-medium">Missing</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assessments.isPending ? (
                  <tr><td colSpan={6}><RequestLoading /></td></tr>
                ) : assessments.isError ? (
                  <tr><td colSpan={6}><RequestError error={assessments.error} /></td></tr>
                ) : assessments.data.data.length === 0 ? (
                  <tr><td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={6}>No assessments found.</td></tr>
                ) : assessments.data.data.map((assessment) => (
                  <tr className="border-t" key={assessment.id}>
                    <td className="px-4 py-3 font-medium">{assessment.name}</td>
                    <td className="px-4 py-3">{assessment.subjectName}</td>
                    <td className="px-4 py-3">{assessment.startsOn} – {assessment.endsOn}</td>
                    <td className="px-4 py-3">{assessment.enteredCount} / {assessment.eligibleCount}</td>
                    <td className="px-4 py-3">{assessment.missingCount}</td>
                    <td className="px-4 py-3">{assessment.status.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!assessments.isError && !assessments.isPending && (
            <p className="text-xs text-muted-foreground">
              Showing {assessments.data.data.length} of {assessments.data.meta.total} assessments.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
