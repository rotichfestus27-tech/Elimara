import { useState } from "react";
import { DashboardBarChart } from "@/components/dashboard/dashboard-primitives";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const summaryDimensions = [
  "Active schools",
  "Suspended schools",
  "Closed schools",
  "Active plans",
  "Active subscriptions",
];

export function PlatformAnalyticsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        description="Review the available platform reporting dimensions and the data needed for future time-based analysis. No live or sample analytics are displayed."
        eyebrow={<Badge variant="outline">Analytics data unavailable</Badge>}
        title="Platform analytics"
      />

      <Card>
        <CardHeader>
          <CardTitle aria-level={3} className="text-base" role="heading">
            Reporting period
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Select the period you would want a future report to cover. These controls are a local
            preview only; they do not query or filter data.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium">Start date</span>
              <input
                aria-label="Reporting period start date"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium">End date</span>
              <input
                aria-label="Reporting period end date"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>
          {invalidRange ? (
            <p className="text-sm text-destructive" role="alert">
              The end date must be on or after the start date.
            </p>
          ) : startDate && endDate ? (
            <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
              Selected preview period: {startDate} to {endDate}. No report data is available for
              this period.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Choose both dates to set a preview reporting period.
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="platform-summary-heading" className="space-y-3">
        <div>
          <h2 className="text-base font-semibold" id="platform-summary-heading">
            Available platform summary dimensions
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            The documented platform summary reports current counts only. No dated history or
            reporting-period breakdown is available, and this preview does not request that API.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaryDimensions.map((dimension) => (
            <Card key={dimension}>
              <CardContent className="space-y-2 p-4">
                <p className="text-xs font-medium text-muted-foreground">{dimension}</p>
                <p className="text-lg font-semibold">Unavailable</p>
                <p className="text-xs text-muted-foreground">No data loaded</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle aria-level={3} className="text-base" role="heading">
              School status breakdown
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              Counts by the documented school lifecycle statuses. No status counts are supplied in
              this preview.
            </p>
          </CardHeader>
          <CardContent>
            <DashboardBarChart title="Current schools by status" values={[]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle aria-level={3} className="text-base" role="heading">
              Platform trend
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              A time-series dataset is not defined by the available platform API contract.
            </p>
          </CardHeader>
          <CardContent>
            <DashboardBarChart title="Platform activity over selected period" values={[]} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle aria-level={3} className="text-base" role="heading">
            What is needed for analytics
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            No live platform analytics or illustrative sample values are shown. Historical trend
            series and date-filtered reports require a dedicated analytics API contract and backend
            data source.
          </p>
        </CardHeader>
      </Card>
    </div>
  );
}
