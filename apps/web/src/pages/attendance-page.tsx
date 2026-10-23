import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Edit2,
  FileText,
  Lock,
  PieChart,
  Plus,
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
// Types & Helpers
// -----------------------------------------------------------------------------

export type AttendanceType = "STUDENT_DAILY" | "STUDENT_LESSON" | "STAFF_DAILY";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EARLY_DEPARTURE";
export type RegisterStatus = "OPEN" | "FINALIZED";

export type AttendanceRegisterRecord = {
  id: string;
  academicYearId: string;
  date: string; // YYYY-MM-DD
  type: AttendanceType;
  classId: string | null;
  streamId: string | null;
  timetableLessonId: string | null;
  status: RegisterStatus;
  createdAt: string;
};

export type AttendanceRecordData = {
  id: string;
  registerId: string;
  studentId: string | null;
  staffId: string | null;
  status: AttendanceStatus;
  reasonId: string | null;
  arrivalAt: string | null; // HH:mm
  departureAt: string | null; // HH:mm
  markedAt: string;
  updatedAt: string;
};

export type AbsenceReasonRecord = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSummaryRow = {
  date: string;
  status: AttendanceStatus;
  total: number;
};

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

export type StudentRecord = {
  id: string;
  admissionNumber: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  status: "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "WITHDRAWN";
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

export type TimetableLessonRecord = {
  id: string;
  timetableId: string;
  academicYearId: string;
  classId: string;
  streamId: string | null;
  classSubjectAssignmentId: string;
  staffId: string;
  roomId: string | null;
  weekday: string;
  startPeriodId: string;
  endPeriodId: string;
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

export type TimetablePeriodRecord = {
  id: string;
  name: string;
  position: number;
  startsAt: string;
  endsAt: string;
};

function formatIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const statusColors: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  ABSENT: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  LATE: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  EARLY_DEPARTURE: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
};

// -----------------------------------------------------------------------------
// Component: AttendancePage
// -----------------------------------------------------------------------------

export function AttendancePage() {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"registers" | "lesson-attendance" | "reasons" | "analytics">("registers");

  // Filter states for registers
  const [filterDate, setFilterDate] = useState(() => formatIsoDate());
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterClassId, setFilterClassId] = useState<string>("ALL");

  // Selected register for marking
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);

  // Dialog states
  const [isCreateRegisterOpen, setIsCreateRegisterOpen] = useState(false);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [markingTarget, setMarkingTarget] = useState<{
    studentId?: string;
    staffId?: string;
    name: string;
    code: string;
    existingRecord?: AttendanceRecordData | null;
  } | null>(null);

  const [isAddReasonOpen, setIsAddReasonOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Queries
  // ---------------------------------------------------------------------------

  // Academic Years
  const yearsQuery = useSchoolList<AcademicYearRecord>("/academic-years", {
    limit: 100,
    status: "ACTIVE",
  });
  const years = yearsQuery.data?.data ?? [];
  const currentYear = years[0];

  // Classes
  const classesQuery = useSchoolList<AcademicClassRecord>("/classes", {
    limit: 100,
    academicYearId: currentYear?.id,
    status: "ACTIVE",
  });
  const classes = classesQuery.data?.data ?? [];

  // Streams
  const streamsQuery = useSchoolList<ClassStreamRecord>("/streams", {
    limit: 100,
    status: "ACTIVE",
  });
  const streams = streamsQuery.data?.data ?? [];

  // Active Students
  const studentsQuery = useSchoolList<StudentRecord>("/students", {
    limit: 100,
    status: "ACTIVE",
    sortBy: "admissionNumber",
  });
  const students = studentsQuery.data?.data ?? [];

  // Active Staff
  const staffQuery = useSchoolList<StaffMemberRecord>("/staff", {
    limit: 100,
    status: "ACTIVE",
    sortBy: "givenName",
  });
  const staffList = staffQuery.data?.data ?? [];

  // Absence Reasons
  const reasonsQuery = useSchoolData<{ data: AbsenceReasonRecord[] }>("/attendance/reasons");
  const reasons = (reasonsQuery.data?.data ?? []).filter((r) => r.status === "ACTIVE");

  // Registers Query
  const registersQuery = useSchoolList<AttendanceRegisterRecord>("/attendance/registers", {
    from: filterDate || undefined,
    to: filterDate || undefined,
    type: filterType === "ALL" ? undefined : filterType,
    classId: filterClassId === "ALL" ? undefined : filterClassId,
    limit: 100,
    offset: 0,
  });
  const registers = registersQuery.data?.data ?? [];

  // Currently selected register
  const activeRegister =
    registers.find((r) => r.id === selectedRegisterId) || registers[0] || null;
  const currentRegisterId = activeRegister?.id ?? null;

  // Records for active register
  const recordsQuery = useSchoolData<{ data: AttendanceRecordData[] }>(
    `/attendance/registers/${encodeURIComponent(currentRegisterId ?? "")}/records`,
    {},
    { enabled: Boolean(currentRegisterId) },
  );
  const records = recordsQuery.data?.data ?? [];

  // Timetable Periods (for lesson lookup)
  const periodsQuery = useSchoolData<{ data: TimetablePeriodRecord[] }>("/timetable-periods");
  const periods = periodsQuery.data?.data ?? [];

  // Subjects & Class-Subjects (for lesson labels)
  const subjectsQuery = useSchoolList<SubjectRecord>("/subjects", { limit: 100, status: "ACTIVE" });
  const subjects = subjectsQuery.data?.data ?? [];
  const classSubjectsQuery = useSchoolList<ClassSubjectRecord>("/class-subjects", {
    limit: 200,
    status: "ACTIVE",
  });
  const classSubjects = classSubjectsQuery.data?.data ?? [];

  // ---------------------------------------------------------------------------
  // Lookup Maps
  // ---------------------------------------------------------------------------

  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const streamMap = new Map(streams.map((s) => [s.id, s.name]));
  const staffMap = new Map(
    staffList.map((st) => [
      st.id,
      `${st.givenName} ${st.familyName} (${st.positionTitle || st.staffNumber})`,
    ]),
  );
  const reasonMap = new Map(reasons.map((r) => [r.id, r.name]));
  const periodMap = new Map(periods.map((p) => [p.id, p]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const classSubjectMap = new Map(
    classSubjects.map((cs) => [cs.id, subjectMap.get(cs.subjectId) ?? "Subject"]),
  );

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  // Finalize Register
  const finalizeMutation = useMutation({
    mutationFn: async (registerId: string) => {
      return apiRequest(`/schools/${school?.id}/attendance/registers/${registerId}/finalize`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", school?.id] });
    },
  });

  // Mark / Record Attendance (or correct)
  const markAttendanceMutation = useMutation({
    mutationFn: async (input: {
      registerId: string;
      recordId?: string;
      studentId?: string;
      staffId?: string;
      status: AttendanceStatus;
      reasonId?: string | null;
      arrivalAt?: string | null;
      departureAt?: string | null;
    }) => {
      const payload: Record<string, unknown> = {
        status: input.status,
        reasonId: input.reasonId || null,
      };

      if (input.status === "LATE") {
        payload.arrivalAt = input.arrivalAt;
      }
      if (input.status === "EARLY_DEPARTURE") {
        payload.departureAt = input.departureAt;
      }

      if (input.recordId) {
        // Correct existing record
        return apiRequest(
          `/schools/${school?.id}/attendance/registers/${input.registerId}/records/${input.recordId}`,
          {
            method: "PATCH",
            body: payload,
          },
        );
      } else {
        // Create new record
        return apiRequest(`/schools/${school?.id}/attendance/registers/${input.registerId}/records`, {
          method: "POST",
          body: {
            ...payload,
            studentId: input.studentId,
            staffId: input.staffId,
          },
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", school?.id] });
      setIsMarkModalOpen(false);
      setMarkingTarget(null);
    },
  });

  // Bulk Mark All Remaining Present
  const bulkPresentMutation = useMutation({
    mutationFn: async ({
      registerId,
      attendees,
    }: {
      registerId: string;
      attendees: Array<{ studentId?: string; staffId?: string }>;
    }) => {
      for (const attendee of attendees) {
        await apiRequest(`/schools/${school?.id}/attendance/registers/${registerId}/records`, {
          method: "POST",
          body: {
            studentId: attendee.studentId,
            staffId: attendee.staffId,
            status: "PRESENT",
          },
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", school?.id] });
    },
  });

  // ---------------------------------------------------------------------------
  // Derived Roster for Active Register
  // ---------------------------------------------------------------------------

  const recordMapByStudentId = new Map<string, AttendanceRecordData>();
  const recordMapByStaffId = new Map<string, AttendanceRecordData>();

  for (const rec of records) {
    if (rec.studentId) recordMapByStudentId.set(rec.studentId, rec);
    if (rec.staffId) recordMapByStaffId.set(rec.staffId, rec);
  }

  // Calculate statistics
  const countPresent = records.filter((r) => r.status === "PRESENT").length;
  const countAbsent = records.filter((r) => r.status === "ABSENT").length;
  const countLate = records.filter((r) => r.status === "LATE").length;
  const countEarly = records.filter((r) => r.status === "EARLY_DEPARTURE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Daily Operations</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Attendance Registers</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Take morning student daily roll calls, subject lesson attendance, staff presence, and
            absence reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "registers" && (
            <Button onClick={() => setIsCreateRegisterOpen(true)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> New Attendance Register
            </Button>
          )}
          {activeTab === "reasons" && (
            <Button onClick={() => setIsAddReasonOpen(true)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> Add Absence Reason
            </Button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-medium">
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "registers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("registers")}
          type="button"
        >
          <UserCheck className="h-4 w-4" />
          Daily Registers & Marking
        </button>
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "lesson-attendance"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("lesson-attendance")}
          type="button"
        >
          <Clock className="h-4 w-4" />
          Timetable Lesson Attendance
        </button>
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "reasons"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("reasons")}
          type="button"
        >
          <FileText className="h-4 w-4" />
          Absence Reasons
        </button>
        <button
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "analytics"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("analytics")}
          type="button"
        >
          <PieChart className="h-4 w-4" />
          Summary & Analytics
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: REGISTERS & MARKING MATRIX                                     */}
      {/* ===================================================================== */}
      {activeTab === "registers" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <Card className="shadow-none">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Register Date</span>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => setFilterDate(e.target.value)}
                    type="date"
                    value={filterDate}
                  />
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Register Scope</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => setFilterType(e.target.value)}
                    value={filterType}
                  >
                    <option value="ALL">All Types</option>
                    <option value="STUDENT_DAILY">Student Daily Roll Call</option>
                    <option value="STUDENT_LESSON">Student Lesson Attendance</option>
                    <option value="STAFF_DAILY">Staff Daily Attendance</option>
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Class Filter</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => setFilterClassId(e.target.value)}
                    value={filterClassId}
                  >
                    <option value="ALL">All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={() => setIsCreateRegisterOpen(true)}
                    size="default"
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Create Register
                  </Button>
                </div>
              </div>

              {/* Register Chips / Selector */}
              {registers.length > 0 && (
                <div className="border-t pt-3">
                  <span className="mb-2 block text-xs font-medium text-muted-foreground">
                    Available Registers ({registers.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {registers.map((reg) => {
                      const isSelected = activeRegister?.id === reg.id;
                      const label =
                        reg.type === "STAFF_DAILY"
                          ? "Staff Daily"
                          : reg.type === "STUDENT_LESSON"
                            ? `Lesson: ${classMap.get(reg.classId ?? "") ?? "Class"}`
                            : `Class: ${classMap.get(reg.classId ?? "") ?? "Class"}${reg.streamId ? ` (${streamMap.get(reg.streamId)})` : ""}`;

                      return (
                        <button
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary shadow-xs"
                              : "border-border bg-card text-muted-foreground hover:bg-muted"
                          }`}
                          key={reg.id}
                          onClick={() => setSelectedRegisterId(reg.id)}
                          type="button"
                        >
                          <span>{label}</span>
                          <Badge
                            className="text-[10px]"
                            variant={reg.status === "FINALIZED" ? "default" : "secondary"}
                          >
                            {reg.status.toLowerCase()}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Register Workspace */}
          {registersQuery.isPending ? (
            <RequestLoading />
          ) : !activeRegister ? (
            <Card className="shadow-none">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Calendar className="mb-2 h-10 w-10 text-muted-foreground/60" />
                <p className="text-base font-medium text-foreground">No Attendance Registers Found</p>
                <p className="mt-1 text-sm">
                  There are no attendance registers for this date and filter. Create one to begin
                  marking attendance.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setIsCreateRegisterOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Create Register
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Register Header & Stats Card */}
              <Card className="shadow-none">
                <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-semibold">
                        {activeRegister.type === "STAFF_DAILY"
                          ? "Staff Daily Roll Call"
                          : activeRegister.type === "STUDENT_LESSON"
                            ? `Lesson Attendance — ${classMap.get(activeRegister.classId ?? "") ?? "Class"}`
                            : `Class Roll Call — ${classMap.get(activeRegister.classId ?? "") ?? "Class"}${activeRegister.streamId ? ` (${streamMap.get(activeRegister.streamId)})` : ""}`}
                      </CardTitle>
                      <Badge
                        variant={activeRegister.status === "FINALIZED" ? "default" : "secondary"}
                      >
                        {activeRegister.status === "FINALIZED" ? (
                          <span className="flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Finalized
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Edit2 className="h-3 w-3" /> Open (Marking in progress)
                          </span>
                        )}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Date: {activeRegister.date} • Created:{" "}
                      {new Date(activeRegister.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeRegister.status === "OPEN" ? (
                      <>
                        <Button
                          disabled={bulkPresentMutation.isPending}
                          onClick={() => {
                            if (activeRegister.type === "STAFF_DAILY") {
                              const unmarked = staffList.filter(
                                (st) => !recordMapByStaffId.has(st.id),
                              );
                              if (unmarked.length === 0) {
                                alert("All staff are already marked.");
                                return;
                              }
                              if (
                                confirm(
                                  `Mark ${unmarked.length} remaining staff members as Present?`,
                                )
                              ) {
                                bulkPresentMutation.mutate({
                                  registerId: activeRegister.id,
                                  attendees: unmarked.map((st) => ({ staffId: st.id })),
                                });
                              }
                            } else {
                              const unmarked = students.filter(
                                (s) => !recordMapByStudentId.has(s.id),
                              );
                              if (unmarked.length === 0) {
                                alert("All students are already marked.");
                                return;
                              }
                              if (
                                confirm(
                                  `Mark ${unmarked.length} remaining students as Present?`,
                                )
                              ) {
                                bulkPresentMutation.mutate({
                                  registerId: activeRegister.id,
                                  attendees: unmarked.map((s) => ({ studentId: s.id })),
                                });
                              }
                            }
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Mark All Present
                        </Button>
                        <Button
                          disabled={finalizeMutation.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                "Finalize this register? Once finalized, new attendees cannot be added and changes require correction audit revisions.",
                              )
                            ) {
                              finalizeMutation.mutate(activeRegister.id);
                            }
                          }}
                          size="sm"
                        >
                          <Lock className="mr-1.5 h-4 w-4" /> Finalize Register
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Register locked. Authorized corrections generate audit logs.
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-5 text-xs">
                    <div className="rounded-md bg-muted/40 p-2.5 text-center">
                      <span className="block text-muted-foreground">Total Marked</span>
                      <span className="text-base font-semibold">{records.length}</span>
                    </div>
                    <div className="rounded-md bg-emerald-500/10 p-2.5 text-center text-emerald-800 dark:text-emerald-300">
                      <span className="block text-xs font-medium">Present</span>
                      <span className="text-base font-semibold">{countPresent}</span>
                    </div>
                    <div className="rounded-md bg-rose-500/10 p-2.5 text-center text-rose-800 dark:text-rose-300">
                      <span className="block text-xs font-medium">Absent</span>
                      <span className="text-base font-semibold">{countAbsent}</span>
                    </div>
                    <div className="rounded-md bg-amber-500/10 p-2.5 text-center text-amber-800 dark:text-amber-300">
                      <span className="block text-xs font-medium">Late</span>
                      <span className="text-base font-semibold">{countLate}</span>
                    </div>
                    <div className="rounded-md bg-sky-500/10 p-2.5 text-center text-sky-800 dark:text-sky-300">
                      <span className="block text-xs font-medium">Early Dep.</span>
                      <span className="text-base font-semibold">{countEarly}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Roster Marking Table */}
              <Card className="overflow-hidden shadow-none">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Attendance Roster</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Click status buttons to record Present, Absent, Late arrival, or Early departure.
                    </p>
                  </div>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Attendee Name</th>
                        <th className="px-4 py-3">Identifier</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Details / Timings</th>
                        <th className="px-4 py-3 text-right">Quick Marking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activeRegister.type === "STAFF_DAILY" ? (
                        staffList.map((st) => {
                          const record = recordMapByStaffId.get(st.id);
                          const isFinalized = activeRegister.status === "FINALIZED";

                          return (
                            <tr className="hover:bg-muted/15" key={st.id}>
                              <td className="px-4 py-2.5 font-medium text-foreground">
                                {st.givenName} {st.familyName}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {st.staffNumber} • {st.positionTitle || "Staff"}
                              </td>
                              <td className="px-4 py-2.5">
                                {record ? (
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                      statusColors[record.status]
                                    }`}
                                  >
                                    {record.status}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Not Marked</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {record?.status === "LATE" && `Arrival: ${record.arrivalAt}`}
                                {record?.status === "EARLY_DEPARTURE" &&
                                  `Departure: ${record.departureAt}`}
                                {record?.reasonId && `Reason: ${reasonMap.get(record.reasonId)}`}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  {!isFinalized ? (
                                    <>
                                      <button
                                        className={`h-7 w-7 rounded font-semibold text-xs transition-colors ${
                                          record?.status === "PRESENT"
                                            ? "bg-emerald-600 text-white"
                                            : "border border-border bg-card hover:bg-emerald-50 hover:text-emerald-700"
                                        }`}
                                        onClick={() => {
                                          markAttendanceMutation.mutate({
                                            registerId: activeRegister.id,
                                            staffId: st.id,
                                            status: "PRESENT",
                                          });
                                        }}
                                        title="Mark Present"
                                        type="button"
                                      >
                                        P
                                      </button>
                                      <button
                                        className={`h-7 w-7 rounded font-semibold text-xs transition-colors ${
                                          record?.status === "ABSENT"
                                            ? "bg-rose-600 text-white"
                                            : "border border-border bg-card hover:bg-rose-50 hover:text-rose-700"
                                        }`}
                                        onClick={() => {
                                          setMarkingTarget({
                                            staffId: st.id,
                                            name: `${st.givenName} ${st.familyName}`,
                                            code: st.staffNumber,
                                            existingRecord: record,
                                          });
                                          setIsMarkModalOpen(true);
                                        }}
                                        title="Mark Absent"
                                        type="button"
                                      >
                                        A
                                      </button>
                                      <button
                                        className={`h-7 w-7 rounded font-semibold text-xs transition-colors ${
                                          record?.status === "LATE"
                                            ? "bg-amber-600 text-white"
                                            : "border border-border bg-card hover:bg-amber-50 hover:text-amber-700"
                                        }`}
                                        onClick={() => {
                                          setMarkingTarget({
                                            staffId: st.id,
                                            name: `${st.givenName} ${st.familyName}`,
                                            code: st.staffNumber,
                                            existingRecord: record,
                                          });
                                          setIsMarkModalOpen(true);
                                        }}
                                        title="Mark Late"
                                        type="button"
                                      >
                                        L
                                      </button>
                                    </>
                                  ) : (
                                    <Button
                                      onClick={() => {
                                        setMarkingTarget({
                                          staffId: st.id,
                                          name: `${st.givenName} ${st.familyName}`,
                                          code: st.staffNumber,
                                          existingRecord: record,
                                        });
                                        setIsMarkModalOpen(true);
                                      }}
                                      size="sm"
                                      variant="ghost"
                                    >
                                      <Edit2 className="mr-1 h-3 w-3" /> Correct
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        students.map((st) => {
                          const record = recordMapByStudentId.get(st.id);
                          const isFinalized = activeRegister.status === "FINALIZED";

                          return (
                            <tr className="hover:bg-muted/15" key={st.id}>
                              <td className="px-4 py-2.5 font-medium text-foreground">
                                {st.givenName} {st.familyName}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {st.admissionNumber}
                              </td>
                              <td className="px-4 py-2.5">
                                {record ? (
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                      statusColors[record.status]
                                    }`}
                                  >
                                    {record.status}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Not Marked</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                {record?.status === "LATE" && `Arrival: ${record.arrivalAt}`}
                                {record?.status === "EARLY_DEPARTURE" &&
                                  `Departure: ${record.departureAt}`}
                                {record?.reasonId && `Reason: ${reasonMap.get(record.reasonId)}`}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  {!isFinalized ? (
                                    <>
                                      <button
                                        className={`h-7 w-7 rounded font-semibold text-xs transition-colors ${
                                          record?.status === "PRESENT"
                                            ? "bg-emerald-600 text-white"
                                            : "border border-border bg-card hover:bg-emerald-50 hover:text-emerald-700"
                                        }`}
                                        onClick={() => {
                                          markAttendanceMutation.mutate({
                                            registerId: activeRegister.id,
                                            studentId: st.id,
                                            status: "PRESENT",
                                          });
                                        }}
                                        title="Mark Present"
                                        type="button"
                                      >
                                        P
                                      </button>
                                      <button
                                        className={`h-7 w-7 rounded font-semibold text-xs transition-colors ${
                                          record?.status === "ABSENT"
                                            ? "bg-rose-600 text-white"
                                            : "border border-border bg-card hover:bg-rose-50 hover:text-rose-700"
                                        }`}
                                        onClick={() => {
                                          setMarkingTarget({
                                            studentId: st.id,
                                            name: `${st.givenName} ${st.familyName}`,
                                            code: st.admissionNumber,
                                            existingRecord: record,
                                          });
                                          setIsMarkModalOpen(true);
                                        }}
                                        title="Mark Absent"
                                        type="button"
                                      >
                                        A
                                      </button>
                                      <button
                                        className={`h-7 w-7 rounded font-semibold text-xs transition-colors ${
                                          record?.status === "LATE"
                                            ? "bg-amber-600 text-white"
                                            : "border border-border bg-card hover:bg-amber-50 hover:text-amber-700"
                                        }`}
                                        onClick={() => {
                                          setMarkingTarget({
                                            studentId: st.id,
                                            name: `${st.givenName} ${st.familyName}`,
                                            code: st.admissionNumber,
                                            existingRecord: record,
                                          });
                                          setIsMarkModalOpen(true);
                                        }}
                                        title="Mark Late"
                                        type="button"
                                      >
                                        L
                                      </button>
                                    </>
                                  ) : (
                                    <Button
                                      onClick={() => {
                                        setMarkingTarget({
                                          studentId: st.id,
                                          name: `${st.givenName} ${st.familyName}`,
                                          code: st.admissionNumber,
                                          existingRecord: record,
                                        });
                                        setIsMarkModalOpen(true);
                                      }}
                                      size="sm"
                                      variant="ghost"
                                    >
                                      <Edit2 className="mr-1 h-3 w-3" /> Correct
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: TIMETABLE LESSON ATTENDANCE                                    */}
      {/* ===================================================================== */}
      {activeTab === "lesson-attendance" && (
        <LessonAttendanceWorkspace
          classMap={classMap}
          classSubjectMap={classSubjectMap}
          currentYearId={currentYear?.id ?? ""}
          onSelectRegister={(regId) => {
            setSelectedRegisterId(regId);
            setActiveTab("registers");
          }}
          periodMap={periodMap}
          schoolId={school?.id ?? ""}
          staffMap={staffMap}
          streamMap={streamMap}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ABSENCE REASONS MANAGEMENT                                     */}
      {/* ===================================================================== */}
      {activeTab === "reasons" && (
        <AbsenceReasonsWorkspace
          onAdd={() => setIsAddReasonOpen(true)}
          reasons={reasons}
          schoolId={school?.id ?? ""}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 4: SUMMARY & ANALYTICS                                            */}
      {/* ===================================================================== */}
      {activeTab === "analytics" && (
        <AttendanceAnalyticsWorkspace
          classes={classes}
          defaultDate={filterDate}
        />
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREATE ATTENDANCE REGISTER                                     */}
      {/* ===================================================================== */}
      {isCreateRegisterOpen && currentYear && (
        <CreateRegisterDialog
          academicYearId={currentYear.id}
          classes={classes}
          onClose={() => setIsCreateRegisterOpen(false)}
          onSuccess={(regId) => {
            setSelectedRegisterId(regId);
            setIsCreateRegisterOpen(false);
          }}
          schoolId={school?.id ?? ""}
          streams={streams}
        />
      )}

      {/* ===================================================================== */}
      {/* MODAL: MARK ATTENDANCE MODAL (LATE / ABSENT / EARLY / CORRECTION)     */}
      {/* ===================================================================== */}
      {isMarkModalOpen && markingTarget && activeRegister && (
        <MarkAttendanceDialog
          attendee={markingTarget}
          onClose={() => {
            setIsMarkModalOpen(false);
            setMarkingTarget(null);
          }}
          onSave={(data) => {
            markAttendanceMutation.mutate({
              registerId: activeRegister.id,
              recordId: markingTarget.existingRecord?.id,
              studentId: markingTarget.studentId,
              staffId: markingTarget.staffId,
              ...data,
            });
          }}
          reasons={reasons}
        />
      )}

      {/* ===================================================================== */}
      {/* MODAL: ADD ABSENCE REASON                                             */}
      {/* ===================================================================== */}
      {isAddReasonOpen && (
        <AddReasonDialog onClose={() => setIsAddReasonOpen(false)} schoolId={school?.id ?? ""} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-Components & Dialogs
// -----------------------------------------------------------------------------

function CreateRegisterDialog({
  schoolId,
  academicYearId,
  classes,
  streams,
  onClose,
  onSuccess,
}: {
  schoolId: string;
  academicYearId: string;
  classes: AcademicClassRecord[];
  streams: ClassStreamRecord[];
  onClose: () => void;
  onSuccess: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => formatIsoDate());
  const [type, setType] = useState<AttendanceType>("STUDENT_DAILY");
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "");
  const [streamId, setStreamId] = useState<string>("");

  const dateId = useId();
  const typeId = useId();
  const classInputId = useId();
  const streamInputId = useId();

  const classStreams = streams.filter((s) => s.classId === classId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        academicYearId,
        date,
        type,
      };

      if (type !== "STAFF_DAILY") {
        payload.classId = classId;
        if (streamId) payload.streamId = streamId;
      }

      return apiRequest<{ data: AttendanceRegisterRecord }>(
        `/schools/${schoolId}/attendance/registers`,
        {
          method: "POST",
          body: payload,
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
          <DialogTitle>Create Attendance Register</DialogTitle>
          <DialogDescription>
            Open a new attendance register for recording student or staff presence.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          {createMutation.isError && <RequestError error={createMutation.error} />}

          <label className="block space-y-1 text-sm" htmlFor={dateId}>
            <span className="text-xs font-medium text-muted-foreground">Register Date</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={dateId}
              onChange={(e) => setDate(e.target.value)}
              required
              type="date"
              value={date}
            />
          </label>

          <label className="block space-y-1 text-sm" htmlFor={typeId}>
            <span className="text-xs font-medium text-muted-foreground">Register Scope</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={typeId}
              onChange={(e) => setType(e.target.value as AttendanceType)}
              value={type}
            >
              <option value="STUDENT_DAILY">Student Daily Roll Call</option>
              <option value="STAFF_DAILY">Staff Daily Register</option>
            </select>
          </label>

          {type === "STUDENT_DAILY" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm" htmlFor={classInputId}>
                <span className="text-xs font-medium text-muted-foreground">Class</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id={classInputId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setStreamId("");
                  }}
                  required
                  value={classId}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm" htmlFor={streamInputId}>
                <span className="text-xs font-medium text-muted-foreground">Stream (Optional)</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id={streamInputId}
                  onChange={(e) => setStreamId(e.target.value)}
                  value={streamId}
                >
                  <option value="">Whole Class</option>
                  {classStreams.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarkAttendanceDialog({
  attendee,
  reasons,
  onClose,
  onSave,
}: {
  attendee: {
    studentId?: string;
    staffId?: string;
    name: string;
    code: string;
    existingRecord?: AttendanceRecordData | null;
  };
  reasons: AbsenceReasonRecord[];
  onClose: () => void;
  onSave: (data: {
    status: AttendanceStatus;
    reasonId?: string | null;
    arrivalAt?: string | null;
    departureAt?: string | null;
  }) => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(
    attendee.existingRecord?.status ?? "ABSENT",
  );
  const [reasonId, setReasonId] = useState<string>(attendee.existingRecord?.reasonId ?? "");
  const [arrivalAt, setArrivalAt] = useState<string>(attendee.existingRecord?.arrivalAt ?? "08:15");
  const [departureAt, setDepartureAt] = useState<string>(
    attendee.existingRecord?.departureAt ?? "14:00",
  );

  const statusId = useId();
  const reasonInputId = useId();
  const arrivalInputId = useId();
  const departureInputId = useId();

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Attendance Details</DialogTitle>
          <DialogDescription>
            {attendee.name} ({attendee.code})
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              status,
              reasonId: reasonId || null,
              arrivalAt: status === "LATE" ? arrivalAt : null,
              departureAt: status === "EARLY_DEPARTURE" ? departureAt : null,
            });
          }}
        >
          <label className="block space-y-1 text-sm" htmlFor={statusId}>
            <span className="text-xs font-medium text-muted-foreground">Attendance Status</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={statusId}
              onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
              value={status}
            >
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LATE">Late Arrival</option>
              <option value="EARLY_DEPARTURE">Early Departure</option>
            </select>
          </label>

          {status === "LATE" && (
            <label className="block space-y-1 text-sm" htmlFor={arrivalInputId}>
              <span className="text-xs font-medium text-muted-foreground">
                Arrival Time (HH:mm, 24-hour)
              </span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={arrivalInputId}
                onChange={(e) => setArrivalAt(e.target.value)}
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                placeholder="08:15"
                required
                type="text"
                value={arrivalAt}
              />
            </label>
          )}

          {status === "EARLY_DEPARTURE" && (
            <label className="block space-y-1 text-sm" htmlFor={departureInputId}>
              <span className="text-xs font-medium text-muted-foreground">
                Departure Time (HH:mm, 24-hour)
              </span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={departureInputId}
                onChange={(e) => setDepartureAt(e.target.value)}
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                placeholder="14:00"
                required
                type="text"
                value={departureAt}
              />
            </label>
          )}

          {(status === "ABSENT" || status === "LATE") && (
            <label className="block space-y-1 text-sm" htmlFor={reasonInputId}>
              <span className="text-xs font-medium text-muted-foreground">
                Absence Reason (Optional)
              </span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id={reasonInputId}
                onChange={(e) => setReasonId(e.target.value)}
                value={reasonId}
              >
                <option value="">-- No specific reason stated --</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">Save Attendance</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddReasonDialog({ schoolId, onClose }: { schoolId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const nameId = useId();

  const addMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/schools/${schoolId}/attendance/reasons`, {
        method: "POST",
        body: { name: name.trim() },
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
          <DialogTitle>Add Absence Reason</DialogTitle>
          <DialogDescription>
            Categorize student and staff absences (e.g. Medical, Authorized Leave).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
        >
          {addMutation.isError && <RequestError error={addMutation.error} />}

          <label className="block space-y-1 text-sm" htmlFor={nameId}>
            <span className="text-xs font-medium text-muted-foreground">Reason Name</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id={nameId}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Medical Illness, Authorized Sports Event"
              required
              value={name}
            />
          </label>

          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={addMutation.isPending || !name.trim()} type="submit">
              {addMutation.isPending ? "Adding..." : "Add Reason"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonAttendanceWorkspace({
  schoolId,
  currentYearId,
  classMap,
  streamMap,
  classSubjectMap,
  staffMap,
  periodMap,
  onSelectRegister,
}: {
  schoolId: string;
  currentYearId: string;
  classMap: Map<string, string>;
  streamMap: Map<string, string>;
  classSubjectMap: Map<string, string>;
  staffMap: Map<string, string>;
  periodMap: Map<string, TimetablePeriodRecord>;
  onSelectRegister: (registerId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => formatIsoDate());

  // Derive day of week for selected date
  const dayIndex = new Date(selectedDate).getDay();
  const dayNames = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  const currentWeekday = dayNames[dayIndex] ?? "MONDAY";

  // Timetables Query
  const timetablesQuery = useSchoolData<{
    data: Array<{ id: string; name: string; status: "DRAFT" | "PUBLISHED" }>;
  }>(`/academic-years/${encodeURIComponent(currentYearId)}/timetables`, {}, {
    enabled: Boolean(currentYearId),
  });
  const publishedTimetable = (timetablesQuery.data?.data ?? []).find(
    (t) => t.status === "PUBLISHED",
  );

  // Lessons Query
  const lessonsQuery = useSchoolData<{ data: TimetableLessonRecord[] }>(
    `/timetables/${encodeURIComponent(publishedTimetable?.id ?? "")}/lessons`,
    {},
    { enabled: Boolean(publishedTimetable?.id) },
  );
  const lessons = (lessonsQuery.data?.data ?? []).filter((l) => l.weekday === currentWeekday);

  // Take Lesson Attendance Mutation
  const takeAttendanceMutation = useMutation({
    mutationFn: async (lesson: TimetableLessonRecord) => {
      const res = await apiRequest<{ data: AttendanceRegisterRecord }>(
        `/schools/${schoolId}/attendance/registers`,
        {
          method: "POST",
          body: {
            academicYearId: currentYearId,
            date: selectedDate,
            type: "STUDENT_LESSON",
            classId: lesson.classId,
            streamId: lesson.streamId || undefined,
            timetableLessonId: lesson.id,
          },
        },
      );
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onSelectRegister(data.id);
    },
  });

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Today's Published Lessons ({currentWeekday})
              </h3>
              <p className="text-xs text-muted-foreground">
                Select a scheduled lesson to initiate or continue period-level student attendance.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Date:</span>
              <input
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                onChange={(e) => setSelectedDate(e.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>
          </div>

          {takeAttendanceMutation.isError && (
            <RequestError error={takeAttendanceMutation.error} />
          )}

          {!publishedTimetable ? (
            <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
              <p className="font-medium text-foreground">No Published Timetable</p>
              <p className="mt-1">
                You need an active published timetable to schedule lesson attendance registers.
              </p>
            </div>
          ) : lessonsQuery.isPending ? (
            <RequestLoading />
          ) : lessons.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
              No lessons are scheduled on {currentWeekday} in the published timetable.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lessons.map((lesson) => {
                const subject = classSubjectMap.get(lesson.classSubjectAssignmentId) ?? "Subject";
                const className = classMap.get(lesson.classId) ?? "Class";
                const streamName = lesson.streamId ? streamMap.get(lesson.streamId) : null;
                const teacher = staffMap.get(lesson.staffId) ?? "Teacher";
                const startP = periodMap.get(lesson.startPeriodId);
                const endP = periodMap.get(lesson.endPeriodId);

                return (
                  <div
                    className="flex flex-col justify-between rounded-lg border bg-card p-4 text-xs shadow-xs"
                    key={lesson.id}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground">{subject}</span>
                        <Badge variant="outline">
                          {startP?.name ?? "Period"} {startP?.startsAt} – {endP?.endsAt}
                        </Badge>
                      </div>

                      <div className="mt-2 text-muted-foreground space-y-0.5">
                        <div className="font-medium text-foreground">
                          {className} {streamName ? `(${streamName})` : ""}
                        </div>
                        <div>Instructor: {teacher.split(" (")[0]}</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t">
                      <Button
                        className="w-full"
                        disabled={takeAttendanceMutation.isPending}
                        onClick={() => takeAttendanceMutation.mutate(lesson)}
                        size="sm"
                      >
                        <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Take Attendance
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AbsenceReasonsWorkspace({
  schoolId,
  reasons,
  onAdd,
}: {
  schoolId: string;
  reasons: AbsenceReasonRecord[];
  onAdd: () => void;
}) {
  const queryClient = useQueryClient();

  const deactivateMutation = useMutation({
    mutationFn: async (reasonId: string) => {
      return apiRequest(`/schools/${schoolId}/attendance/reasons/${reasonId}/deactivate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
    },
  });

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Absence Reasons</CardTitle>
          <p className="text-xs text-muted-foreground">
            Active categories for documenting excused and unexcused absences.
          </p>
        </div>
        <Button onClick={onAdd} size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Reason
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reason Name</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Configured Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reasons.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-xs text-muted-foreground" colSpan={4}>
                    No active absence reasons configured yet. Add common reasons like Medical or
                    Authorized Leave.
                  </td>
                </tr>
              ) : (
                reasons.map((r) => (
                  <tr className="hover:bg-muted/20" key={r.id}>
                    <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{r.name}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <Badge variant="default">active</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      <Button
                        disabled={deactivateMutation.isPending}
                        onClick={() => {
                          if (confirm(`Deactivate absence reason "${r.name}"?`)) {
                            deactivateMutation.mutate(r.id);
                          }
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Deactivate
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AttendanceAnalyticsWorkspace({
  classes,
  defaultDate,
}: {
  classes: AcademicClassRecord[];
  defaultDate: string;
}) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return formatIsoDate(d);
  });
  const [toDate, setToDate] = useState(defaultDate);
  const [selectedType, setSelectedType] = useState<string>("STUDENT_DAILY");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const summaryQuery = useSchoolData<{ data: AttendanceSummaryRow[] }>(
    "/attendance/summary",
    {
      from: fromDate,
      to: toDate,
      type: selectedType || undefined,
      classId: selectedClassId || undefined,
    },
    { enabled: Boolean(fromDate && toDate && fromDate <= toDate) },
  );

  const summaryRows = summaryQuery.data?.data ?? [];

  // Aggregated totals
  let totalMarks = 0;
  let presentMarks = 0;
  let absentMarks = 0;
  let lateMarks = 0;
  let earlyMarks = 0;

  for (const row of summaryRows) {
    totalMarks += row.total;
    if (row.status === "PRESENT") presentMarks += row.total;
    if (row.status === "ABSENT") absentMarks += row.total;
    if (row.status === "LATE") lateMarks += row.total;
    if (row.status === "EARLY_DEPARTURE") earlyMarks += row.total;
  }

  const attendanceRate = totalMarks > 0 ? Math.round((presentMarks / totalMarks) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">From Date</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(e) => setFromDate(e.target.value)}
                type="date"
                value={fromDate}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">To Date</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(e) => setToDate(e.target.value)}
                type="date"
                value={toDate}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(e) => setSelectedType(e.target.value)}
                value={selectedType}
              >
                <option value="STUDENT_DAILY">Student Daily</option>
                <option value="STUDENT_LESSON">Student Lesson</option>
                <option value="STAFF_DAILY">Staff Daily</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Class Scope</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={selectedType === "STAFF_DAILY"}
                onChange={(e) => setSelectedClassId(e.target.value)}
                value={selectedClassId}
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <span className="text-xs font-medium text-muted-foreground">Overall Attendance Rate</span>
          <div className="mt-1 text-2xl font-bold text-primary">{attendanceRate}%</div>
          <span className="text-[11px] text-muted-foreground">{presentMarks} present of {totalMarks}</span>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <span className="text-xs font-medium text-muted-foreground">Total Absences</span>
          <div className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{absentMarks}</div>
          <span className="text-[11px] text-muted-foreground">Recorded absences</span>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <span className="text-xs font-medium text-muted-foreground">Late Arrivals</span>
          <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{lateMarks}</div>
          <span className="text-[11px] text-muted-foreground">Recorded late marks</span>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <span className="text-xs font-medium text-muted-foreground">Early Departures</span>
          <div className="mt-1 text-2xl font-bold text-sky-600 dark:text-sky-400">{earlyMarks}</div>
          <span className="text-[11px] text-muted-foreground">Excused / early departures</span>
        </div>
      </div>

      {/* Breakdown Table */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Aggregated Attendance Rows</CardTitle>
          <p className="text-xs text-muted-foreground">
            Summary counts grouped by date and status from the reporting API.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summaryQuery.isPending ? (
                  <tr>
                    <td colSpan={3}>
                      <RequestLoading />
                    </td>
                  </tr>
                ) : summaryRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-xs text-muted-foreground" colSpan={3}>
                      No attendance data recorded in the selected date range.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row, idx) => (
                    <tr className="hover:bg-muted/20" key={`${row.date}-${row.status}-${idx}`}>
                      <td className="px-4 py-2.5 text-xs font-medium text-foreground">{row.date}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            statusColors[row.status]
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground">
                        {row.total}
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
  );
}
