import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { PlatformSchoolDetailsSheet } from "@/components/superadmin/platform-school-details-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { apiRequest } from "@/lib/api/client";
import type { PlatformSchool, PlatformSchoolStatus } from "@/lib/api/platform-types";

type SchoolUpdate = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">{value}</dd>
    </div>
  );
}

export function PlatformSchoolDetailsPage() {
  const { schoolId } = useParams();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const detailsQueryKey = ["platform-school-details", schoolId];
  const schoolQuery = useQuery({
    queryKey: detailsQueryKey,
    queryFn: ({ signal }) =>
      apiRequest<{ data: PlatformSchool }>(
        `/platform/schools/${encodeURIComponent(schoolId ?? "")}`,
        { signal },
      ),
    enabled: Boolean(schoolId),
    retry: false,
  });
  const updateSchool = useMutation({
    mutationFn: (input: SchoolUpdate) =>
      apiRequest<{ data: PlatformSchool }>(
        `/platform/schools/${encodeURIComponent(schoolId ?? "")}`,
        { method: "PATCH", body: input },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(detailsQueryKey, response);
      setActionNotice("School contact details saved.");
      await queryClient.invalidateQueries({ queryKey: ["platform-schools"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });
  const changeStatus = useMutation({
    mutationFn: (status: PlatformSchoolStatus) =>
      apiRequest<{ data: PlatformSchool }>(
        `/platform/schools/${encodeURIComponent(schoolId ?? "")}/status`,
        { method: "PATCH", body: { status } },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(detailsQueryKey, response);
      setActionNotice(`School status updated to ${response.data.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["platform-schools"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });

  const school = schoolQuery.data?.data;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/superadmin/schools">Back to schools</Link>
            </Button>
            <Button
              disabled={!school}
              onClick={() => {
                setActionNotice("");
                setEditorOpen(true);
              }}
              size="sm"
            >
              Edit school configuration
            </Button>
          </>
        }
        description="Review the approved platform metadata for this school. Tenant records and school-level configuration are not exposed in the platform console."
        eyebrow={<Badge variant="outline">Platform tenant metadata</Badge>}
        title={school?.name ?? "School details"}
      />

      {actionNotice && !editorOpen && (
        <p
          className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
          role="status"
        >
          {actionNotice}
        </p>
      )}

      <nav
        aria-label="School detail sections"
        className="flex gap-2 overflow-x-auto border-b pb-2 text-sm"
      >
        <a
          className="shrink-0 rounded-md px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="#overview"
        >
          Overview
        </a>
        <a
          className="shrink-0 rounded-md px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="#contact"
        >
          Contact details
        </a>
        <a
          className="shrink-0 rounded-md px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="#lifecycle"
        >
          Lifecycle
        </a>
      </nav>

      {schoolQuery.isPending ? (
        <LoadingState className="min-h-48" message="Loading school details..." />
      ) : schoolQuery.isError ? (
        <ErrorState
          className="min-h-48 justify-center"
          onRetry={() => void schoolQuery.refetch()}
        />
      ) : !school ? (
        <EmptyState
          className="min-h-48 justify-center"
          description="The platform API returned no school details."
          title="School details unavailable"
        />
      ) : (
        <>
          <Card className="scroll-mt-20" id="overview">
            <CardHeader>
              <CardTitle aria-level={3} className="text-base" role="heading">
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y rounded-lg border">
                <Detail label="School identifier" value={school.id} />
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                  <dt className="text-xs font-medium text-muted-foreground">Current status</dt>
                  <dd>
                    <Badge variant={school.status === "ACTIVE" ? "secondary" : "outline"}>
                      {school.status}
                    </Badge>
                  </dd>
                </div>
                <Detail label="Created" value={formatDate(school.createdAt)} />
                <Detail label="Last updated" value={formatDate(school.updatedAt)} />
              </dl>
            </CardContent>
          </Card>

          <Card className="scroll-mt-20" id="contact">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle aria-level={3} className="text-base" role="heading">
                Contact details
              </CardTitle>
              <Button onClick={() => setEditorOpen(true)} size="sm" variant="outline">
                Edit contact details
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="divide-y rounded-lg border">
                <Detail label="School name" value={school.name} />
                <Detail label="Contact email" value={school.contactEmail ?? "Not provided"} />
                <Detail label="Contact phone" value={school.contactPhone ?? "Not provided"} />
              </dl>
            </CardContent>
          </Card>

          <Card className="scroll-mt-20" id="lifecycle">
            <CardHeader>
              <CardTitle aria-level={3} className="text-base" role="heading">
                Lifecycle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Lifecycle transitions are audited. Suspending or closing a school blocks new
                school-scoped requests; it does not delete school records or memberships.
              </p>
              <Button onClick={() => setEditorOpen(true)} size="sm" variant="outline">
                Manage lifecycle status
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <PlatformSchoolDetailsSheet
        open={editorOpen}
        school={school ?? null}
        isLoading={schoolQuery.isPending}
        detailsError={schoolQuery.isError ? schoolQuery.error : null}
        onRetryDetails={() => void schoolQuery.refetch()}
        isUpdating={updateSchool.isPending}
        isChangingStatus={changeStatus.isPending}
        updateError={updateSchool.error}
        statusError={changeStatus.error}
        onOpenChange={setEditorOpen}
        onUpdate={(input) => updateSchool.mutateAsync(input).then(() => undefined)}
        onChangeStatus={(status) => changeStatus.mutateAsync(status).then(() => undefined)}
      />
    </div>
  );
}
