import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Building2,
  ClipboardList,
  CreditCard,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";
import { DashboardLoadingSkeleton } from "@/components/dashboard/dashboard-primitives";
import { SummaryCard, type SummaryCardItem } from "@/components/dashboard/summary-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/data-states";
import { apiRequest } from "@/lib/api/client";
import type { PlatformAuditEvent, PlatformPage, PlatformSummary } from "@/lib/api/platform-types";

export function SuperadminOverviewPage() {
  const summary = useQuery({
    queryKey: ["platform-summary"],
    queryFn: ({ signal }) => apiRequest<{ data: PlatformSummary }>("/platform/summary", { signal }),
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["platform-audit-events", "recent"],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformAuditEvent>>("/platform/audit-events?limit=5&offset=0", {
        signal,
      }),
    retry: false,
  });

  const metricItems: SummaryCardItem[] = summary.data
    ? [
        {
          title: "Active schools",
          description: "School tenants currently active",
          icon: Building2,
          value: summary.data.data.schools.ACTIVE,
        },
        {
          title: "Suspended schools",
          description: "School tenants currently suspended",
          icon: Building2,
          value: summary.data.data.schools.SUSPENDED,
        },
        {
          title: "Active plans",
          description: "Metadata-only plan catalog entries",
          icon: ShieldCheck,
          value: summary.data.data.activePlans,
        },
        {
          title: "Current subscriptions",
          description: "Active plan assignments, not payment status",
          icon: CreditCard,
          value: summary.data.data.activeSubscriptions,
        },
      ]
    : [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        actions={
          <Badge className="w-fit max-w-full gap-1.5" variant="outline">
            <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">Server-verified platform access</span>
          </Badge>
        }
        description={
          <>
            Live school lifecycle, plan, subscription, and platform audit summaries. Subscription
            counts are metadata assignments, not billing or payment information.
          </>
        }
        eyebrow={<Badge variant="secondary">Platform administration</Badge>}
        title="Platform overview"
      />

      <section aria-label="Platform metrics" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Platform metrics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Live counts from the protected platform summary API. No demo figures are shown.
            </p>
          </div>
          <Button
            disabled={summary.isFetching || activity.isFetching}
            onClick={() => {
              void summary.refetch();
              void activity.refetch();
            }}
            size="sm"
            variant="outline"
          >
            {summary.isFetching || activity.isFetching
              ? "Refreshing overview..."
              : "Refresh overview"}
          </Button>
        </div>
        {summary.isPending ? (
          <DashboardLoadingSkeleton rows={4} />
        ) : summary.isError ? (
          <ErrorState onRetry={() => void summary.refetch()} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {metricItems.map((item) => (
              <SummaryCard key={item.title} item={item} />
            ))}
            <SummaryCard
              item={{
                title: "Closed schools",
                description: "School tenants marked closed",
                icon: Building2,
                value: summary.data.data.schools.CLOSED,
              }}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="platform-shortcuts-heading" className="space-y-3">
        <div>
          <h2 className="text-base font-semibold" id="platform-shortcuts-heading">
            Platform workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open an available control-plane area.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PlatformShortcut
            description="Review tenant status and contact metadata."
            href="/superadmin/schools"
            icon={Building2}
            label="Manage schools"
          />
          <PlatformShortcut
            description="Review plan metadata and school assignments."
            href="/superadmin/subscriptions"
            icon={CreditCard}
            label="Plans & subscriptions"
          />
          <PlatformShortcut
            description="Inspect the platform-only audit event feed."
            href="/superadmin/audit-logs"
            icon={ClipboardList}
            label="Audit events"
          />
          <PlatformShortcut
            description="Review authenticator enrollment and session verification."
            href="/superadmin/security"
            icon={ShieldCheck}
            label="Security"
          />
        </div>
      </section>

      <section aria-label="Recent platform activity">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <Activity aria-hidden="true" className="size-[18px]" />
              </span>
              <div className="space-y-1">
                <CardTitle aria-level={3} className="text-sm" role="heading">
                  Recent platform activity
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Latest events from the platform-only audit feed.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/superadmin/audit-logs">View audit events</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activity.isPending ? (
              <DashboardLoadingSkeleton rows={3} />
            ) : activity.isError ? (
              <ErrorState onRetry={() => void activity.refetch()} />
            ) : activity.data.data.length === 0 ? (
              <EmptyState
                description="No platform audit events were returned."
                title="No recent activity"
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {activity.data.data.map((event) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    key={event.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{event.eventType}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(event.occurredAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={event.outcome === "SUCCESS" ? "secondary" : "outline"}>
                      {event.outcome}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function PlatformShortcut({
  description,
  href,
  icon: Icon,
  label,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      to={href}
    >
      <Card className="h-full shadow-none transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
        <CardContent className="flex h-full min-h-32 items-start justify-between gap-3 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon aria-hidden="true" className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {description}
              </span>
            </span>
          </div>
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          />
        </CardContent>
      </Card>
    </Link>
  );
}
