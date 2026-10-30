export type AttendanceType = "STUDENT_DAILY" | "STUDENT_LESSON" | "STAFF_DAILY";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EARLY_DEPARTURE";
export type AttendanceRegisterStatus = "OPEN" | "FINALIZED";
import type { AcademicRecordStatus } from "./contracts.js";
export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type OperationsContext = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};

export type OperationsPage<T> = { items: T[]; total: number };
export type OperationsPageQuery = { limit: number; offset: number };

export type AbsenceReasonRecord = {
  id: string;
  name: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AttendanceRegisterRecord = {
  id: string;
  academicYearId: string;
  classId: string | null;
  streamId: string | null;
  timetableLessonId: string | null;
  type: AttendanceType;
  date: Date;
  status: AttendanceRegisterStatus;
  createdAt: Date;
};

export type AttendanceRecordData = {
  id: string;
  registerId: string;
  studentId: string | null;
  staffId: string | null;
  status: AttendanceStatus;
  reasonId: string | null;
  arrivalAt: Date | null;
  departureAt: Date | null;
  markedAt: Date;
  updatedAt: Date;
};

export type AttendanceSummaryRow = {
  date: string;
  status: AttendanceStatus;
  total: number;
};

export type AttendanceClassSummaryRow = {
  classId: string;
  streamId: string | null;
  enrolledCount: number;
  finalizedSessions: number;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  earlyDepartureCount: number;
};

export type AttendanceTermSummaryRow = {
  termId: string;
  from: string;
  to: string;
  classId: string | null;
  streamId: string | null;
  enrolledCount: number;
  finalizedSessions: number;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  earlyDepartureCount: number;
};

export type AttendanceClassSummaryQuery = {
  academicYearId: string;
  from: string;
  to: string;
  classId?: string;
  streamId?: string;
  type?: AttendanceType;
};

export type AttendanceTermSummaryQuery = {
  academicYearId: string;
  termId: string;
  classId?: string;
  streamId?: string;
  type?: AttendanceType;
};

export type AttendanceRosterItem = {
  attendeeId: string;
  attendeeType: "STUDENT" | "STAFF";
  name: string;
  identifier: string;
  record: AttendanceRecordData | null;
};

export type AttendanceRecordInputItem = {
  studentId?: string;
  staffId?: string;
  status: AttendanceStatus;
  reasonId?: string | null;
  arrivalAt?: string | null;
  departureAt?: string | null;
};

export type BulkRecordAttendanceInput = OperationsContext & {
  registerId: string;
  records: AttendanceRecordInputItem[];
};

export type StudentAttendanceHistoryQuery = OperationsPageQuery & {
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  type?: AttendanceType;
};

export type StudentAttendanceHistoryRecord = AttendanceRecordData & {
  date: Date;
  type: AttendanceType;
  classId: string | null;
  streamId: string | null;
  timetableLessonId: string | null;
  reasonName: string | null;
};

export type TimetablePeriodRecord = {
  id: string;
  name: string;
  position: number;
  startsAt: string;
  endsAt: string;
  createdAt: Date;
};

export type RoomRecord = {
  id: string;
  name: string;
  capacity: number;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityRecord = {
  id: string;
  staffId: string;
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
  createdAt: Date;
};

export type TimetableRecord = {
  id: string;
  academicYearId: string;
  name: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAttendanceRegisterInput = OperationsContext & {
  academicYearId: string;
  date: string;
  type: AttendanceType;
  classId?: string;
  streamId?: string;
  timetableLessonId?: string;
};

export type RecordAttendanceInput = OperationsContext & {
  registerId: string;
  studentId?: string;
  staffId?: string;
  status: AttendanceStatus;
  reasonId?: string | null;
  arrivalAt?: string | null;
  departureAt?: string | null;
};

export type CorrectAttendanceInput = RecordAttendanceInput & { recordId: string };

export type CreateTimetableLessonInput = OperationsContext & {
  timetableId: string;
  classId: string;
  streamId?: string;
  classSubjectAssignmentId: string;
  staffId: string;
  roomId?: string;
  weekday: Weekday;
  startPeriodId: string;
  endPeriodId: string;
};

export type UpdateTimetableLessonInput = OperationsContext &
  Omit<CreateTimetableLessonInput, "timetableId"> & { lessonId: string };

export type TimetableQuery = {
  academicYearId?: string;
  status?: "DRAFT" | "PUBLISHED";
  classId?: string;
  staffId?: string;
};

export type TimetableLessonQuery = {
  weekday?: Weekday;
  classId?: string;
  streamId?: string;
  staffId?: string;
  roomId?: string;
};

export type TimetableValidationError = {
  lessonId?: string;
  code: string;
  message: string;
};

export type TimetableValidationResult = {
  valid: boolean;
  errors: TimetableValidationError[];
};

export type UpdateTimetableInput = OperationsContext & {
  timetableId: string;
  name: string;
};

export type DeleteTimetableInput = OperationsContext & {
  timetableId: string;
};

export type DeleteTimetableLessonInput = OperationsContext & {
  timetableId: string;
  lessonId: string;
};

export interface SchoolOperationsStore {
  listAbsenceReasons(schoolId: string): Promise<AbsenceReasonRecord[]>;
  createAbsenceReason(input: OperationsContext & { name: string }): Promise<AbsenceReasonRecord>;
  deactivateAbsenceReason(input: OperationsContext & { reasonId: string }): Promise<boolean>;
  listAttendanceRegisters(
    schoolId: string,
    query: OperationsPageQuery & {
      from?: string;
      to?: string;
      type?: AttendanceType;
      classId?: string;
      streamId?: string;
      academicYearId?: string;
    },
  ): Promise<OperationsPage<AttendanceRegisterRecord>>;
  createAttendanceRegister(input: CreateAttendanceRegisterInput): Promise<AttendanceRegisterRecord>;
  getAttendanceRegister(schoolId: string, registerId: string): Promise<AttendanceRegisterRecord | null>;
  getAttendanceRoster(schoolId: string, registerId: string): Promise<AttendanceRosterItem[] | null>;
  listAttendanceRecords(
    schoolId: string,
    registerId: string,
  ): Promise<AttendanceRecordData[] | null>;
  recordAttendance(input: RecordAttendanceInput): Promise<AttendanceRecordData>;
  bulkRecordAttendance(input: BulkRecordAttendanceInput): Promise<AttendanceRecordData[]>;
  markAllPresent(input: OperationsContext & { registerId: string }): Promise<AttendanceRecordData[]>;
  correctAttendance(input: CorrectAttendanceInput): Promise<AttendanceRecordData | null>;
  finalizeAttendanceRegister(
    input: OperationsContext & { registerId: string },
  ): Promise<AttendanceRegisterRecord | null>;
  getStudentAttendanceHistory(
    schoolId: string,
    studentId: string,
    query: StudentAttendanceHistoryQuery,
  ): Promise<OperationsPage<StudentAttendanceHistoryRecord> | null>;
  attendanceSummary(
    schoolId: string,
    query: { from: string; to: string; type?: AttendanceType; classId?: string },
  ): Promise<AttendanceSummaryRow[]>;
  attendanceClassSummary(
    schoolId: string,
    query: AttendanceClassSummaryQuery,
  ): Promise<AttendanceClassSummaryRow[]>;
  attendanceTermSummary(
    schoolId: string,
    query: AttendanceTermSummaryQuery,
  ): Promise<AttendanceTermSummaryRow | null>;
  listPeriods(schoolId: string): Promise<TimetablePeriodRecord[]>;
  createPeriod(
    input: OperationsContext & { name: string; position: number; startsAt: string; endsAt: string },
  ): Promise<TimetablePeriodRecord>;
  listRooms(schoolId: string): Promise<RoomRecord[]>;
  createRoom(input: OperationsContext & { name: string; capacity: number }): Promise<RoomRecord>;
  listAvailability(schoolId: string, staffId: string): Promise<AvailabilityRecord[] | null>;
  addAvailability(
    input: OperationsContext & {
      staffId: string;
      weekday: Weekday;
      startsAt: string;
      endsAt: string;
    },
  ): Promise<AvailabilityRecord>;
  listTimetables(schoolId: string, query?: string | TimetableQuery): Promise<TimetableRecord[]>;
  createTimetable(
    input: OperationsContext & { academicYearId: string; name: string },
  ): Promise<TimetableRecord>;
  getTimetable(schoolId: string, timetableId: string): Promise<TimetableRecord | null>;
  updateTimetable(input: UpdateTimetableInput): Promise<TimetableRecord | null>;
  deleteTimetable(input: DeleteTimetableInput): Promise<boolean>;
  validateTimetable(schoolId: string, timetableId: string): Promise<TimetableValidationResult | null>;
  listLessons(
    schoolId: string,
    timetableId: string,
    query?: Weekday | TimetableLessonQuery,
  ): Promise<TimetableLessonRecord[] | null>;
  createLesson(input: CreateTimetableLessonInput): Promise<TimetableLessonRecord>;
  updateLesson(input: UpdateTimetableLessonInput): Promise<TimetableLessonRecord | null>;
  deleteLesson(input: DeleteTimetableLessonInput): Promise<boolean>;
  publishTimetable(
    input: OperationsContext & { timetableId: string },
  ): Promise<TimetableRecord | null>;
  unpublishTimetable(
    input: OperationsContext & { timetableId: string },
  ): Promise<TimetableRecord | null>;
}
