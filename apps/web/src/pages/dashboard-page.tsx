import {
  Activity,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  Loader2,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { AdmissionsPipeline } from "@/components/dashboard/admissions-pipeline";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { SummaryCard, type SummaryCardItem } from "@/components/dashboard/summary-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";
import { formatKes } from "@/lib/finance-format";

type AcademicYear = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Term = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type DashboardData = {
  attendance: Array<{ date: string; status: string; total: number }>;
  academics: {
    assessmentCount: number;
    eligibleCount: number;
    enteredCount: number;
    missingCount: number;
    publishedCount: number;
  };
  finance: {
    from: string;
    to: string;
    paymentsReceived: string;
    paymentCount: number;
    outstandingCharges: string;
    unappliedCredit: string;
  };
};

type AttendanceSummaryRow = { date: string; status: string; total: number };

type ApiApplication = {
  id: string;
  givenName: string;
  familyName: string;
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "ACCEPTED"
    | "REJECTED"
    | "WITHDRAWN"
    | "ADMITTED";
  createdAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DashboardPage({ showHeading = true }: { showHeading?: boolean }) {
  const { school } = useAuth();
  const schoolId = school?.id;
  const hasPermissions = (required: readonly string[]) =>
    required.every((permission) => school?.permissions.includes(permission));
  const canReadStudents = hasPermissions(["students.profile.read"]);
  const canReadAdmissions = hasPermissions(["admissions.application.read"]);
  const canReadStaff = hasPermissions(["reports.staff.read", "staff.profile.read"]);
  const canReadAttendance = hasPermissions(["reports.attendance.read", "attendance.register.read"]);
  const canReadAcademicConfiguration = hasPermissions(["academics.configuration.read"]);
  const canReadDashboardReport = hasPermissions([
    "reports.dashboard.read",
    "attendance.register.read",
    "assessments.read",
    "finance.reports.read",
  ]);
  const [yearId, setYearId] = useState("");
  const yearsQuery = useSchoolList<AcademicYear>(
    "/academic-years",
    { limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: canReadAcademicConfiguration },
  );
  const selectedYearId = yearId || yearsQuery.data?.data[0]?.id || "";
  const [termId, setTermId] = useState("");
  const termsQuery = useSchoolList<Term>(
    "/terms",
    { academicYearId: selectedYearId || undefined, limit: 100, status: "ACTIVE" },
    { enabled: Boolean(selectedYearId && canReadAcademicConfiguration) },
  );
  const selectedTermId = termId || termsQuery.data?.data[0]?.id || "";
  const [from, setFrom] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return localDate(start);
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const hasValidDateRange = Boolean(from && to && from <= to);
  const reportQuery = useSchoolData<{ data: DashboardData }>(
    "/reports/dashboard",
    { academicYearId: selectedYearId, termId: selectedTermId, from, to },
    {
      enabled: Boolean(
        canReadDashboardReport && selectedYearId && selectedTermId && hasValidDateRange,
      ),
    },
  );

  const studentsQuery = useSchoolList<{ id: string }>(
    "/students",
    { limit: 1, status: "ACTIVE" },
    { enabled: canReadStudents },
  );
  const applicationsQuery = useSchoolList<ApiApplication>(
    "/admission-applications",
    {
      limit: 5,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    { enabled: canReadAdmissions },
  );
  const staffQuery = useSchoolList<{ id: string }>(
    "/reports/staff",
    { limit: 1, offset: 0 },
    { enabled: canReadStaff },
  );
  const attendanceQuery = useSchoolData<{ data: AttendanceSummaryRow[] }>(
    "/reports/attendance",
    { from, to },
    { enabled: canReadAttendance && hasValidDateRange },
  );

  const totalStudents = studentsQuery.data?.meta.total;
  const totalApplications = applicationsQuery.data?.meta.total;
  const totalStaff = staffQuery.data?.meta.total;
  const totalAttendanceMarks = attendanceQuery.data?.data.reduce(
    (total, row) => total + row.total,
    0,
  );
  const recentApplications = applicationsQuery.data?.data ?? [];

  const summaryCards: SummaryCardItem[] = [
    {
      title: "Active students",
      description: "Students with active status in this school",
      icon: GraduationCap,
      value: !canReadStudents
        ? "Not available"
        : studentsQuery.isLoading
          ? "Loading..."
          : studentsQuery.isError || totalStudents === undefined
            ? "Unavailable"
            : totalStudents,
      subtext: !canReadStudents
        ? "This workspace has no student profile read permission"
        : studentsQuery.isError
          ? "Student count could not be loaded"
          : "Count of active records from the school student list",
    },
    {
      title: "Admissions",
      description: "Applications received by this school",
      icon: UserRoundPlus,
      value: !canReadAdmissions
        ? "Not available"
        : applicationsQuery.isLoading
          ? "Loading..."
          : applicationsQuery.isError || totalApplications === undefined
            ? "Unavailable"
            : totalApplications,
      subtext: !canReadAdmissions
        ? "This workspace has no admissions read permission"
        : applicationsQuery.isError
          ? "Application count could not be loaded"
          : "Count from the school admissions list",
    },
    {
      title: "Staff",
      description: "Staff records in this school",
      icon: UsersRound,
      value: !canReadStaff
        ? "Not available"
        : staffQuery.isLoading
          ? "Loading..."
          : staffQuery.isError || totalStaff === undefined
            ? "Unavailable"
            : totalStaff,
      subtext: !canReadStaff
        ? "This workspace lacks a required staff report permission"
        : staffQuery.isError
          ? "Staff count could not be loaded"
          : "Count from the school staff report",
    },
    {
      title: "Attendance",
      description: "School attendance overview",
      icon: ClipboardCheck,
      value: !canReadAttendance
        ? "Not available"
        : !hasValidDateRange
          ? "Check dates"
          : attendanceQuery.isLoading
            ? "Loading..."
            : attendanceQuery.isError || totalAttendanceMarks === undefined
              ? "Unavailable"
              : totalAttendanceMarks,
      subtext: !canReadAttendance
        ? "This workspace lacks a required attendance report permission"
        : !hasValidDateRange
          ? "Select a valid date range in the school report section"
          : attendanceQuery.isError
            ? "Attendance summary could not be loaded"
            : `Marked attendance records from ${from} through ${to}`,
    },
  ];

  const retryableErrors = [
    studentsQuery.isError && {
      label: "Retry active student count",
      onRetry: () => void studentsQuery.refetch(),
    },
    applicationsQuery.isError && {
      label: "Retry admissions",
      onRetry: () => void applicationsQuery.refetch(),
    },
    staffQuery.isError && {
      label: "Retry staff count",
      onRetry: () => void staffQuery.refetch(),
    },
    attendanceQuery.isError && {
      label: "Retry attendance",
      onRetry: () => void attendanceQuery.refetch(),
    },
  ].filter((item) => item !== false);

  return (
    <div className="space-y-8">
      {showHeading && (
        <section className="max-w-3xl space-y-2">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium text-primary">School overview</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome to your school workspace
            </h2>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Review the school records and operational information currently available to this
              workspace.
            </p>
          </div>
        </section>
      )}

      <section aria-labelledby="overview-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="overview-heading" className="text-base font-semibold">
              At a glance
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Available records for the current school context.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
        {retryableErrors.length > 0 && (
          <div
            className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p className="text-sm text-foreground">
              Some school overview data could not be loaded. You can retry the affected request.
            </p>
            <div className="flex flex-wrap gap-2">
              {retryableErrors.map((item) =>
                item ? (
                  <Button key={item.label} onClick={item.onRetry} size="sm" variant="outline">
                    {item.label}
                  </Button>
                ) : null,
              )}
            </div>
          </div>
        )}
      </section>

      <AdmissionsPipeline />

      <section aria-labelledby="report-heading" className="space-y-4">
        <div>
          <h3 id="report-heading" className="text-base font-semibold">
            School report
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Summaries are limited to data your active school permissions allow.
          </p>
        </div>
        <Card className="shadow-none">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Academic year</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                onChange={(event) => {
                  setYearId(event.target.value);
                  setTermId("");
                }}
                value={selectedYearId}
              >
                <option value="">Choose a year</option>
                {yearsQuery.data?.data.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
              {yearsQuery.isError && <RequestError error={yearsQuery.error} />}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Term</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                onChange={(event) => setTermId(event.target.value)}
                value={selectedTermId}
              >
                <option value="">Choose a term</option>
                {termsQuery.data?.data.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
              {termsQuery.isError && <RequestError error={termsQuery.error} />}
            </label>
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
          </CardContent>
        </Card>
        {from && to && from > to && (
          <p className="text-sm text-destructive" role="alert">
            The start date must be on or before the end date.
          </p>
        )}
        {!canReadAcademicConfiguration || !canReadDashboardReport ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            This combined report is available only when the server-authorized workspace includes
            academic configuration, attendance, assessment, finance, and dashboard-report
            permissions.
          </p>
        ) : !hasValidDateRange ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            Choose a valid date range to view the school report.
          </p>
        ) : !selectedYearId || !selectedTermId ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            Select an active academic year and term to load the report.
          </p>
        ) : reportQuery.isPending ? (
          <RequestLoading />
        ) : reportQuery.isError ? (
          <div className="space-y-3">
            <RequestError error={reportQuery.error} />
            <Button
              onClick={() => void reportQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Retry school report
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Attendance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {reportQuery.data.data.attendance.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No marked attendance in this date range.
                  </p>
                ) : (
                  reportQuery.data.data.attendance.map((row) => (
                    <div
                      className="flex justify-between gap-3 text-sm"
                      key={`${row.date}-${row.status}`}
                    >
                      <span>
                        {row.date} · {row.status.toLowerCase().replaceAll("_", " ")}
                      </span>
                      <span className="font-medium">{row.total}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Academic results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Assessments: <strong>{reportQuery.data.data.academics.assessmentCount}</strong>
                </p>
                <p>
                  Entered: <strong>{reportQuery.data.data.academics.enteredCount}</strong>
                </p>
                <p>
                  Missing: <strong>{reportQuery.data.data.academics.missingCount}</strong>
                </p>
                <p>
                  Published: <strong>{reportQuery.data.data.academics.publishedCount}</strong>
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Finance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Payments received:{" "}
                  <strong>{formatKes(reportQuery.data.data.finance.paymentsReceived)}</strong>
                </p>
                <p>
                  Payment count: <strong>{reportQuery.data.data.finance.paymentCount}</strong>
                </p>
                <p>
                  Outstanding charges:{" "}
                  <strong>{formatKes(reportQuery.data.data.finance.outstandingCharges)}</strong>
                </p>
                <p>
                  Unapplied credit:{" "}
                  <strong>{formatKes(reportQuery.data.data.finance.unappliedCredit)}</strong>
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <section
        aria-label="Recent admissions and quick actions"
        className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]"
      >
        <Card className="shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Recent admissions</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Latest applications recorded for this school.
              </p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <BookOpenCheck aria-hidden="true" className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            {!canReadAdmissions ? (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Admissions are not available to this workspace.
              </p>
            ) : !schoolId ? (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Recent admissions are unavailable without an active school context.
              </p>
            ) : applicationsQuery.isLoading ? (
              <div
                aria-label="Loading recent admissions"
                className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Loading recent admissions...
              </div>
            ) : applicationsQuery.isError ? (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Recent admissions could not be loaded. Use the retry control above to try again.
              </p>
            ) : recentApplications.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center">
                <Activity aria-hidden="true" className="mb-2 size-5 text-muted-foreground" />
                <p className="text-sm font-medium">No admissions yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  New applications will appear here when recorded.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {recentApplications.map((application) => (
                  <li
                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    key={application.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {application.givenName} {application.familyName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(application.createdAt)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full border px-2.5 py-1 text-xs capitalize text-muted-foreground">
                      {application.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canReadAdmissions && (
              <div className="mt-4 border-t pt-3">
                <Link
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  to="/admissions"
                >
                  View admissions
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
        <QuickActions />
      </section>
    </div>
  );
}
