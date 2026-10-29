import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { DashboardDataTable } from "@/components/dashboard/dashboard-primitives";
import { PageHeader } from "@/components/layout/page-header";
import {
  PlatformPlanFormSheet,
  type PlatformPlanInput,
} from "@/components/superadmin/platform-plan-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";
import type {
  PlatformPage,
  PlatformPlan,
  PlatformSchool,
  PlatformSubscription,
} from "@/lib/api/platform-types";

const pageSize = 25;
type PlanStatusFilter = "all" | "active" | "inactive";

function formatEntitlements(entitlements: Record<string, boolean | number | string>) {
  const entries = Object.entries(entitlements);
  if (entries.length === 0) return "No entitlement metadata";
  return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(" · ");
}

function formatPlanDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export function PlatformPlansPage() {
  const queryClient = useQueryClient();
  const [planOffset, setPlanOffset] = useState(0);
  const [planSearch, setPlanSearch] = useState("");
  const [planStatusFilter, setPlanStatusFilter] = useState<PlanStatusFilter>("all");
  const [selectedPlan, setSelectedPlan] = useState<PlatformPlan | null>(null);
  const [comparisonPlanIds, setComparisonPlanIds] = useState<string[]>([]);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolOffset, setSchoolOffset] = useState(0);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [subscriptionOffset, setSubscriptionOffset] = useState(0);
  const [planToAssign, setPlanToAssign] = useState("");
  const [assignmentConfirmationOpen, setAssignmentConfirmationOpen] = useState(false);
  const [assignmentToEnd, setAssignmentToEnd] = useState<PlatformSubscription | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const planSearchValue = planSearch.trim();
  const schoolSearchValue = schoolSearch.trim();

  const planQuery = new URLSearchParams({
    limit: String(pageSize),
    offset: String(planOffset),
  });
  if (planSearchValue) planQuery.set("search", planSearchValue);
  if (planStatusFilter !== "all") {
    planQuery.set("active", String(planStatusFilter === "active"));
  }

  const plans = useQuery({
    queryKey: ["platform-plans", planSearchValue, planStatusFilter, planOffset],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformPlan>>(`/platform/plans?${planQuery.toString()}`, { signal }),
    retry: false,
  });
  const activePlansQuery = useQuery({
    queryKey: ["platform-active-plans"],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformPlan>>("/platform/plans?limit=100&offset=0&active=true", {
        signal,
      }),
    retry: false,
  });

  const schoolQuery = new URLSearchParams({
    limit: String(pageSize),
    offset: String(schoolOffset),
  });
  if (schoolSearchValue) schoolQuery.set("search", schoolSearchValue);
  const schools = useQuery({
    queryKey: ["platform-subscription-schools", schoolSearchValue, schoolOffset],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformSchool>>(`/platform/schools?${schoolQuery.toString()}`, {
        signal,
      }),
    retry: false,
  });

  const subscriptions = useQuery({
    queryKey: ["platform-school-subscriptions", selectedSchoolId, subscriptionOffset],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformSubscription>>(
        `/platform/schools/${encodeURIComponent(selectedSchoolId)}/subscriptions?limit=${pageSize}&offset=${subscriptionOffset}`,
        { signal },
      ),
    enabled: Boolean(selectedSchoolId),
    retry: false,
  });
  const savePlan = useMutation({
    mutationFn: ({ planId, input }: { planId?: string; input: PlatformPlanInput }) =>
      apiRequest<{ data: PlatformPlan }>(
        planId ? `/platform/plans/${encodeURIComponent(planId)}` : "/platform/plans",
        {
          method: planId ? "PATCH" : "POST",
          body: input,
        },
      ),
    onSuccess: async (response, variables) => {
      setActionNotice(variables.planId ? "Plan metadata saved." : "Plan created.");
      if (variables.planId && selectedPlan?.id === variables.planId) {
        setSelectedPlan(response.data);
      }
      await queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-active-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });
  const assignPlan = useMutation({
    mutationFn: ({ schoolId, planId }: { schoolId: string; planId: string }) =>
      apiRequest<{ data: PlatformSubscription }>(
        `/platform/schools/${encodeURIComponent(schoolId)}/subscription`,
        { method: "PUT", body: { planId } },
      ),
    onSuccess: async () => {
      setPlanToAssign("");
      setAssignmentConfirmationOpen(false);
      setActionNotice("Metadata plan assignment saved. No billing or access change is implied.");
      await queryClient.invalidateQueries({
        queryKey: ["platform-school-subscriptions", selectedSchoolId],
      });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });
  const endAssignment = useMutation({
    mutationFn: (schoolId: string) =>
      apiRequest<void>(`/platform/schools/${encodeURIComponent(schoolId)}/subscription/end`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setAssignmentToEnd(null);
      setActionNotice("Metadata assignment ended. School access and billing were not changed.");
      await queryClient.invalidateQueries({
        queryKey: ["platform-school-subscriptions", selectedSchoolId],
      });
      await queryClient.invalidateQueries({ queryKey: ["platform-summary"] });
    },
  });

  const planTotal = plans.data?.meta.total ?? 0;
  const subscriptionTotal = subscriptions.data?.meta.total ?? 0;
  const activePlans = activePlansQuery.data?.data ?? [];
  const plansForComparison =
    plans.data?.data.filter((plan) => comparisonPlanIds.includes(plan.id)) ?? [];
  const comparisonEntitlementKeys = [
    ...new Set(plansForComparison.flatMap((plan) => Object.keys(plan.entitlements))),
  ].sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        actions={
          <>
            <Button
              disabled={plans.isFetching}
              onClick={() => void plans.refetch()}
              size="sm"
              variant="outline"
            >
              {plans.isFetching ? "Refreshing plans..." : "Refresh plans"}
            </Button>
            <PlatformPlanFormSheet
              error={savePlan.error}
              isPending={savePlan.isPending}
              onSave={(input) => savePlan.mutateAsync({ input }).then(() => undefined)}
            />
          </>
        }
        description={
          <>
            Manage metadata-only plans and historical school assignments. These records do not
            represent billing, payments, expiry, or entitlement enforcement.
          </>
        }
        eyebrow={<Badge variant="secondary">Platform plan metadata</Badge>}
        title="Plans & subscriptions"
      />
      {actionNotice && (
        <p
          className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
          role="status"
        >
          {actionNotice}
        </p>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle aria-level={3} className="text-base" role="heading">
            Plan catalog
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Plan codes, status, and entitlement metadata returned by the platform API. Prices and
            billing terms are not part of this catalog.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_200px]">
            <label className="relative block">
              <span className="sr-only">Search plans</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  setPlanSearch(event.target.value);
                  setPlanOffset(0);
                  setComparisonPlanIds([]);
                }}
                placeholder="Search plan name, code, or description"
                type="search"
                value={planSearch}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Plan status</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  const value = event.target.value;
                  setPlanStatusFilter(value === "active" || value === "inactive" ? value : "all");
                  setPlanOffset(0);
                  setComparisonPlanIds([]);
                }}
                value={planStatusFilter}
              >
                <option value="all">All plans</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          {plans.isPending ? (
            <LoadingState className="min-h-40" message="Loading plans..." />
          ) : plans.isError ? (
            <ErrorState onRetry={() => void plans.refetch()} />
          ) : plans.data.data.length === 0 ? (
            <EmptyState
              className="min-h-40 justify-center"
              description={
                planSearchValue || planStatusFilter !== "all"
                  ? "No platform plan records match these filters."
                  : "The platform API returned no plan records."
              }
              title={
                planSearchValue || planStatusFilter !== "all"
                  ? "No matching plans"
                  : "No plans available"
              }
            />
          ) : (
            <DashboardDataTable
              caption="Platform plan catalog"
              headers={["Compare", "Plan", "Code", "Status", "Entitlement metadata", "Actions"]}
            >
              {plans.data.data.map((plan) => (
                <tr className="border-t align-top" key={plan.id}>
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Compare ${plan.name}`}
                      checked={comparisonPlanIds.includes(plan.id)}
                      disabled={
                        !comparisonPlanIds.includes(plan.id) && comparisonPlanIds.length >= 3
                      }
                      onChange={(event) => {
                        setComparisonPlanIds((current) =>
                          event.target.checked
                            ? [...current, plan.id]
                            : current.filter((id) => id !== plan.id),
                        );
                      }}
                      type="checkbox"
                    />
                  </td>
                  <th className="min-w-44 px-4 py-3 text-left font-medium" scope="row">
                    <span>{plan.name}</span>
                    {plan.description && (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {plan.description}
                      </span>
                    )}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{plan.code}</td>
                  <td className="px-4 py-3">
                    <Badge variant={plan.active ? "secondary" : "outline"}>
                      {plan.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs leading-5 text-muted-foreground">
                    {formatEntitlements(plan.entitlements)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setSelectedPlan(plan)} size="sm" variant="outline">
                        Details
                      </Button>
                      <PlatformPlanFormSheet
                        error={savePlan.error}
                        isPending={savePlan.isPending}
                        onSave={(input) =>
                          savePlan.mutateAsync({ planId: plan.id, input }).then(() => undefined)
                        }
                        plan={plan}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </DashboardDataTable>
          )}
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Compare entitlement metadata</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Compare only keys and values returned for the selected plans. These labels do not
                  imply feature availability or access enforcement. Select up to three plans.
                </p>
              </div>
              {comparisonPlanIds.length > 0 && (
                <Button onClick={() => setComparisonPlanIds([])} size="sm" variant="outline">
                  Clear comparison
                </Button>
              )}
            </div>
            {plansForComparison.length < 2 ? (
              <p className="text-xs text-muted-foreground">
                Select at least two plans in the list to compare their metadata.
              </p>
            ) : (
              <DashboardDataTable
                caption="Raw entitlement metadata comparison, not enforced product features"
                headers={[
                  "Metadata key",
                  ...plansForComparison.map((plan) => `${plan.name} (${plan.code})`),
                ]}
              >
                {comparisonEntitlementKeys.length === 0 ? (
                  <tr className="border-t">
                    <td
                      className="px-4 py-3 text-sm text-muted-foreground"
                      colSpan={plansForComparison.length + 1}
                    >
                      No entitlement metadata is declared for the selected plans.
                    </td>
                  </tr>
                ) : (
                  comparisonEntitlementKeys.map((key) => (
                    <tr className="border-t" key={key}>
                      <th className="px-4 py-3 text-left font-mono text-xs" scope="row">
                        {key}
                      </th>
                      {plansForComparison.map((plan) => (
                        <td className="px-4 py-3 text-sm" key={plan.id}>
                          {Object.hasOwn(plan.entitlements, key)
                            ? JSON.stringify(plan.entitlements[key])
                            : "Not declared"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </DashboardDataTable>
            )}
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {planTotal === 0
                ? "0 plans"
                : `Showing ${planOffset + 1}–${Math.min(planOffset + pageSize, planTotal)} of ${planTotal} plans`}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={planOffset === 0 || plans.isFetching}
                onClick={() => setPlanOffset((current) => Math.max(0, current - pageSize))}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={planOffset + pageSize >= planTotal || plans.isFetching}
                onClick={() => setPlanOffset((current) => current + pageSize)}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setSelectedPlan(null);
        }}
        open={selectedPlan !== null}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selectedPlan && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedPlan.name}</DialogTitle>
                <DialogDescription>
                  Plan metadata returned by the platform API. Entitlements are descriptive metadata
                  only and are not interpreted as access controls.
                </DialogDescription>
              </DialogHeader>
              <dl className="divide-y rounded-md border text-sm">
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted-foreground">Plan code</dt>
                  <dd className="font-mono">{selectedPlan.code}</dd>
                </div>
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{selectedPlan.active ? "Active" : "Inactive"}</dd>
                </div>
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted-foreground">Description</dt>
                  <dd>{selectedPlan.description || "Not provided"}</dd>
                </div>
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted-foreground">Identifier</dt>
                  <dd className="break-all font-mono text-xs">{selectedPlan.id}</dd>
                </div>
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatPlanDate(selectedPlan.createdAt)}</dd>
                </div>
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[140px_1fr]">
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd>{formatPlanDate(selectedPlan.updatedAt)}</dd>
                </div>
              </dl>
              <section aria-label="Plan entitlement metadata" className="space-y-2">
                <h3 className="text-sm font-semibold">Entitlement metadata</h3>
                {Object.keys(selectedPlan.entitlements).length === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    No entitlement metadata is declared.
                  </p>
                ) : (
                  <dl className="divide-y rounded-md border text-sm">
                    {Object.entries(selectedPlan.entitlements).map(([key, value]) => (
                      <div
                        className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(120px,0.7fr)_1fr] sm:gap-4"
                        key={key}
                      >
                        <dt className="break-all font-mono text-xs">{key}</dt>
                        <dd className="break-all">{JSON.stringify(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
              <p className="text-xs leading-5 text-muted-foreground">
                Price, currency, billing interval, payment status, and access enforcement are not
                represented by the available plan contract.
              </p>
              <DialogFooter>
                <PlatformPlanFormSheet
                  error={savePlan.error}
                  isPending={savePlan.isPending}
                  onSave={(input) =>
                    savePlan.mutateAsync({ planId: selectedPlan.id, input }).then(() => undefined)
                  }
                  plan={selectedPlan}
                />
                <Button onClick={() => setSelectedPlan(null)} variant="outline">
                  Close details
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle aria-level={3} className="text-base" role="heading">
            School subscription history
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Assignments are catalog metadata only; no financial state is available here.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
            <label className="relative block">
              <span className="sr-only">Search schools for subscription history</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  setSchoolSearch(event.target.value);
                  setSchoolOffset(0);
                  setSelectedSchoolId("");
                  setSubscriptionOffset(0);
                  setPlanToAssign("");
                  setAssignmentToEnd(null);
                }}
                placeholder="Find a school by name or contact"
                type="search"
                value={schoolSearch}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">School</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={schools.isPending || schools.isError || !schools.data?.data.length}
                onChange={(event) => {
                  setSelectedSchoolId(event.target.value);
                  setSubscriptionOffset(0);
                  setPlanToAssign("");
                  setAssignmentToEnd(null);
                }}
                value={selectedSchoolId}
              >
                <option value="">Select a school</option>
                {schools.data?.data.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!schools.isError && schools.data && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {schools.data.meta.total === 0
                  ? "0 schools"
                  : `Showing ${schoolOffset + 1}–${Math.min(schoolOffset + pageSize, schools.data.meta.total)} of ${schools.data.meta.total} schools`}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={schoolOffset === 0 || schools.isFetching}
                  onClick={() => {
                    setSchoolOffset((current) => Math.max(0, current - pageSize));
                    setSelectedSchoolId("");
                    setSubscriptionOffset(0);
                    setPlanToAssign("");
                    setAssignmentToEnd(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Previous schools
                </Button>
                <Button
                  disabled={
                    schoolOffset + pageSize >= schools.data.meta.total || schools.isFetching
                  }
                  onClick={() => {
                    setSchoolOffset((current) => current + pageSize);
                    setSelectedSchoolId("");
                    setSubscriptionOffset(0);
                    setPlanToAssign("");
                    setAssignmentToEnd(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  More schools
                </Button>
              </div>
            </div>
          )}
          {selectedSchoolId && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">Assign a plan</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                Assignments are metadata only. They do not configure billing, suspend a school, or
                enforce entitlements.
              </p>
              {activePlansQuery.isPending ? (
                <LoadingState className="min-h-20" message="Loading active plans..." />
              ) : activePlansQuery.isError ? (
                <ErrorState onRetry={() => void activePlansQuery.refetch()} />
              ) : activePlans.length === 0 ? (
                <EmptyState
                  description="Create or activate a plan in the catalog before assigning one."
                  title="No active plans"
                />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="min-w-0 flex-1 space-y-1.5">
                    <span className="text-xs font-medium">Active plan</span>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={activePlansQuery.isPending || activePlans.length === 0}
                      onChange={(event) => setPlanToAssign(event.target.value)}
                      value={planToAssign}
                    >
                      <option value="">Select an active plan</option>
                      {activePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} ({plan.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    className="self-end"
                    disabled={!planToAssign || assignPlan.isPending}
                    onClick={() => {
                      setActionNotice("");
                      setAssignmentConfirmationOpen(true);
                    }}
                    type="button"
                  >
                    Assign plan
                  </Button>
                </div>
              )}
            </div>
          )}
          {schools.isPending ? (
            <LoadingState className="min-h-24" message="Loading school choices..." />
          ) : schools.isError ? (
            <ErrorState onRetry={() => void schools.refetch()} />
          ) : schools.data.data.length === 0 ? (
            <EmptyState
              className="min-h-24 justify-center"
              description="Try a different search term or clear the school search."
              title="No matching schools"
            />
          ) : !selectedSchoolId ? (
            <EmptyState
              className="min-h-24 justify-center"
              description="Choose an authorized platform school to review its assignment history."
              title="Select a school"
            />
          ) : subscriptions.isPending ? (
            <LoadingState className="min-h-24" message="Loading subscription history..." />
          ) : subscriptions.isError ? (
            <ErrorState onRetry={() => void subscriptions.refetch()} />
          ) : subscriptions.data.data.length === 0 ? (
            <EmptyState
              className="min-h-24 justify-center"
              description="There are no plan assignments recorded for this school."
              title="No subscription history"
            />
          ) : (
            <>
              <DashboardDataTable
                caption="School plan assignment history"
                headers={[
                  "Plan",
                  "Assigned",
                  "Assignment status",
                  "Entitlements at assignment",
                  "Actions",
                ]}
              >
                {subscriptions.data.data.map((subscription) => (
                  <tr className="border-t" key={subscription.id}>
                    <th className="px-4 py-3 text-left font-medium" scope="row">
                      {subscription.planName}
                      <span className="mt-1 block font-mono text-xs font-normal text-muted-foreground">
                        {subscription.planCode}
                      </span>
                    </th>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(subscription.assignedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={subscription.endedAt ? "outline" : "secondary"}>
                        {subscription.endedAt ? "Ended" : "Current assignment"}
                      </Badge>
                      {subscription.endedAt && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Ended {new Date(subscription.endedAt).toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs leading-5 text-muted-foreground">
                      {formatEntitlements(subscription.entitlements)}
                    </td>
                    <td className="px-4 py-3">
                      {subscription.endedAt === null && (
                        <Button
                          onClick={() => setAssignmentToEnd(subscription)}
                          size="sm"
                          variant="outline"
                        >
                          End assignment
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </DashboardDataTable>
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {`Showing ${subscriptionOffset + 1}–${Math.min(subscriptionOffset + pageSize, subscriptionTotal)} of ${subscriptionTotal} assignments`}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={subscriptionOffset === 0 || subscriptions.isFetching}
                    onClick={() =>
                      setSubscriptionOffset((current) => Math.max(0, current - pageSize))
                    }
                    size="sm"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={
                      subscriptionOffset + pageSize >= subscriptionTotal || subscriptions.isFetching
                    }
                    onClick={() => setSubscriptionOffset((current) => current + pageSize)}
                    size="sm"
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog onOpenChange={setAssignmentConfirmationOpen} open={assignmentConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm plan assignment</DialogTitle>
            <DialogDescription>
              {`Assign ${activePlans.find((plan) => plan.id === planToAssign)?.name ?? "the selected plan"} to ${schools.data?.data.find((school) => school.id === selectedSchoolId)?.name ?? "the selected school"}? This updates metadata history only; it does not change billing, payment status, school access, or entitlement enforcement.`}
            </DialogDescription>
          </DialogHeader>
          {assignPlan.error && <ErrorState message={assignPlan.error.message} />}
          <DialogFooter>
            <Button
              onClick={() => setAssignmentConfirmationOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !selectedSchoolId ||
                !planToAssign ||
                !activePlans.some((plan) => plan.id === planToAssign) ||
                assignPlan.isPending
              }
              onClick={() => {
                if (!selectedSchoolId || !planToAssign) return;
                assignPlan.mutate({ schoolId: selectedSchoolId, planId: planToAssign });
              }}
              type="button"
            >
              {assignPlan.isPending ? "Assigning..." : "Confirm assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setAssignmentToEnd(null);
        }}
        open={assignmentToEnd !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End metadata assignment?</DialogTitle>
            <DialogDescription>
              {assignmentToEnd
                ? `End the ${assignmentToEnd.planName} assignment for ${assignmentToEnd.schoolName}? This records the assignment end only; it does not change billing, payment status, or school access.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {endAssignment.error && <ErrorState message={endAssignment.error.message} />}
          <DialogFooter>
            <Button onClick={() => setAssignmentToEnd(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="text-destructive hover:text-destructive"
              disabled={!assignmentToEnd || endAssignment.isPending}
              onClick={() => {
                if (assignmentToEnd) endAssignment.mutate(assignmentToEnd.schoolId);
              }}
              type="button"
              variant="outline"
            >
              {endAssignment.isPending ? "Ending..." : "Confirm end assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
