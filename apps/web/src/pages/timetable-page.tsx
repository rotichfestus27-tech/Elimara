import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  DoorOpen,
  Edit2,
  Lock,
  Plus,
  Unlock,
  UserCheck,
} from "lucide-react";
import { useId, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api/client";
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------

export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: "MONDAY", label: "Monday" },
  { key: "TUESDAY", label: "Tuesday" },
  { key: "WEDNESDAY", label: "Wednesday" },
  { key: "THURSDAY", label: "Thursday" },
  { key: "FRIDAY", label: "Friday" },
  { key: "SATURDAY", label: "Saturday" },
  { key: "SUNDAY", label: "Sunday" },
];

export type AcademicYearRecord = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  startsOn: string;
  endsOn: string;
};

export type AcademicClassRecord = {
  id: string;
  name: string;
  academicYearId: string;
  status: "ACTIVE" | "INACTIVE";
};

export type ClassStreamRecord = {
  id: string;
  name: string;
  classId: string;
  status: "ACTIVE" | "INACTIVE";
};

export type SubjectRecord = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

export type ClassSubjectRecord = {
  id: string;
  classId: string;
  subjectId: string;
  status: "ACTIVE" | "INACTIVE";
};

export type StaffMemberRecord = {
  id: string;
  staffNumber: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  positionTitle: string;
  status: "ACTIVE" | "INACTIVE";
};

