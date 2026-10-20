import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  List,
  Search,
  UsersRound,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { TimetableEntryDetailsPanel } from "@/components/timetable/timetable-entry-details-panel";
import { TimetableEntrySheet } from "@/components/timetable/timetable-entry-sheet";
import {
  SummaryCard,
  type SummaryCardItem,
} from "@/components/dashboard/summary-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TimetableView = "weekly" | "daily" | "list";

const views: Array<{
  id: TimetableView;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { id: "weekly", label: "Weekly View", icon: CalendarRange },
  { id: "daily", label: "Daily View", icon: CalendarDays },
  { id: "list", label: "List View", icon: List },
];

const summaryCards: SummaryCardItem[] = [
  {
    title: "Total Classes Scheduled",
    description: "Classes with timetable entries",
    icon: CalendarRange,
  },
  {
    title: "Lessons Today",
    description: "Lessons on the selected date",
    icon: Clock3,
  },
  {
    title: "Teachers Assigned",
    description: "Teachers with assigned lessons",
    icon: UsersRound,
  },
  {
    title: "Rooms in Use",
    description: "Rooms with scheduled lessons",
    icon: DoorOpen,
  },
];

const weekdays = [
  { label: "Monday", offset: 0 },
  { label: "Tuesday", offset: 1 },
  { label: "Wednesday", offset: 2 },
  { label: "Thursday", offset: 3 },
  { label: "Friday", offset: 4 },
];

const placeholderSlots = ["Time slot 1", "Time slot 2", "Time slot 3", "Time slot 4"];

