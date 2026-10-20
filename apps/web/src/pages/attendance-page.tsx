import {
  CalendarCheck,
  CalendarDays,
  Clock3,
  Search,
  UserCheck,
  UserRoundX,
} from "lucide-react";
import { useState } from "react";
import {
  AttendanceDetailsPanel,
} from "@/components/attendance/attendance-details-panel";
import { MarkAttendanceSheet } from "@/components/attendance/mark-attendance-sheet";
import {
  AttendanceStatusBadge,
  type AttendanceStatus,
} from "@/components/attendance/attendance-status-badge";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";

const summaryCards: SummaryCardItem[] = [
  {
    title: "Students Expected",
    description: "Expected for the selected day",
    icon: CalendarDays,
  },
  {
    title: "Present",
    description: "Attendance marked present",
    icon: UserCheck,
  },
  {
    title: "Absent",
    description: "Attendance marked absent",
    icon: UserRoundX,
  },
  {
    title: "Attendance Rate",
    description: "Rate for the selected day",
    icon: CalendarCheck,
  },
];

const attendanceStatuses: AttendanceStatus[] = [
  "Present",
  "Absent",
  "Late",
  "Excused",
];

export function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">Daily register</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Attendance
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Manage and review student attendance. Attendance records will
            appear when an approved data source is connected.
          </p>
        </div>
        <MarkAttendanceSheet />
      </section>

      <section aria-labelledby="attendance-overview-heading" className="space-y-4">
        <div>
          <h3
            id="attendance-overview-heading"
            className="text-base font-semibold"
          >
            Attendance overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Statistics are unavailable until attendance data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="attendance-records-heading" className="space-y-4">
        <div>
          <h3
            id="attendance-records-heading"
            className="text-base font-semibold"
          >
            Attendance records
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Find records by student, date, class, or attendance status.
          </p>
        </div>

        <Card className="shadow-none">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_170px_210px_180px]">
              <label className="relative block">
                <span className="sr-only">
                  Search by student name or admission number
                </span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Name or admission number"
                  type="search"
                  value={searchTerm}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Attendance date
                </span>
                <input
                  aria-label="Attendance date filter"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSelectedDate(event.target.value)}
                  type="date"
                  value={selectedDate}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Class / programme
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSelectedClass(event.target.value)}
                  value={selectedClass}
                >
                  <option value="all">All classes / programmes</option>
                  <option disabled value="unavailable">
                    Options unavailable
                  </option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Attendance status
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSelectedStatus(event.target.value)}
                  value={selectedStatus}
                >
                  <option value="all">All statuses</option>
                  {attendanceStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3.5 py-3">
              <Clock3
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Attendance data is not connected. Filters are ready for when
                real records become available.
              </p>
            </div>

            <div
              aria-label="Attendance status key"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="mr-1 text-xs font-medium text-muted-foreground">
                Status key
              </span>
              {attendanceStatuses.map((status) => (
                <AttendanceStatusBadge key={status} status={status} />
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                  <caption className="sr-only">Student attendance records</caption>
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Admission number
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Student name
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Class / programme
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Date
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Check-in time
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Status
                      </th>
                      <th className="px-4 py-3 font-medium" scope="col">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody aria-live="polite">
                    <tr>
                      <td className="px-4 py-12" colSpan={7}>
                        <div className="mx-auto flex max-w-md flex-col items-center text-center">
                          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <CalendarCheck
                              aria-hidden="true"
                              className="size-5"
                              strokeWidth={1.8}
                            />
                          </span>
                          <p className="text-sm font-semibold">
                            No attendance records to display
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            Attendance records are not connected yet. No
                            student names, dates, or statuses are shown.
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
              attendance records become available.
            </p>
          </CardContent>
        </Card>
      </section>

      <AttendanceDetailsPanel entry={null} />
    </div>
  );
}