export type TimetablePeriodRecord = {
  id: string;
  name: string;
  position: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export type SchoolRoomRecord = {
  id: string;
  name: string;
  capacity: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type StaffAvailabilityRecord = {
  id: string;
  staffId: string;
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export type TimetableRecord = {
  id: string;
  academicYearId: string;
  name: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TimetableLessonRecord = {
  id: string;
  timetableId: string;
  academicYearId: string;
  classId: string;
  streamId: string | null;
  classSubjectAssignmentId: string;
  staffId: string;
  roomId: string | null;
  weekday: Weekday;
  startPeriodId: string;
  endPeriodId: string;
  createdAt: string;
  updatedAt: string;
};

// -----------------------------------------------------------------------------
// Component: TimetablePage
// -----------------------------------------------------------------------------

export function TimetablePage() {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"grid" | "periods-rooms" | "availability">("grid");

  // Selection states
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [selectedTimetableId, setSelectedTimetableId] = useState<string>("");

  // Filters for timetable grid
  const [filterClassId, setFilterClassId] = useState<string>("all");
  const [filterStaffId, setFilterStaffId] = useState<string>("all");
  const [filterRoomId, setFilterRoomId] = useState<string>("all");
  const [includeWeekends, setIncludeWeekends] = useState<boolean>(false);

  // Modal dialog states
  const [isCreateTimetableOpen, setIsCreateTimetableOpen] = useState(false);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<TimetableLessonRecord | null>(null);
  const [defaultSlot, setDefaultSlot] = useState<{ weekday: Weekday; periodId: string } | null>(
    null,
  );

  const [isAddPeriodOpen, setIsAddPeriodOpen] = useState(false);
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [isAddAvailabilityOpen, setIsAddAvailabilityOpen] = useState(false);
  const [selectedStaffForAvailability, setSelectedStaffForAvailability] = useState<string>("");

  // ---------------------------------------------------------------------------
  // Data Queries
  // ---------------------------------------------------------------------------

  // Academic Years
  const yearsQuery = useSchoolList<AcademicYearRecord>("/academic-years", {
    limit: 100,
    status: "ACTIVE",
  });
  const years = yearsQuery.data?.data ?? [];
  const currentYearId = selectedYearId || years[0]?.id || "";

  // Timetables for selected academic year
  const timetablesQuery = useSchoolData<{ data: TimetableRecord[] }>(
    `/academic-years/${encodeURIComponent(currentYearId)}/timetables`,
    {},
    { enabled: Boolean(currentYearId) },
  );
  const timetables = timetablesQuery.data?.data ?? [];
  const currentTimetable =
    timetables.find((t) => t.id === selectedTimetableId) || timetables[0] || null;
  const currentTimetableId = currentTimetable?.id || "";

  // Periods
  const periodsQuery = useSchoolData<{ data: TimetablePeriodRecord[] }>("/timetable-periods");
  const periods = (periodsQuery.data?.data ?? []).slice().sort((a, b) => a.position - b.position);

  // Rooms
  const roomsQuery = useSchoolData<{ data: SchoolRoomRecord[] }>("/rooms");
  const rooms = (roomsQuery.data?.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  // Staff Profiles
  const staffQuery = useSchoolList<StaffMemberRecord>("/staff", {
    limit: 100,
    status: "ACTIVE",
    sortBy: "givenName",
  });
  const staffList = staffQuery.data?.data ?? [];

  // Academic Classes (filtered by current active year)
  const classesQuery = useSchoolList<AcademicClassRecord>("/classes", {
    limit: 100,
    academicYearId: currentYearId || undefined,
    status: "ACTIVE",
  });
  const classes = classesQuery.data?.data ?? [];

  // Streams (all active streams)
  const streamsQuery = useSchoolList<ClassStreamRecord>("/streams", {
    limit: 100,
    status: "ACTIVE",
  });
  const streams = streamsQuery.data?.data ?? [];

  // Subjects (all active subjects)
  const subjectsQuery = useSchoolList<SubjectRecord>("/subjects", {
    limit: 100,
    status: "ACTIVE",
  });
  const subjects = subjectsQuery.data?.data ?? [];

  // Class-Subject Assignments
  const classSubjectsQuery = useSchoolList<ClassSubjectRecord>("/class-subjects", {
    limit: 200,
    status: "ACTIVE",
  });
  const classSubjects = classSubjectsQuery.data?.data ?? [];

  // Lessons for current timetable
  const lessonsQuery = useSchoolData<{ data: TimetableLessonRecord[] }>(
    `/timetables/${encodeURIComponent(currentTimetableId)}/lessons`,
    {},
    { enabled: Boolean(currentTimetableId) },
  );
  const lessons = lessonsQuery.data?.data ?? [];

  // Staff Availability (if selected)
  const availabilityQuery = useSchoolData<{ data: StaffAvailabilityRecord[] }>(
    `/staff/${encodeURIComponent(selectedStaffForAvailability)}/availability`,
    {},
    { enabled: Boolean(selectedStaffForAvailability) },
  );
  const availabilityWindows = availabilityQuery.data?.data ?? [];

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const publishMutation = useMutation({
    mutationFn: async ({ timetableId, publish }: { timetableId: string; publish: boolean }) => {
      const action = publish ? "publish" : "unpublish";
      return apiRequest<TimetableRecord>(
        `/schools/${school?.id}/timetables/${timetableId}/${action}`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", school?.id] });
    },
  });

  // ---------------------------------------------------------------------------
  // Lookup Helpers
  // ---------------------------------------------------------------------------

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const classSubjectMap = new Map(
    classSubjects.map((cs) => [
      cs.id,
      {
        ...cs,
        subjectName: subjectMap.get(cs.subjectId) ?? "Unknown Subject",
      },
    ]),
  );
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const streamMap = new Map(streams.map((s) => [s.id, s.name]));
  const staffMap = new Map(
    staffList.map((st) => [
      st.id,
      `${st.givenName} ${st.familyName} (${st.positionTitle || st.staffNumber})`,
    ]),
  );
  const roomMap = new Map(rooms.map((r) => [r.id, `${r.name} (cap: ${r.capacity})`]));

  // Display weekdays
  const activeWeekdays = includeWeekends ? WEEKDAYS : WEEKDAYS.slice(0, 5);

  // Filter lessons
  const filteredLessons = lessons.filter((lesson) => {
    if (filterClassId !== "all" && lesson.classId !== filterClassId) return false;
    if (filterStaffId !== "all" && lesson.staffId !== filterStaffId) return false;
    if (filterRoomId !== "all" && lesson.roomId !== filterRoomId) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Page Title */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Academic Operations</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Timetable & Scheduling
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Configure school periods, rooms, teacher availability windows, and interactive weekly
            timetables.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "grid" && currentTimetable && (
            <>
              {currentTimetable.status === "DRAFT" ? (
                <>
                  <Button
                    onClick={() => {
                      setEditingLesson(null);
                      setDefaultSlot(null);
                      setIsLessonModalOpen(true);
                    }}
                    size="sm"
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Schedule Lesson
                  </Button>
                  <Button
                    disabled={publishMutation.isPending || lessons.length === 0}
                    onClick={() => {
                      if (
                        confirm(
                          "Are you sure you want to publish this timetable? Published timetables become the active operational schedule.",
                        )
                      ) {
                        publishMutation.mutate({
                          timetableId: currentTimetable.id,
                          publish: true,
                        });
                      }
                    }}
                    size="sm"
                    variant="default"
                  >
                    <Lock className="mr-1.5 h-4 w-4" /> Publish Timetable
                  </Button>
                </>
              ) : (
                <Button
                  disabled={publishMutation.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Unpublishing will allow editing lessons, but lesson attendance registers may rely on this schedule. Continue?",
                      )
                    ) {
                      publishMutation.mutate({
                        timetableId: currentTimetable.id,
                        publish: false,
                      });
                    }
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Unlock className="mr-1.5 h-4 w-4" /> Unpublish to Edit
                </Button>
              )}
            </>
          )}
          {activeTab === "periods-rooms" && (
            <div className="flex gap-2">
              <Button onClick={() => setIsAddPeriodOpen(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Add Period
              </Button>
              <Button onClick={() => setIsAddRoomOpen(true)} size="sm" variant="outline">
                <Plus className="mr-1.5 h-4 w-4" /> Add Room
              </Button>
            </div>
          )}
          {activeTab === "availability" && (
            <Button
              disabled={!selectedStaffForAvailability}
              onClick={() => setIsAddAvailabilityOpen(true)}
              size="sm"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add Availability Window
            </Button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-medium">
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "grid"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("grid")}
          type="button"
        >
          <Calendar className="h-4 w-4" />
          Weekly Master Timetable
        </button>
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "periods-rooms"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("periods-rooms")}
          type="button"
        >
          <Clock className="h-4 w-4" />
          Periods & Rooms Setup
        </button>
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "availability"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("availability")}
          type="button"
        >
          <UserCheck className="h-4 w-4" />
          Staff Availability
        </button>
      </div>

      {publishMutation.isError && <RequestError error={publishMutation.error} />}

      {/* ===================================================================== */}
      {/* TAB 1: WEEKLY MASTER TIMETABLE                                        */}
      {/* ===================================================================== */}
      {activeTab === "grid" && (
        <div className="space-y-4">
          {/* Timetable Selection & Status Banner */}
          <Card className="shadow-none">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Academic Year</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => {
                      setSelectedYearId(e.target.value);
                      setSelectedTimetableId("");
                    }}
                    value={currentYearId}
                  >
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Timetable Version</span>
                    <button
                      className="text-primary hover:underline"
                      onClick={() => setIsCreateTimetableOpen(true)}
                      type="button"
                    >
                      + Create New
                    </button>
                  </span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={timetables.length === 0}
                    onChange={(e) => setSelectedTimetableId(e.target.value)}
                    value={currentTimetableId}
                  >
                    {timetables.length === 0 && <option value="">No timetables found</option>}
                    {timetables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.status.toLowerCase()})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    {currentTimetable ? (
                      <Badge
                        variant={currentTimetable.status === "PUBLISHED" ? "default" : "secondary"}
                      >
                        {currentTimetable.status === "PUBLISHED" ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Published
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Edit2 className="h-3 w-3" /> Draft (Editable)
                          </span>
                        )}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </div>
                  {currentTimetable?.publishedAt && (
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      Live since {new Date(currentTimetable.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-start lg:justify-end">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      checked={includeWeekends}
                      className="rounded border-input"
                      onChange={(e) => setIncludeWeekends(e.target.checked)}
                      type="checkbox"
                    />
                    Include Weekend Days
                  </label>
                </div>
              </div>

              {/* Secondary Filters Bar */}
              {currentTimetable && (
                <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs">
                  <span className="font-medium text-muted-foreground">Filter Grid:</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    onChange={(e) => setFilterClassId(e.target.value)}
                    value={filterClassId}
                  >
                    <option value="all">All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    onChange={(e) => setFilterStaffId(e.target.value)}
                    value={filterStaffId}
                  >
                    <option value="all">All Teachers</option>
                    {staffList.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.givenName} {st.familyName}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    onChange={(e) => setFilterRoomId(e.target.value)}
                    value={filterRoomId}
                  >
                    <option value="all">All Rooms</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {(filterClassId !== "all" ||
                    filterStaffId !== "all" ||
                    filterRoomId !== "all") && (
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setFilterClassId("all");
                        setFilterStaffId("all");
                        setFilterRoomId("all");
                      }}
                      type="button"
                    >
                      Clear Filters
                    </button>
                  )}
                  <span className="ml-auto text-muted-foreground">
                    Showing {filteredLessons.length} of {lessons.length} scheduled lessons
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interactive Timetable Grid */}
          {!currentTimetableId ? (
            <Card className="shadow-none">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Calendar className="mb-2 h-10 w-10 text-muted-foreground/60" />
                <p className="text-base font-medium text-foreground">No Timetable Selected</p>
                <p className="mt-1 text-sm">
                  Create a new timetable for this academic year to start planning weekly lessons.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setIsCreateTimetableOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Create Timetable
                </Button>
              </CardContent>
            </Card>
          ) : periods.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Clock className="mb-2 h-10 w-10 text-muted-foreground/60" />
                <p className="text-base font-medium text-foreground">No Timetable Periods Defined</p>
                <p className="mt-1 text-sm">
                  You need to configure the periods and lesson times before building a timetable
                  grid.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setActiveTab("periods-rooms")}
                  size="sm"
                  variant="outline"
                >
                  Configure Periods
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden shadow-none">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-28 border-r px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Period / Time
                      </th>
                      {activeWeekdays.map((day) => (
                        <th
                          className="border-r px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground last:border-r-0"
                          key={day.key}
                        >
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {periods.map((period) => (
                      <tr className="hover:bg-muted/10" key={period.id}>
                        {/* Period Column */}
                        <td className="border-r bg-muted/20 px-3 py-2.5 align-top">
                          <div className="font-medium text-foreground">{period.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {period.startsAt} – {period.endsAt}
                          </div>
                        </td>

                        {/* Weekday Cells */}
                        {activeWeekdays.map((day) => {
                          const slotLessons = filteredLessons.filter(
                            (l) => l.weekday === day.key && l.startPeriodId === period.id,
                          );

                          return (
                            <td
                              className="border-r p-2 align-top transition-colors last:border-r-0 hover:bg-accent/20"
                              key={`${day.key}-${period.id}`}
                            >
                              <div className="space-y-1.5 min-h-[64px]">
                                {slotLessons.map((lesson) => {
                                  const assignment = classSubjectMap.get(
                                    lesson.classSubjectAssignmentId,
                                  );
                                  const subjectName = assignment?.subjectName ?? "Subject";
                                  const className =
                                    classMap.get(lesson.classId) ?? "Unknown Class";
                                  const streamName = lesson.streamId
                                    ? streamMap.get(lesson.streamId)
                                    : null;
                                  const teacherName =
                                    staffMap.get(lesson.staffId) ?? "Unknown Teacher";
                                  const room = lesson.roomId ? roomMap.get(lesson.roomId) : null;
                                  const isMultiPeriod = lesson.startPeriodId !== lesson.endPeriodId;

                                  return (
                                    <div
                                      className="group relative rounded-md border border-border bg-card p-2 text-xs shadow-xs hover:border-primary/50"
                                      key={lesson.id}
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <div className="font-semibold text-foreground">
                                          {subjectName}
                                        </div>
                                        {currentTimetable.status === "DRAFT" && (
                                          <button
                                            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
                                            onClick={() => {
                                              setEditingLesson(lesson);
                                              setDefaultSlot(null);
                                              setIsLessonModalOpen(true);
                                            }}
                                            title="Edit Lesson"
                                            type="button"
                                          >
                                            <Edit2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>

                                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                        <span className="font-medium text-foreground">
                                          {className}
                                          {streamName ? ` (${streamName})` : ""}
                                        </span>
                                        <span>•</span>
                                        <span>{teacherName.split(" (")[0]}</span>
                                      </div>

                                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                                        {room && (
                                          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                            <DoorOpen className="h-2.5 w-2.5" />
                                            {room.split(" (")[0]}
                                          </span>
                                        )}
                                        {isMultiPeriod && (
                                          <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                                            Double Lesson
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                {currentTimetable.status === "DRAFT" && slotLessons.length === 0 && (
                                  <button
                                    className="flex h-12 w-full items-center justify-center rounded border border-dashed border-muted-foreground/20 text-xs text-muted-foreground/50 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary"
                                    onClick={() => {
                                      setEditingLesson(null);
                                      setDefaultSlot({
                                        weekday: day.key,
                                        periodId: period.id,
                                      });
                                      setIsLessonModalOpen(true);
                                    }}
                                    type="button"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PERIODS & ROOMS SETUP                                          */}
      {/* ===================================================================== */}
      {activeTab === "periods-rooms" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Periods Configuration */}
          <Card className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">School Day Periods</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Configured daily lesson time slots and order.
                </p>
              </div>
              <Button onClick={() => setIsAddPeriodOpen(true)} size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Period
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Order</th>
                      <th className="px-4 py-2.5 font-medium">Period Name</th>
                      <th className="px-4 py-2.5 font-medium">Start Time</th>
                      <th className="px-4 py-2.5 font-medium">End Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {periods.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-xs text-muted-foreground" colSpan={4}>
                          No periods defined yet. Add the daily class periods.
                        </td>
                      </tr>
                    ) : (
                      periods.map((p) => (
                        <tr className="hover:bg-muted/20" key={p.id}>
                          <td className="px-4 py-2.5 text-xs font-semibold">{p.position}</td>
                          <td className="px-4 py-2.5 text-xs font-medium text-foreground">{p.name}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.startsAt}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.endsAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Right: Rooms Configuration */}
          <Card className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Rooms & Facilities</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Classrooms, science laboratories, and facilities.
                </p>
              </div>
              <Button onClick={() => setIsAddRoomOpen(true)} size="sm" variant="outline">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Room
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Room Name</th>
                      <th className="px-4 py-2.5 font-medium">Capacity</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rooms.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-xs text-muted-foreground" colSpan={3}>
                          No rooms configured yet. Add classrooms and facilities.
                        </td>
                      </tr>
                    ) : (
                      rooms.map((r) => (
                        <tr className="hover:bg-muted/20" key={r.id}>
                          <td className="px-4 py-2.5 text-xs font-medium text-foreground">{r.name}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {r.capacity} seats
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>
                              {r.status.toLowerCase()}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: STAFF AVAILABILITY                                             */}
      {/* ===================================================================== */}
      {activeTab === "availability" && (
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="max-w-md space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Select Staff Member to View / Configure Availability
                </span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(e) => setSelectedStaffForAvailability(e.target.value)}
                  value={selectedStaffForAvailability}
                >
                  <option value="">-- Choose a teacher or staff member --</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.givenName} {st.familyName} — {st.positionTitle || st.staffNumber}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStaffForAvailability ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between border-t pt-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Weekly Availability Windows
                    </h3>
                    <Button onClick={() => setIsAddAvailabilityOpen(true)} size="sm">
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Window
                    </Button>
                  </div>

                  {availabilityQuery.isPending ? (
                    <RequestLoading />
                  ) : availabilityWindows.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">No Availability Restrictions</p>
                      <p className="mt-1">
                        This staff member is currently unrestricted and can be scheduled at any time
                        during the school day.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {availabilityWindows.map((window) => (
                        <div
                          className="flex items-center justify-between rounded-lg border p-3 text-xs"
                          key={window.id}
                        >
                          <div>
                            <div className="font-semibold text-foreground">{window.weekday}</div>
                            <div className="text-muted-foreground">
                              {window.startsAt} – {window.endsAt}
                            </div>
                          </div>
                          <Badge variant="outline">Active</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
                  Select a staff member from the dropdown above to inspect their weekly teaching
                  availability.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREATE TIMETABLE                                               */}
      {/* ===================================================================== */}
      {isCreateTimetableOpen && (
        <CreateTimetableDialog
          academicYearId={currentYearId}
          onClose={() => setIsCreateTimetableOpen(false)}
          onSuccess={(newId) => {
            setSelectedTimetableId(newId);
            setIsCreateTimetableOpen(false);
          }}
          schoolId={school?.id ?? ""}
        />
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD / EDIT LESSON                                              */}
      {/* ===================================================================== */}
      {isLessonModalOpen && currentTimetable && (
        <LessonDialog
          classes={classes}
          classSubjectMap={classSubjectMap}
          classSubjects={classSubjects}
          defaultSlot={defaultSlot}
          existingLesson={editingLesson}
          onClose={() => {
            setIsLessonModalOpen(false);
            setEditingLesson(null);
            setDefaultSlot(null);
          }}
          periods={periods}
          rooms={rooms}
          schoolId={school?.id ?? ""}
          staffList={staffList}
          streams={streams}
          timetableId={currentTimetable.id}
        />
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD PERIOD                                                     */}
      {/* ===================================================================== */}
      {isAddPeriodOpen && (
        <AddPeriodDialog
          existingCount={periods.length}
          onClose={() => setIsAddPeriodOpen(false)}
          schoolId={school?.id ?? ""}
        />
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD ROOM                                                       */}
      {/* ===================================================================== */}
      {isAddRoomOpen && (
        <AddRoomDialog onClose={() => setIsAddRoomOpen(false)} schoolId={school?.id ?? ""} />
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD AVAILABILITY                                               */}
      {/* ===================================================================== */}
      {isAddAvailabilityOpen && selectedStaffForAvailability && (
        <AddAvailabilityDialog
          onClose={() => setIsAddAvailabilityOpen(false)}
          schoolId={school?.id ?? ""}
          staffId={selectedStaffForAvailability}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-Dialogs
// -----------------------------------------------------------------------------

function CreateTimetableDialog({
  schoolId,
  academicYearId,
  onClose,
  onSuccess,
}: {
  schoolId: string;
  academicYearId: string;
  onClose: () => void;
  onSuccess: (newId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const nameId = useId();

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ data: TimetableRecord }>(
        `/schools/${schoolId}/academic-years/${academicYearId}/timetables`,
        {
          method: "POST",
          body: { name: name.trim() },
        },
      );
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onSuccess(res.data.id);
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Timetable</DialogTitle>
          <DialogDescription>
            Create a draft timetable container for this academic year.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMutation.mutate();
          }}
        >
          {createMutation.isError && (
            <RequestError error={createMutation.error} />
          )}
          <label className="block space-y-1 text-sm" htmlFor={nameId}>
            <span className="font-medium">Timetable Name</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={nameId}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Term 1 Master Schedule 2026"
              required
              value={name}
            />
          </label>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={createMutation.isPending || !name.trim()} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonDialog({
  schoolId,
  timetableId,
  existingLesson,
  defaultSlot,
  classes,
  streams,
  classSubjects,
  classSubjectMap,
  staffList,
  rooms,
  periods,
  onClose,
}: {
  schoolId: string;
  timetableId: string;
  existingLesson: TimetableLessonRecord | null;
  defaultSlot: { weekday: Weekday; periodId: string } | null;
  classes: AcademicClassRecord[];
  streams: ClassStreamRecord[];
  classSubjects: ClassSubjectRecord[];
  classSubjectMap: Map<string, ClassSubjectRecord & { subjectName: string }>;
  staffList: StaffMemberRecord[];
  rooms: SchoolRoomRecord[];
  periods: TimetablePeriodRecord[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [weekday, setWeekday] = useState<Weekday>(
    existingLesson?.weekday ?? defaultSlot?.weekday ?? "MONDAY",
  );
  const [classId, setClassId] = useState<string>(existingLesson?.classId ?? classes[0]?.id ?? "");
  const [streamId, setStreamId] = useState<string>(existingLesson?.streamId ?? "");
  const [classSubjectAssignmentId, setClassSubjectAssignmentId] = useState<string>(
    existingLesson?.classSubjectAssignmentId ?? "",
  );
  const [staffId, setStaffId] = useState<string>(
    existingLesson?.staffId ?? staffList[0]?.id ?? "",
  );
  const [roomId, setRoomId] = useState<string>(existingLesson?.roomId ?? "");
  const [startPeriodId, setStartPeriodId] = useState<string>(
    existingLesson?.startPeriodId ?? defaultSlot?.periodId ?? periods[0]?.id ?? "",
  );
  const [endPeriodId, setEndPeriodId] = useState<string>(
    existingLesson?.endPeriodId ?? defaultSlot?.periodId ?? periods[0]?.id ?? "",
  );

  const weekdayId = useId();
  const classInputId = useId();
  const streamInputId = useId();
  const subjectInputId = useId();
  const teacherInputId = useId();
  const roomInputId = useId();
  const startPeriodInputId = useId();
  const endPeriodInputId = useId();

  // Streams for selected class
  const classStreams = streams.filter((s) => s.classId === classId);

  // Subject assignments for selected class
  const availableAssignments = classSubjects.filter((cs) => cs.classId === classId);
  const activeAssignmentId = classSubjectAssignmentId || availableAssignments[0]?.id || "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        classId,
        streamId: streamId || undefined,
        classSubjectAssignmentId: activeAssignmentId,
        staffId,
        roomId: roomId || undefined,
        weekday,
        startPeriodId,
        endPeriodId,
      };

      if (existingLesson) {
        return apiRequest(
          `/schools/${schoolId}/timetables/${timetableId}/lessons/${existingLesson.id}`,
          {
            method: "PATCH",
            body: payload,
          },
        );
      } else {
        return apiRequest(`/schools/${schoolId}/timetables/${timetableId}/lessons`, {
          method: "POST",
          body: payload,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onClose();
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existingLesson ? "Edit Scheduled Lesson" : "Schedule New Lesson"}</DialogTitle>
          <DialogDescription>
            Assign a subject offering, eligible teacher, class stream, and room to weekly timetable
            periods.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          {saveMutation.isError && (
            <RequestError error={saveMutation.error} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={weekdayId}>
              <span className="text-xs font-medium text-muted-foreground">Day of Week</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={weekdayId}
                onChange={(e) => setWeekday(e.target.value as Weekday)}
                value={weekday}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm" htmlFor={classInputId}>
              <span className="text-xs font-medium text-muted-foreground">Class</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={classInputId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStreamId("");
                  setClassSubjectAssignmentId("");
                }}
                value={classId}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={streamInputId}>
              <span className="text-xs font-medium text-muted-foreground">Stream (Optional)</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={streamInputId}
                onChange={(e) => setStreamId(e.target.value)}
                value={streamId}
              >
                <option value="">All streams / Whole class</option>
                {classStreams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm" htmlFor={subjectInputId}>
              <span className="text-xs font-medium text-muted-foreground">Subject Offering</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={subjectInputId}
                onChange={(e) => setClassSubjectAssignmentId(e.target.value)}
                required
                value={activeAssignmentId}
              >
                {availableAssignments.length === 0 ? (
                  <option value="">No subjects assigned to class</option>
                ) : (
                  availableAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {classSubjectMap.get(a.id)?.subjectName ?? "Subject"}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={teacherInputId}>
              <span className="text-xs font-medium text-muted-foreground">Assigned Teacher</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={teacherInputId}
                onChange={(e) => setStaffId(e.target.value)}
                required
                value={staffId}
              >
                {staffList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.givenName} {st.familyName}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm" htmlFor={roomInputId}>
              <span className="text-xs font-medium text-muted-foreground">Room (Optional)</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={roomInputId}
                onChange={(e) => setRoomId(e.target.value)}
                value={roomId}
              >
                <option value="">No specific room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (Cap: {r.capacity})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={startPeriodInputId}>
              <span className="text-xs font-medium text-muted-foreground">Start Period</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={startPeriodInputId}
                onChange={(e) => {
                  setStartPeriodId(e.target.value);
                  if (endPeriodId < e.target.value) setEndPeriodId(e.target.value);
                }}
                value={startPeriodId}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.startsAt} – {p.endsAt})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm" htmlFor={endPeriodInputId}>
              <span className="text-xs font-medium text-muted-foreground">End Period</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={endPeriodInputId}
                onChange={(e) => setEndPeriodId(e.target.value)}
                value={endPeriodId}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.startsAt} – {p.endsAt})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <DialogFooter className="pt-2">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saveMutation.isPending || !activeAssignmentId || !staffId}
              type="submit"
            >
              {saveMutation.isPending ? "Saving..." : existingLesson ? "Update Lesson" : "Save Lesson"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPeriodDialog({
  schoolId,
  existingCount,
  onClose,
}: {
  schoolId: string;
  existingCount: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(`Period ${existingCount + 1}`);
  const [position, setPosition] = useState<number>(existingCount + 1);
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("08:45");

  const nameId = useId();
  const positionId = useId();
  const startId = useId();
  const endId = useId();

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/schools/${schoolId}/timetable-periods`, {
        method: "POST",
        body: {
          name: name.trim(),
          position,
          startsAt,
          endsAt,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onClose();
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add School Period</DialogTitle>
          <DialogDescription>
            Configure a recurring lesson time slot in the daily school schedule.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
        >
          {addMutation.isError && (
            <RequestError error={addMutation.error} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={nameId}>
              <span className="text-xs font-medium text-muted-foreground">Period Name</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={nameId}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Period 1"
                required
                value={name}
              />
            </label>

            <label className="space-y-1 text-sm" htmlFor={positionId}>
              <span className="text-xs font-medium text-muted-foreground">Order Position</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={positionId}
                min={1}
                onChange={(e) => setPosition(Number(e.target.value))}
                required
                type="number"
                value={position}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={startId}>
              <span className="text-xs font-medium text-muted-foreground">Starts At (24h)</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={startId}
                onChange={(e) => setStartsAt(e.target.value)}
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                placeholder="08:00"
                required
                type="text"
                value={startsAt}
              />
            </label>

            <label className="space-y-1 text-sm" htmlFor={endId}>
              <span className="text-xs font-medium text-muted-foreground">Ends At (24h)</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={endId}
                onChange={(e) => setEndsAt(e.target.value)}
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                placeholder="08:45"
                required
                type="text"
                value={endsAt}
              />
            </label>
          </div>

          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={addMutation.isPending || !name.trim()} type="submit">
              {addMutation.isPending ? "Adding..." : "Add Period"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddRoomDialog({ schoolId, onClose }: { schoolId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(35);

  const nameId = useId();
  const capacityId = useId();

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/schools/${schoolId}/rooms`, {
        method: "POST",
        body: {
          name: name.trim(),
          capacity,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onClose();
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add School Room or Facility</DialogTitle>
          <DialogDescription>
            Register classrooms, science labs, or event spaces for lesson allocation.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
        >
          {addMutation.isError && (
            <RequestError error={addMutation.error} />
          )}

          <label className="block space-y-1 text-sm" htmlFor={nameId}>
            <span className="text-xs font-medium text-muted-foreground">Room Name</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={nameId}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Science Lab 1, Room 102"
              required
              value={name}
            />
          </label>

          <label className="block space-y-1 text-sm" htmlFor={capacityId}>
            <span className="text-xs font-medium text-muted-foreground">Student Capacity</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={capacityId}
              min={1}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
              type="number"
              value={capacity}
            />
          </label>

          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={addMutation.isPending || !name.trim()} type="submit">
              {addMutation.isPending ? "Adding..." : "Add Room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddAvailabilityDialog({
  schoolId,
  staffId,
  onClose,
}: {
  schoolId: string;
  staffId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [weekday, setWeekday] = useState<Weekday>("MONDAY");
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("16:00");

  const weekdayId = useId();
  const startId = useId();
  const endId = useId();

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/schools/${schoolId}/staff/${staffId}/availability`, {
        method: "POST",
        body: {
          weekday,
          startsAt,
          endsAt,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onClose();
    },
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Availability Window</DialogTitle>
          <DialogDescription>
            Restrict scheduling for this teacher to fall within these hours.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
        >
          {addMutation.isError && (
            <RequestError error={addMutation.error} />
          )}

          <label className="block space-y-1 text-sm" htmlFor={weekdayId}>
            <span className="text-xs font-medium text-muted-foreground">Day of Week</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={weekdayId}
              onChange={(e) => setWeekday(e.target.value as Weekday)}
              value={weekday}
            >
              {WEEKDAYS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm" htmlFor={startId}>
              <span className="text-xs font-medium text-muted-foreground">Starts At (24h)</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={startId}
                onChange={(e) => setStartsAt(e.target.value)}
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                placeholder="08:00"
                required
                type="text"
                value={startsAt}
              />
            </label>

            <label className="space-y-1 text-sm" htmlFor={endId}>
              <span className="text-xs font-medium text-muted-foreground">Ends At (24h)</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={endId}
                onChange={(e) => setEndsAt(e.target.value)}
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                placeholder="16:00"
                required
                type="text"
                value={endsAt}
              />
            </label>
          </div>

          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={addMutation.isPending} type="submit">
              {addMutation.isPending ? "Saving..." : "Add Window"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
