import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

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

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DashboardPage() {
  const years = useSchoolList<AcademicYear>("/academic-years", { limit: 100, offset: 0, status: "ACTIVE" });
  const [yearId, setYearId] = useState("");
  const selectedYearId = yearId || years.data?.data[0]?.id || "";
  const terms = useSchoolList<Term>("/terms", {
    academicYearId: selectedYearId || undefined,
    limit: 100,
    offset: 0,
    status: "ACTIVE",
  }, { enabled: Boolean(selectedYearId) });
  const [termId, setTermId] = useState("");
  const selectedTermId = termId || terms.data?.data[0]?.id || "";
  const [from, setFrom] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return localDate(start);
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const dashboard = useSchoolData<{ data: DashboardData }>("/reports/dashboard", {
    academicYearId: selectedYearId || undefined,
    termId: selectedTermId || undefined,
    from,
    to,
  }, { enabled: Boolean(selectedYearId && selectedTermId && from && to && from <= to) });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">School overview</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Verified attendance, assessment, and finance summaries from the school reporting API.
        </p>
      </section>
      <Card className="shadow-none">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Academic year</span>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => {
              setYearId(event.target.value);
              setTermId("");
            }} value={selectedYearId}>
              <option value="">Choose an academic year</option>
              {years.data?.data.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
            {years.isError && <RequestError error={years.error} />}
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Term</span>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setTermId(event.target.value)} value={selectedTermId}>
              <option value="">Choose a term</option>
              {terms.data?.data.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
            {terms.isError && <RequestError error={terms.error} />}
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input className="h-10 w-full rounded-md border border-input bg-background px-3" onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </label>
        </CardContent>
      </Card>
      {from > to && <p className="text-sm text-destructive" role="alert">The start date must be on or before the end date.</p>}
      {!selectedYearId || !selectedTermId ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">Select an active academic year and term to load the dashboard report.</p>
      ) : dashboard.isPending ? (
        <RequestLoading />
      ) : dashboard.isError ? (
        <RequestError error={dashboard.error} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">Attendance</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.data.data.attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No marked attendance in this date range.</p>
              ) : dashboard.data.data.attendance.map((row) => (
                <div className="flex justify-between gap-3 text-sm" key={`${row.date}-${row.status}`}>
                  <span>{row.date} · {row.status.toLowerCase().replaceAll("_", " ")}</span>
                  <span className="font-medium">{row.total}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">Academic results</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Assessments: <strong>{dashboard.data.data.academics.assessmentCount}</strong></p>
              <p>Entered: <strong>{dashboard.data.data.academics.enteredCount}</strong></p>
              <p>Missing: <strong>{dashboard.data.data.academics.missingCount}</strong></p>
              <p>Published: <strong>{dashboard.data.data.academics.publishedCount}</strong></p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">Finance · {dashboard.data.data.finance.from} to {dashboard.data.data.finance.to}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Payments received: <strong>KES {dashboard.data.data.finance.paymentsReceived}</strong></p>
              <p>Payments: <strong>{dashboard.data.data.finance.paymentCount}</strong></p>
              <p>Outstanding charges: <strong>KES {dashboard.data.data.finance.outstandingCharges}</strong></p>
              <p>Unapplied credit: <strong>KES {dashboard.data.data.finance.unappliedCredit}</strong></p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