const tableColumns = [
  "Class / programme",
  "Subject",
  "Teacher",
  "Room / venue",
  "Weekday / date",
  "Start time",
  "End time",
  "Actions",
];

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayDate(anchorDate: Date, offset: number) {
  const date = new Date(anchorDate);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset + offset);
  return date;
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function TimetablePage() {
  const [activeView, setActiveView] = useState<TimetableView>("weekly");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedTeacher, setSelectedTeacher] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState("all");
  const activeTab = views.find((view) => view.id === activeView) ?? views[0];

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = views.findIndex((view) => view.id === activeView);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % views.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + views.length) % views.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = views.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = views[nextIndex];
    setActiveView(nextTab.id);
    document.getElementById(`timetable-tab-${nextTab.id}`)?.focus();
  }

  function moveDate(direction: -1 | 1) {
    setSelectedDate((date) => {
      const nextDate = new Date(date);
      nextDate.setDate(
        nextDate.getDate() + direction * (activeView === "daily" ? 1 : 7),
      );
      return nextDate;
    });
  }

  function renderEmptyState(title: string, description: string) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CalendarRange aria-hidden="true" className="size-5" />
        </span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    );
  }

  const periodStart = getWeekdayDate(selectedDate, 0);
  const periodEnd =
    activeView === "daily"
      ? selectedDate
      : getWeekdayDate(selectedDate, 4);
  const periodLabel =
    activeView === "daily"
      ? formatDate(selectedDate, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : `${formatDate(periodStart, { month: "short", day: "numeric" })} – ${formatDate(periodEnd, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">Class scheduling</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Timetable
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            View and manage class schedules, lessons, rooms, and teaching
            assignments. Timetable records will appear when an approved data
            source is connected.
          </p>
        </div>
        <TimetableEntrySheet />
      </section>

      <section aria-labelledby="timetable-overview-heading" className="space-y-4">
        <div>
          <h3
            id="timetable-overview-heading"
            className="text-base font-semibold"
          >
            Schedule overview
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Counts are unavailable until timetable data is connected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section aria-labelledby="timetable-schedule-heading" className="space-y-4">
        <div>
          <h3
            id="timetable-schedule-heading"
            className="text-base font-semibold"
          >
            Class schedule
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Switch views and filter schedules by class, teacher, or room.
          </p>
        </div>

        <Card className="shadow-none">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div
              aria-label="Timetable views"
              className="flex gap-1 overflow-x-auto border-b"
              onKeyDown={handleTabKeyDown}
              role="tablist"
            >
              {views.map((view) => {
                const Icon = view.icon;
                const isActive = activeView === view.id;

                return (
                  <button
                    key={view.id}
                    id={`timetable-tab-${view.id}`}
                    aria-controls={`timetable-panel-${view.id}`}
                    aria-selected={isActive}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setActiveView(view.id)}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {view.label}
                  </button>
                );
              })}
            </div>

            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_repeat(3,minmax(150px,0.7fr))]"
            >
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Date
                </span>
                <input
                  aria-label="Selected timetable date"
                  className={controlClassName}
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }
                    const [year, month, day] = event.target.value
                      .split("-")
                      .map(Number);
                    setSelectedDate(new Date(year, month - 1, day));
                  }}
                  type="date"
                  value={toDateInputValue(selectedDate)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Class / programme
                </span>
                <select
                  className={controlClassName}
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
                  Teacher
                </span>
                <select
                  className={controlClassName}
                  onChange={(event) => setSelectedTeacher(event.target.value)}
                  value={selectedTeacher}
                >
                  <option value="all">All teachers</option>
                  <option disabled value="unavailable">
                    Options unavailable
                  </option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Room
                </span>
                <select
                  className={controlClassName}
                  onChange={(event) => setSelectedRoom(event.target.value)}
                  value={selectedRoom}
                >
                  <option value="all">All rooms</option>
                  <option disabled value="unavailable">
                    Options unavailable
                  </option>
                </select>
              </label>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Timetable data is not connected. Filters do not retrieve or
              change schedules; dates shown are only the selected calendar
              period.
            </p>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                className="text-sm font-medium"
                id="timetable-period"
              >
                {periodLabel}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  aria-label={
                    activeView === "daily"
                      ? "Previous day"
                      : "Previous week"
                  }
                  onClick={() => moveDate(-1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  onClick={() => setSelectedDate(new Date())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Today
                </Button>
                <Button
                  aria-label={
                    activeView === "daily" ? "Next day" : "Next week"
                  }
                  onClick={() => moveDate(1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>

            <div
              aria-labelledby={`timetable-tab-${activeTab.id}`}
              id={`timetable-panel-${activeTab.id}`}
              role="tabpanel"
              tabIndex={0}
            >
              {activeView === "weekly" ? (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-sm">
                      <caption className="sr-only">
                        Weekly timetable for Monday through Friday
                      </caption>
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="w-32 px-4 py-3 font-medium" scope="col">
                            Time slot
                          </th>
                          {weekdays.map(({ label, offset }) => (
                            <th
                              key={label}
                              className="px-4 py-3 font-medium"
                              scope="col"
                            >
                              <span className="block text-foreground">
                                {label}
                              </span>
                              <span className="mt-0.5 block font-normal">
                                {formatDate(
                                  getWeekdayDate(selectedDate, offset),
                                  { month: "short", day: "numeric" },
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            className="border-t px-4 py-5 text-center text-xs leading-5 text-muted-foreground"
                            colSpan={6}
                          >
                            No timetable records are connected for this
                            selected week. Period rows below are layout
                            placeholders, not configured class times.
                          </td>
                        </tr>
                        {placeholderSlots.map((slot) => (
                          <tr key={slot} className="h-16">
                            <th
                              className="border-t px-4 py-3 text-xs font-medium text-muted-foreground"
                              scope="row"
                            >
                              {slot}
                            </th>
                            {weekdays.map(({ label }) => (
                              <td
                                key={`${slot}-${label}`}
                                aria-label={`No lesson records for ${label}, ${slot}`}
                                className="border-l border-t bg-background"
                              />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scroll horizontally to view all weekdays on smaller
                    screens.
                  </p>
                </div>
              ) : activeView === "daily" ? (
                <Card className="shadow-none">
                  <CardContent className="p-0">
                    {renderEmptyState(
                      "No lessons to display",
                      "Timetable records are not connected for this selected date. No lessons, teachers, or rooms are shown.",
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                      <caption className="sr-only">
                        All timetable entries
                      </caption>
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
                      <tbody aria-live="polite">
                        <tr>
                          <td
                            className="px-4 py-12"
                            colSpan={tableColumns.length}
                          >
                            <div className="mx-auto flex max-w-md flex-col items-center text-center">
                              <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <Search
                                  aria-hidden="true"
                                  className="size-5"
                                />
                              </span>
                              <p className="text-sm font-semibold">
                                No timetable entries to display
                              </p>
                              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                                Timetable records are not connected. No class
                                schedules, teachers, or room assignments are
                                shown.
                              </p>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <TimetableEntryDetailsPanel entry={null} />
    </div>
  );
}
