import {
  BriefcaseBusiness,
  Search,
  UserRoundCheck,
  UsersRound,
  UserRoundCog,
} from "lucide-react";
import { useState } from "react";
import { AddStaffMemberSheet } from "@/components/staff/add-staff-member-sheet";
import { StaffDetailsPanel } from "@/components/staff/staff-details-panel";
import {
  StaffStatusBadge,
  type StaffEmploymentStatus,
} from "@/components/staff/staff-status-badge";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Card, CardContent } from "@/components/ui/card";

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Staff",
    description: "All staff profiles",
    icon: UsersRound,
  },
  {
    title: "Active Staff",
    description: "Currently employed",
    icon: UserRoundCheck,
  },
  {
    title: "Teaching Staff",
    description: "Teaching category",
    icon: BriefcaseBusiness,
  },
  {
    title: "Non-Teaching Staff",
    description: "Non-teaching category",
    icon: UserRoundCog,
  },
];

const employmentStatuses: StaffEmploymentStatus[] = [
  "Active",
  "Inactive",
  "On leave",
  "Terminated",
];

const staffCategories = ["Teaching", "Non-Teaching"] as const;

const tableColumns = [
  "Staff ID",
  "Staff Name",
  "Department",
  "Position",
  "Category",
  "Contact",
  "Employment Status",
  "Actions",
];

export function StaffPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">People operations</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Staff
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Manage staff profiles, departments, positions, and employment
            status. Staff records will appear when an approved data source is
            connected.
          </p>
        </div>
        <AddStaffMemberSheet />
      </section>

      <section aria-labelledby="staff-overview-heading" className="space-y-4">
        <div>
          <h3 id="staff-overview-heading" className="text-base font-semibold">
            Staff overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Counts are unavailable until staff data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="staff-directory-heading" className="space-y-4">
        <div>
          <h3 id="staff-directory-heading" className="text-base font-semibold">
            Staff directory
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Search and filter staff profiles.
          </p>
        </div>

        <Card className="shadow-none">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative block">
                <span className="sr-only">Search by staff name or staff ID</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Name or staff ID"
                  type="search"
                  value={searchTerm}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Department
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  value={departmentFilter}
                >
                  <option value="all">All departments</option>
                  <option disabled value="unavailable">
                    Departments unavailable
                  </option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Employment status
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  {employmentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Staff category
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  value={categoryFilter}
                >
                  <option value="all">All categories</option>
                  {staffCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Staff data is not connected. Search and filter controls are
              presentational and do not retrieve or change records.
            </p>

            <div
              aria-label="Employment status style guide"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="mr-1 text-xs font-medium text-muted-foreground">
                Status label key
              </span>
              {employmentStatuses.map((status) => (
                <StaffStatusBadge key={status} status={status} />
              ))}
            </div>

            <div
              aria-live="polite"
              className="overflow-hidden rounded-lg border"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                  <caption className="sr-only">Staff directory</caption>
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      {tableColumns.map((column) => (
                        <th
                          key={column}
                          className="px-4 py-3 font-medium"
                          scope="col"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-12" colSpan={tableColumns.length}>
                        <div className="mx-auto flex max-w-md flex-col items-center text-center">
                          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <UsersRound
                              aria-hidden="true"
                              className="size-5"
                              strokeWidth={1.8}
                            />
                          </span>
                          <p className="text-sm font-semibold">
                            No staff records to display
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            Staff profiles are not connected. No sample names,
                            IDs, or contact details are shown.
                          </p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <StaffDetailsPanel staff={null} />
    </div>
  );
}
