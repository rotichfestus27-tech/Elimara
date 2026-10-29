import { useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import { ApiClientError } from "@/lib/api/client";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

type StudentOption = {
  id: string;
  admissionNumber: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
};

type AcademicPeriod = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "ACTIVE" | "INACTIVE";
};

type Term = AcademicPeriod & { academicYearId: string };

type ReportCardItem = {
  assessmentId: string;
  assessmentName: string;
  termId: string;
  subjectId: string;
  subjectName: string;
  startsOn: string;
  score: string;
  maximumScore: string;
  percentage: string;
  gradeCode: string;
  gradeLabel: string;
};

const pageSize = 100;

export function StudentReportCard() {
  const { school } = useAuth();
  const canReadReports = Boolean(school?.permissions.includes("assessments.read"));
  const canReadStudents = Boolean(school?.permissions.includes("students.profile.read"));
  const canReadPeriods = Boolean(school?.permissions.includes("academics.configuration.read"));
  const canUseStaffReport = canReadReports && canReadStudents && canReadPeriods;
  const [studentSearch, setStudentSearch] = useState("");
  const [studentOffset, setStudentOffset] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [yearOffset, setYearOffset] = useState(0);
  const [termOffset, setTermOffset] = useState(0);
  const search = studentSearch.trim();
  const yearsQuery = useSchoolList<AcademicPeriod>(
    "/academic-years",
    { limit: pageSize, offset: yearOffset, sortBy: "startsOn", sortOrder: "desc" },
    { enabled: canUseStaffReport },
  );
  const effectiveAcademicYearId = academicYearId || yearsQuery.data?.data[0]?.id || "";
  const termsQuery = useSchoolList<Term>(
    "/terms",
    {
      academicYearId: effectiveAcademicYearId,
      limit: pageSize,
      offset: termOffset,
      sortBy: "startsOn",
      sortOrder: "desc",
    },
    { enabled: canUseStaffReport && Boolean(effectiveAcademicYearId) },
  );
  const studentsQuery = useSchoolList<StudentOption>(
    "/students",
    {
      limit: pageSize,
      offset: studentOffset,
      q: search || undefined,
      sortBy: "admissionNumber",
      sortOrder: "asc",
    },
    { enabled: canUseStaffReport },
  );
  const effectiveTermId = termId || termsQuery.data?.data[0]?.id || "";
  const reportQuery = useSchoolData<{ data: ReportCardItem[] }>(
    `/students/${encodeURIComponent(selectedStudent?.id ?? "")}/report-card`,
    { academicYearId: effectiveAcademicYearId, termId: effectiveTermId },
    {
      enabled:
        canUseStaffReport &&
        Boolean(selectedStudent?.id && effectiveAcademicYearId && effectiveTermId),
    },
  );

  function changeAcademicYear(value: string) {
    setAcademicYearId(value);
    setTermId("");
    setTermOffset(0);
  }

  function printReport() {
    document.body.dataset.printReport = "true";
    window.addEventListener(
      "afterprint",
      () => {
        delete document.body.dataset.printReport;
      },
      { once: true },
    );
    window.print();
  }

  const deniedQuery = [yearsQuery, termsQuery, studentsQuery, reportQuery].find(
    (query) => query.isError && isPermissionDenied(query.error),
  );
  const failedQuery = [yearsQuery, termsQuery, studentsQuery, reportQuery].find(
    (query) => query.isError && !isPermissionDenied(query.error),
  );

  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-2 p-4 sm:p-5">
        <p className="text-sm font-medium text-primary">Staff-facing</p>
        <h2 className="text-lg font-semibold leading-none tracking-tight">Student report card</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          View published assessment results for a student in this school and academic period.
          Student and guardian self-service access is not provided here.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-4 pt-0 sm:p-5 sm:pt-0">
        {!canUseStaffReport ? (
          <UnauthorizedState
            className="py-5"
            description="This staff view requires assessment read, student profile read, and academic configuration read access. Your server-returned permissions do not include all required access."
            title="Report-card access unavailable"
          />
        ) : deniedQuery ? (
          <UnauthorizedState
            className="py-5"
            description="The backend denied access to the student, academic-period, or report-card data."
            title="Report-card access denied"
          />
        ) : failedQuery ? (
          <ErrorState
            className="py-5"
            message="Required report-card data could not be loaded."
            onRetry={() => void failedQuery.refetch()}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Student</span>
                <select
                  className={controlClassName}
                  onChange={(event) => {
                    const student =
                      studentsQuery.data?.data.find(({ id }) => id === event.target.value) ?? null;
                    setSelectedStudent(student);
                  }}
                  value={selectedStudent?.id ?? ""}
                >
                  <option value="">Select a student</option>
                  {studentsQuery.data?.data.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.admissionNumber} — {student.givenName}
                      {student.middleName ? ` ${student.middleName}` : ""} {student.familyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Academic year</span>
                <select
                  className={controlClassName}
                  onChange={(event) => changeAcademicYear(event.target.value)}
                  value={effectiveAcademicYearId}
                >
                  <option value="">Select an academic year</option>
                  {yearsQuery.data?.data.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name} ({year.status.toLocaleLowerCase()})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Term</span>
                <select
                  className={controlClassName}
                  disabled={!effectiveAcademicYearId || termsQuery.isPending}
                  onChange={(event) => setTermId(event.target.value)}
                  value={effectiveTermId}
                >
                  <option value="">Select a term</option>
                  {termsQuery.data?.data.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name} ({term.status.toLocaleLowerCase()})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Find student</span>
                <input
                  autoComplete="off"
                  className={controlClassName}
                  onChange={(event) => {
                    setStudentSearch(event.target.value);
                    setStudentOffset(0);
                    setSelectedStudent(null);
                  }}
                  placeholder="Search by name or admission number"
                  type="search"
                  value={studentSearch}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={studentOffset === 0}
                  onClick={() => {
                    setStudentOffset((offset) => Math.max(0, offset - pageSize));
                    setSelectedStudent(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Previous students
                </Button>
                <Button
                  disabled={
                    !studentsQuery.data ||
                    studentOffset + studentsQuery.data.data.length >= studentsQuery.data.meta.total
                  }
                  onClick={() => {
                    setStudentOffset((offset) => offset + pageSize);
                    setSelectedStudent(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  More students
                </Button>
              </div>
            </div>

            {yearsQuery.isPending || studentsQuery.isPending ? (
              <LoadingState className="min-h-28" message="Loading report-card choices..." />
            ) : yearsQuery.data?.data.length === 0 ? (
              <EmptyState
                className="py-5"
                description="Add an academic year before selecting a report-card period."
                title="No academic years available"
              />
            ) : studentsQuery.data?.data.length === 0 ? (
              <EmptyState
                className="py-5"
                description={
                  search
                    ? "Try another name or admission number."
                    : "No student records are available in this school."
                }
                title={search ? "No matching students" : "No students available"}
              />
            ) : !effectiveTermId ? (
              termsQuery.isPending ? (
                <LoadingState className="min-h-28" message="Loading academic terms..." />
              ) : (
                <EmptyState
                  className="py-5"
                  description="Choose an academic year that contains a term."
                  title="No terms available"
                />
              )
            ) : !selectedStudent ? (
              <EmptyState
                className="py-5"
                description="Select a student and academic period to retrieve published results."
                title="Choose report-card details"
              />
            ) : reportQuery.isPending ? (
              <LoadingState className="min-h-28" message="Loading published report-card data..." />
            ) : reportQuery.isError ? (
              <ErrorState
                className="py-5"
                message="The report card could not be loaded."
                onRetry={() => void reportQuery.refetch()}
              />
            ) : reportQuery.data.data.length === 0 ? (
              <EmptyState
                className="py-5"
                description="No published assessment results were returned for this student and period."
                title="No published results"
              />
            ) : (
              <ReportCard
                academicYear={yearsQuery.data?.data.find(
                  ({ id }) => id === effectiveAcademicYearId,
                )}
                items={reportQuery.data.data}
                onPrint={printReport}
                student={selectedStudent}
                term={termsQuery.data?.data.find(({ id }) => id === effectiveTermId)}
              />
            )}

            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {studentsQuery.data
                  ? studentsQuery.data.meta.total === 0
                    ? "Students 0 of 0"
                    : `Students ${studentOffset + 1}–${studentOffset + studentsQuery.data.data.length} of ${studentsQuery.data.meta.total}`
                  : "Loading student list..."}
              </span>
              {yearsQuery.data?.meta.total !== undefined &&
                yearsQuery.data.meta.total > pageSize && (
                  <span>
                    Academic years are paged ({yearOffset + 1}–
                    {yearOffset + (yearsQuery.data?.data.length ?? 0)} of{" "}
                    {yearsQuery.data.meta.total}).
                  </span>
                )}
            </div>
            {yearsQuery.data && yearsQuery.data.meta.total > pageSize && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={yearOffset === 0}
                  onClick={() => {
                    setYearOffset((offset) => Math.max(0, offset - pageSize));
                    setAcademicYearId("");
                    setTermId("");
                    setTermOffset(0);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Previous years
                </Button>
                <Button
                  disabled={yearOffset + yearsQuery.data.data.length >= yearsQuery.data.meta.total}
                  onClick={() => {
                    setYearOffset((offset) => offset + pageSize);
                    setAcademicYearId("");
                    setTermId("");
                    setTermOffset(0);
                  }}
                  size="sm"
                  variant="outline"
                >
                  More years
                </Button>
              </div>
            )}
            {termsQuery.data && termsQuery.data.meta.total > pageSize && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={termOffset === 0}
                  onClick={() => {
                    setTermOffset((offset) => Math.max(0, offset - pageSize));
                    setTermId("");
                  }}
                  size="sm"
                  variant="outline"
                >
                  Previous terms
                </Button>
                <Button
                  disabled={termOffset + termsQuery.data.data.length >= termsQuery.data.meta.total}
                  onClick={() => {
                    setTermOffset((offset) => offset + pageSize);
                    setTermId("");
                  }}
                  size="sm"
                  variant="outline"
                >
                  More terms
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReportCard({
  academicYear,
  items,
  onPrint,
  student,
  term,
}: {
  academicYear?: AcademicPeriod;
  items: ReportCardItem[];
  onPrint: () => void;
  student: StudentOption;
  term?: Term;
}) {
  return (
    <section
      aria-label="Published student report card"
      className="rounded-lg border p-4 sm:p-6"
      data-printable-report
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Published report card</h3>
          <p className="text-sm text-muted-foreground">
            {student.givenName} {student.middleName ? `${student.middleName} ` : ""}
            {student.familyName} · {student.admissionNumber}
          </p>
          <p className="text-sm text-muted-foreground">
            {academicYear?.name ?? "Academic year"} · {term?.name ?? "Term"}
          </p>
        </div>
        <Button className="print:hidden" onClick={onPrint} size="sm" variant="outline">
          Print report card
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table
          aria-label="Published report-card assessment results"
          className="w-full min-w-[720px] text-left text-sm"
        >
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium" scope="col">
                Subject
              </th>
              <th className="px-3 py-2 font-medium" scope="col">
                Assessment
              </th>
              <th className="px-3 py-2 font-medium" scope="col">
                Date
              </th>
              <th className="px-3 py-2 font-medium" scope="col">
                Score
              </th>
              <th className="px-3 py-2 font-medium" scope="col">
                Percentage
              </th>
              <th className="px-3 py-2 font-medium" scope="col">
                Grade
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.assessmentId}>
                <td className="px-3 py-2 font-medium">{item.subjectName}</td>
                <td className="px-3 py-2">{item.assessmentName}</td>
                <td className="px-3 py-2">{formatDate(item.startsOn)}</td>
                <td className="px-3 py-2">
                  {item.score} / {item.maximumScore}
                </td>
                <td className="px-3 py-2">{item.percentage}%</td>
                <td className="px-3 py-2">
                  {item.gradeCode} — {item.gradeLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isPermissionDenied(error: Error | null): boolean {
  return error instanceof ApiClientError && error.status === 403;
}
