import {
  FileCheck2,
  FileClock,
  FileX2,
  Files,
  Search,
} from "lucide-react";
import { useState } from "react";
import { ApplicantDetailsPanel } from "@/components/admissions/applicant-details-panel";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Applications",
    description: "Applications received",
    icon: Files,
  },
  {
    title: "Pending Review",
    description: "Awaiting review",
    icon: FileClock,
  },
  {
    title: "Accepted",
    description: "Applications accepted",
    icon: FileCheck2,
  },
  {
    title: "Rejected",
    description: "Applications declined",
    icon: FileX2,
  },
];

const statuses = ["Pending review", "Accepted", "Rejected"] as const;

export function AdmissionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState("all");

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Enrolment</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Admissions
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Review and track applications in one place. Application records will
          appear when an approved data source is connected.
        </p>
      </section>

      <section aria-labelledby="admissions-overview-heading" className="space-y-4">
        <div>
          <h3
            id="admissions-overview-heading"
            className="text-base font-semibold"
          >
            Application overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Counts are unavailable until application data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="applications-heading" className="space-y-4">
        <div>
          <h3 id="applications-heading" className="text-base font-semibold">
            Applications
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Search and filter the application list.
          </p>
        </div>

        <Card className="shadow-none">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_190px]">
              <label className="relative block">
                <span className="sr-only">Search applicants</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search applicants"
                  type="search"
                  value={searchTerm}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Application status
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Academic year
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setAcademicYear(event.target.value)}
                  value={academicYear}
                >
                  <option value="all">All academic years</option>
                  <option disabled value="unavailable">
                    Academic years unavailable
                  </option>
                </select>
              </label>
            </div>

            <div
              aria-live="polite"
              className="overflow-hidden rounded-lg border"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Admissions applications
                  </caption>
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Applicant
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Application number
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Programme
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Submission date
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-12" colSpan={5}>
                        <div className="mx-auto flex max-w-md flex-col items-center text-center">
                          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Files
                              aria-hidden="true"
                              className="size-5"
                              strokeWidth={1.8}
                            />
                          </span>
                          <p className="text-sm font-semibold">
                            No applications to display
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            Application records are not connected yet. Search
                            and filters will apply when data becomes
                            available.
                          </p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              No pagination is shown because application records are not
              available.
            </p>
          </CardContent>
        </Card>
      </section>

      <ApplicantDetailsPanel application={null} />
    </div>
  );
}
