import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { DashboardDataTable } from "@/components/dashboard/dashboard-primitives";
import { PageHeader } from "@/components/layout/page-header";
import { PlatformSchoolCreateSheet } from "@/components/superadmin/platform-school-create-sheet";
import { PlatformSchoolDetailsSheet } from "@/components/superadmin/platform-school-details-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { apiRequest } from "@/lib/api/client";
import type { PlatformPage, PlatformSchool, PlatformSchoolStatus } from "@/lib/api/platform-types";

const pageSize = 25;
const schoolStatuses: PlatformSchoolStatus[] = ["ACTIVE", "SUSPENDED", "CLOSED"];

function statusVariant(status: PlatformSchoolStatus) {
  return status === "ACTIVE" ? "secondary" : "outline";
}

export function SuperadminSchoolsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlatformSchoolStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const search = searchTerm.trim();
  const query = new URLSearchParams({
    limit: String(pageSize),
    offset: String(offset),
  });
  if (search) query.set("search", search);
  if (statusFilter !== "all") query.set("status", statusFilter);

  const schools = useQuery({
    queryKey: ["platform-schools", search, statusFilter, offset],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformSchool>>(`/platform/schools?${query.toString()}`, { signal }),
    retry: false,
  });
  const schoolDetails = useQuery({
    queryKey: ["platform-school-details", selectedSchoolId],
    queryFn: ({ signal }) =>
      apiRequest<{ data: PlatformSchool }>(
        `/platform/schools/${encodeURIComponent(selectedSchoolId ?? "")}`,
        { signal },
      ),
    enabled: selectedSchoolId !== null,
    retry: false,
  });
  const createSchool = useMutation({
    mutationFn: (input: { name: string; contactEmail?: string; contactPhone?: string }) =>
      apiRequest<{ data: PlatformSchool }>("/platform/schools", {
        method: "POST",
        body: input,
      }),
    onSuccess: async () => {
      setSearchTerm("");
      setStatusFilter("all");
      setOffset(0);
      setActionNotice(
        "School created in suspended status. No account or school access was granted.",
      );
      await queryClient.invalidateQueries({ queryKey: ["platform-schools"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });
  const updateSchool = useMutation({
    mutationFn: ({
      schoolId,
      input,
    }: {
      schoolId: string;
      input: { name: string; contactEmail: string | null; contactPhone: string | null };
    }) =>
      apiRequest<{ data: PlatformSchool }>(`/platform/schools/${encodeURIComponent(schoolId)}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async () => {
      setActionNotice("School contact details saved.");
      await queryClient.invalidateQueries({ queryKey: ["platform-schools"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });
  const changeStatus = useMutation({
    mutationFn: ({ schoolId, status }: { schoolId: string; status: PlatformSchoolStatus }) =>
      apiRequest<{ data: PlatformSchool }>(
        `/platform/schools/${encodeURIComponent(schoolId)}/status`,
        { method: "PATCH", body: { status } },
      ),
    onSuccess: async (response) => {
      setActionNotice(`School status updated to ${response.data.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["platform-schools"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });
  const total = schools.data?.meta.total ?? 0;
  const selectedSchoolFromList =
    schools.data?.data.find((school) => school.id === selectedSchoolId) ?? null;
  const selectedSchool = schoolDetails.data?.data ?? selectedSchoolFromList;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        actions={
          <>
            <Button
              disabled={schools.isFetching}
              onClick={() => void schools.refetch()}
              size="sm"
              variant="outline"
            >
              {schools.isFetching ? "Refreshing..." : "Refresh"}
            </Button>
            <PlatformSchoolCreateSheet
              error={createSchool.error}
              isPending={createSchool.isPending}
              onCreate={async (input) => createSchool.mutateAsync(input).then(() => undefined)}
            />
          </>
        }
        description={
          <>
            Manage school tenant names, contact metadata, and documented lifecycle transitions. This
            control-plane view does not expose tenant student, staff, or financial records.
          </>
        }
        eyebrow={<Badge variant="secondary">Platform tenant metadata</Badge>}
        title="Schools"
      />
      {actionNotice && selectedSchoolId === null && (
        <p
          className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
          role="status"
        >
          {actionNotice}
        </p>
      )}

      <Card className="shadow-none">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_200px]">
            <label className="relative block">
              <span className="sr-only">Search schools</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setOffset(0);
                }}
                placeholder="Search school name or contact"
                type="search"
                value={searchTerm}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">School status</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  const selectedStatus =
                    schoolStatuses.find((status) => status === event.target.value) ?? "all";
                  setStatusFilter(selectedStatus);
                  setOffset(0);
                }}
                value={statusFilter}
              >
                <option value="all">All statuses</option>
                {schoolStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {schools.isPending ? (
            <LoadingState className="min-h-48" message="Loading school records..." />
          ) : schools.isError ? (
            <ErrorState onRetry={() => void schools.refetch()} />
          ) : schools.data.data.length === 0 ? (
            <EmptyState
              className="min-h-48 justify-center"
              description={
                search || statusFilter !== "all"
                  ? "No authorized platform school records match these filters."
                  : "No school records are available."
              }
              title={search || statusFilter !== "all" ? "No matching schools" : "No schools"}
            />
          ) : (
            <DashboardDataTable
              caption="Platform school records"
              headers={[
                "School",
                "Identifier",
                "Contact email",
                "Contact phone",
                "Status",
                "Created",
                "Actions",
              ]}
            >
              {schools.data.data.map((school) => (
                <tr className="border-t" key={school.id}>
                  <th className="max-w-64 px-4 py-3 text-left font-medium" scope="row">
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <Link
                        className="truncate text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        to={`/superadmin/schools/${encodeURIComponent(school.id)}`}
                      >
                        {school.name}
                      </Link>
                    </span>
                  </th>
                  <td className="max-w-48 px-4 py-3 font-mono text-xs text-muted-foreground">
                    <span className="block truncate" title={school.id}>
                      {school.id}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {school.contactEmail ?? "Not provided"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {school.contactPhone ?? "Not provided"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(school.status)}>{school.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(school.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      aria-label={`Manage ${school.name}`}
                      onClick={() => {
                        setSelectedSchoolId(school.id);
                        setActionNotice("");
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </DashboardDataTable>
          )}

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {total === 0
                ? "0 schools"
                : `Showing ${offset + 1}–${Math.min(offset + pageSize, total)} of ${total} schools`}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={offset === 0 || schools.isFetching}
                onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={offset + pageSize >= total || schools.isFetching}
                onClick={() => setOffset((current) => current + pageSize)}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <PlatformSchoolDetailsSheet
        open={selectedSchoolId !== null}
        school={selectedSchool}
        isLoading={schoolDetails.isPending}
        detailsError={schoolDetails.error}
        onRetryDetails={() => void schoolDetails.refetch()}
        isUpdating={updateSchool.isPending}
        isChangingStatus={changeStatus.isPending}
        updateError={updateSchool.error}
        statusError={changeStatus.error}
        onOpenChange={(open) => {
          if (!open) setSelectedSchoolId(null);
        }}
        onUpdate={async (input) => {
          if (!selectedSchoolId) return;
          await updateSchool.mutateAsync({ schoolId: selectedSchoolId, input });
          await queryClient.invalidateQueries({
            queryKey: ["platform-school-details", selectedSchoolId],
          });
        }}
        onChangeStatus={async (status) => {
          if (!selectedSchoolId) return;
          await changeStatus.mutateAsync({ schoolId: selectedSchoolId, status });
          await queryClient.invalidateQueries({
            queryKey: ["platform-school-details", selectedSchoolId],
          });
        }}
      />
    </div>
  );
}
