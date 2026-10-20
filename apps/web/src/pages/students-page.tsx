import {
  GraduationCap,
  Search,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { AddStudentSheet } from "@/components/students/add-student-sheet";
import { StudentDetailsPanel } from "@/components/students/student-details-panel";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Students",
    description: "All enrolled students",
    icon: UsersRound,
  },
  {
    title: "Active Students",
    description: "Currently active",
    icon: UserRoundCheck,
  },
  {
    title: "New Enrolments",
    description: "Recently enrolled",
    icon: UserRoundPlus,
  },
  {
    title: "Inactive Students",
    description: "Currently inactive",
    icon: UserRoundMinus,
  },
];

const studentStatuses = ["Active", "Inactive"] as const;

export function StudentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [programmeFilter, setProgrammeFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState("all");

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">Learner records</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Students
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            View and organize student information across your school.
            Student records will appear when an approved data source is
            connected.
          </p>
        </div>
        <AddStudentSheet />
      </section>

      <section aria-labelledby="students-overview-heading" className="space-y-4">
        <div>
          <h3
            id="students-overview-heading"
            className="text-base font-semibold"
          >
            Student overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Counts are unavailable until student data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="student-records-heading" className="space-y-4">
        <div>
          <h3 id="student-records-heading" className="text-base font-semibold">
            Student records
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Search and filter the student list.
          </p>
        </div>

        <Card className="shadow-none">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_200px_180px]">
              <label className="relative block">
                <span className="sr-only">
                  Search by student name or admission number
                </span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Name or admission number"
                  type="search"
                  value={searchTerm}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Student status
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  {studentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Programme / class
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setProgrammeFilter(event.target.value)}
                  value={programmeFilter}
                >
                  <option value="all">All programmes / classes</option>
                  <option disabled value="unavailable">
                    Options unavailable
                  </option>
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
                    Options unavailable
                  </option>
                </select>
              </label>
            </div>

            <div
              aria-live="polite"
              className="overflow-hidden rounded-lg border"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <caption className="sr-only">Student records</caption>
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Admission number
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Student name
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Programme / class
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Contact
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Enrolment date
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-12" colSpan={6}>
                        <div className="mx-auto flex max-w-md flex-col items-center text-center">
                          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <GraduationCap
                              aria-hidden="true"
                              className="size-5"
                              strokeWidth={1.8}
                            />
                          </span>
                          <p className="text-sm font-semibold">
                            No student records to display
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            Student data is not connected yet. No sample
                            student records or contact details are shown.
                          </p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Search and filters are presentation controls and will apply when
              student records become available.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="Student information panel">
        <StudentDetailsPanel student={null} />
      </section>
    </div>
  );
}
