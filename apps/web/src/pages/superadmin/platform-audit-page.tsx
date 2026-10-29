import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  DashboardDataTable,
  DashboardSearchField,
} from "@/components/dashboard/dashboard-primitives";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";
import type { PlatformAuditEvent, PlatformPage } from "@/lib/api/platform-types";

const pageSize = 25;
const filterClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function metadataKeys(event: PlatformAuditEvent) {
  return Object.keys(event.metadata).sort();
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchesSearch(event: PlatformAuditEvent, search: string) {
  if (!search) return true;
  const searchableFields = [
    event.id,
    event.actorUserId ?? "",
    event.eventType,
    event.outcome,
    event.requestId ?? "",
    event.occurredAt,
    ...metadataKeys(event),
  ];
  return searchableFields.some((value) => value.toLocaleLowerCase().includes(search));
}

export function PlatformAuditPage() {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<PlatformAuditEvent | null>(null);
  const events = useQuery({
    queryKey: ["platform-audit-events", offset],
    queryFn: ({ signal }) =>
      apiRequest<PlatformPage<PlatformAuditEvent>>(
        `/platform/audit-events?limit=${pageSize}&offset=${offset}`,
        { signal },
      ),
    retry: false,
  });
  const total = events.data?.meta.total ?? 0;
  const pageEvents = events.data?.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate);
  const filteredEvents = invalidDateRange
    ? []
    : pageEvents.filter((event) => {
        const eventDate = new Date(event.occurredAt);
        const hasDateFilter = Boolean(startDate || endDate);
        if (hasDateFilter && Number.isNaN(eventDate.getTime())) return false;
        const date = Number.isNaN(eventDate.getTime()) ? "" : localDateValue(eventDate);
        return (
          matchesSearch(event, normalizedSearch) &&
          (!eventType || event.eventType === eventType) &&
          (!outcome || event.outcome === outcome) &&
          (!startDate || date >= startDate) &&
          (!endDate || date <= endDate)
        );
      });
  const filtersActive = Boolean(search || eventType || outcome || startDate || endDate);
  const start = total === 0 ? 0 : Math.min(offset + 1, total);
  const end = Math.min(offset + pageEvents.length, total);
  const eventTypes = [...new Set(pageEvents.map((event) => event.eventType))].sort();
  const outcomes = [...new Set(pageEvents.map((event) => event.outcome))].sort();

  function clearFilters() {
    setSearch("");
    setEventType("");
    setOutcome("");
    setStartDate("");
    setEndDate("");
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        actions={
          <Button
            disabled={events.isFetching}
            onClick={() => void events.refetch()}
            size="sm"
            variant="outline"
          >
            {events.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        }
        description="Paginated platform events. This view does not include school-scoped audit events or tenant student and financial records."
        eyebrow={<Badge variant="secondary">Platform-only audit</Badge>}
        title="Audit events"
      />

      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          {!events.isPending && !events.isError && pageEvents.length > 0 && (
            <section aria-label="Audit event filters" className="space-y-3">
              <p className="text-xs leading-5 text-muted-foreground">
                Filters apply only to the {pageEvents.length} events on this loaded page. The API
                supports pagination but does not support server-side search or filtering.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <DashboardSearchField
                  label="Search this page"
                  onChange={setSearch}
                  placeholder="Event, actor, request ID..."
                  value={search}
                />
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Event type</span>
                  <select
                    className={filterClassName}
                    onChange={(event) => setEventType(event.target.value)}
                    value={eventType}
                  >
                    <option value="">All event types</option>
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Outcome</span>
                  <select
                    className={filterClassName}
                    onChange={(event) => setOutcome(event.target.value)}
                    value={outcome}
                  >
                    <option value="">All outcomes</option>
                    {outcomes.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">From date</span>
                  <input
                    aria-label="Audit events from date"
                    className={filterClassName}
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    value={startDate}
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">To date</span>
                  <input
                    aria-label="Audit events to date"
                    className={filterClassName}
                    onChange={(event) => setEndDate(event.target.value)}
                    type="date"
                    value={endDate}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {invalidDateRange ? (
                  <p className="text-sm text-destructive" role="alert">
                    The end date must be on or after the start date.
                  </p>
                ) : (
                  <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
                    {filteredEvents.length} matching{" "}
                    {filteredEvents.length === 1 ? "event" : "events"} on this page
                  </p>
                )}
                {filtersActive && filteredEvents.length > 0 && (
                  <Button onClick={clearFilters} size="sm" variant="outline">
                    Clear filters
                  </Button>
                )}
              </div>
            </section>
          )}

          {events.isPending ? (
            <LoadingState className="min-h-48" message="Loading platform audit events..." />
          ) : events.isError ? (
            <ErrorState onRetry={() => void events.refetch()} />
          ) : pageEvents.length === 0 ? (
            <EmptyState
              className="min-h-48 justify-center"
              description="The platform audit endpoint returned no events."
              title="No audit events"
            />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              action={
                filtersActive ? (
                  <Button className="mt-4" onClick={clearFilters} size="sm" variant="outline">
                    Clear filters
                  </Button>
                ) : undefined
              }
              className="min-h-48 justify-center"
              description="Try changing the search or filters for events on this page."
              title="No matching audit events"
            />
          ) : (
            <DashboardDataTable
              caption="Platform audit events on the current page"
              headers={["Event type", "Outcome", "Occurred", "Actor", "Metadata fields", "Details"]}
            >
              {filteredEvents.map((event) => (
                <tr className="border-t align-top" key={event.id}>
                  <th className="min-w-48 px-4 py-3 text-left font-medium" scope="row">
                    {event.eventType}
                  </th>
                  <td className="px-4 py-3">
                    <Badge variant={event.outcome === "SUCCESS" ? "secondary" : "outline"}>
                      {event.outcome}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
                  </td>
                  <td className="max-w-48 break-all px-4 py-3 text-xs text-muted-foreground">
                    {event.actorUserId ?? "Not recorded"}
                  </td>
                  <td className="max-w-sm px-4 py-3 text-xs leading-5 text-muted-foreground">
                    {metadataKeys(event).length > 0
                      ? metadataKeys(event).join(", ")
                      : "No metadata"}
                  </td>
                  <td className="px-4 py-3">
                    <Button onClick={() => setSelectedEvent(event)} size="sm" variant="outline">
                      View details
                    </Button>
                  </td>
                </tr>
              ))}
            </DashboardDataTable>
          )}

          {!events.isPending && !events.isError && (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {total === 0
                  ? "0 events"
                  : `Events ${start}–${end} of ${total} · ${pageEvents.length} on this page`}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={offset === 0 || events.isFetching}
                  onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
                  size="sm"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={offset + pageSize >= total || events.isFetching}
                  onClick={() => setOffset((current) => current + pageSize)}
                  size="sm"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
        open={selectedEvent !== null}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle>Audit event details</DialogTitle>
                <DialogDescription>
                  Platform event fields returned by the protected audit endpoint. Metadata values
                  are intentionally not displayed.
                </DialogDescription>
              </DialogHeader>
              <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
                <dt className="font-medium">Event type</dt>
                <dd className="break-all">{selectedEvent.eventType}</dd>
                <dt className="font-medium">Outcome</dt>
                <dd>{selectedEvent.outcome}</dd>
                <dt className="font-medium">Occurred</dt>
                <dd>
                  <time dateTime={selectedEvent.occurredAt}>
                    {formatTimestamp(selectedEvent.occurredAt)}
                  </time>
                </dd>
                <dt className="font-medium">Event ID</dt>
                <dd className="break-all">{selectedEvent.id}</dd>
                <dt className="font-medium">Actor user ID</dt>
                <dd className="break-all">{selectedEvent.actorUserId ?? "Not recorded"}</dd>
                <dt className="font-medium">Request ID</dt>
                <dd className="break-all">{selectedEvent.requestId ?? "Not recorded"}</dd>
                <dt className="font-medium">Metadata fields</dt>
                <dd className="break-all">
                  {metadataKeys(selectedEvent).length > 0
                    ? metadataKeys(selectedEvent).join(", ")
                    : "No metadata fields"}
                </dd>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
