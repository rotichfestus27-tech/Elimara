import { randomUUID } from "node:crypto";
import {
  OperationsStoreError,
  type AttendanceRecordData,
  type AttendanceRegisterRecord,
  type AbsenceReasonRecord,
  type SchoolOperationsStore,
  type TimetablePeriodRecord,
  type RoomRecord,
  type AvailabilityRecord,
  type TimetableRecord,
  type TimetableLessonRecord,
} from "@elimara/database";

export class FakeOperationsStore implements SchoolOperationsStore {
  readonly reasons = new Map<string, AbsenceReasonRecord>();
  readonly registers = new Map<string, AttendanceRegisterRecord>();
  readonly records = new Map<string, AttendanceRecordData>();
  readonly revisions: { recordId: string; actorUserId: string }[] = [];
  readonly periods: TimetablePeriodRecord[] = [];
  readonly rooms: RoomRecord[] = [];
  readonly availability: AvailabilityRecord[] = [];
  readonly timetables = new Map<string, TimetableRecord>();
  readonly lessons = new Map<string, TimetableLessonRecord>();

  async listAbsenceReasons(schoolId: string) {
    return [...this.reasons.values()].filter((item) => this.belongs(item.id, schoolId));
  }

  async createAbsenceReason(input: Parameters<SchoolOperationsStore["createAbsenceReason"]>[0]) {
    if (
      [...this.reasons.values()].some(
        (item) => item.name.toLowerCase() === input.name.toLowerCase(),
      )
    ) {
      throw new OperationsStoreError("DUPLICATE", "Duplicate reason.");
    }
    const now = new Date();
    const item: AbsenceReasonRecord = {
      id: randomUUID(),
      name: input.name,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.schoolByRecord.set(item.id, input.schoolId);
    this.reasons.set(item.id, item);
    return item;
  }

  async deactivateAbsenceReason(
    input: Parameters<SchoolOperationsStore["deactivateAbsenceReason"]>[0],
  ) {
    const item = this.reasons.get(input.reasonId);
    if (!item) return false;
    this.reasons.set(item.id, { ...item, status: "INACTIVE" });
    return true;
  }

  async listAttendanceRegisters(
    schoolId: string,
    query: Parameters<SchoolOperationsStore["listAttendanceRegisters"]>[1],
  ) {
    const all = [...this.registers.values()].filter((item) => {
      if (!this.belongs(item.id, schoolId)) return false;
      if (query.type && item.type !== query.type) return false;
      if (query.classId && item.classId !== query.classId) return false;
      if (query.from && item.date < new Date(`${query.from}T00:00:00Z`)) return false;
      if (query.to && item.date > new Date(`${query.to}T00:00:00Z`)) return false;
      return true;
    });
    return { items: all.slice(query.offset, query.offset + query.limit), total: all.length };
  }

  async createAttendanceRegister(
    input: Parameters<SchoolOperationsStore["createAttendanceRegister"]>[0],
  ) {
    const duplicate = [...this.registers.values()].some(
      (item) =>
        this.belongs(item.id, input.schoolId) &&
        item.date.toISOString().slice(0, 10) === input.date &&
        item.type === input.type &&
        item.classId === (input.classId ?? null) &&
        item.streamId === (input.streamId ?? null) &&
        item.timetableLessonId === (input.timetableLessonId ?? null),
    );
    if (duplicate) throw new OperationsStoreError("DUPLICATE", "Duplicate register.");
    const item: AttendanceRegisterRecord = {
      id: randomUUID(),
      academicYearId: input.academicYearId,
      classId: input.classId ?? null,
      streamId: input.streamId ?? null,
      timetableLessonId: input.timetableLessonId ?? null,
      type: input.type,
      date: new Date(`${input.date}T00:00:00Z`),
      status: "OPEN",
      createdAt: new Date(),
    };
    this.schoolByRecord.set(item.id, input.schoolId);
    this.registers.set(item.id, item);
    return item;
  }

  async listAttendanceRecords(schoolId: string, registerId: string) {
    const register = this.registers.get(registerId);
    if (!register || !this.belongs(registerId, schoolId)) return null;
    return [...this.records.values()].filter((record) => record.registerId === registerId);
  }

  async recordAttendance(input: Parameters<SchoolOperationsStore["recordAttendance"]>[0]) {
    const register = this.registers.get(input.registerId);
    if (!register || !this.belongs(input.registerId, input.schoolId))
      throw new OperationsStoreError("NOT_FOUND", "Register not found.");
    if (register.status !== "OPEN")
      throw new OperationsStoreError("REGISTER_FINALIZED", "Register finalized.");
    if ((input.studentId ? 1 : 0) + (input.staffId ? 1 : 0) !== 1) {
      throw new OperationsStoreError("INVALID_RELATIONSHIP", "Select exactly one attendee.");
    }
    if (
      [...this.records.values()].some(
        (record) =>
          record.registerId === register.id &&
          (input.studentId
            ? record.studentId === input.studentId
            : record.staffId === input.staffId),
      )
    ) {
      throw new OperationsStoreError("DUPLICATE", "Duplicate attendee.");
    }
    const now = new Date();
    const item: AttendanceRecordData = {
      id: randomUUID(),
      registerId: input.registerId,
      studentId: input.studentId ?? null,
      staffId: input.staffId ?? null,
      status: input.status,
      reasonId: input.reasonId ?? null,
      arrivalAt: input.arrivalAt ? new Date(`1970-01-01T${input.arrivalAt}:00Z`) : null,
      departureAt: input.departureAt ? new Date(`1970-01-01T${input.departureAt}:00Z`) : null,
      markedAt: now,
      updatedAt: now,
    };
    this.schoolByRecord.set(item.id, input.schoolId);
    this.records.set(item.id, item);
    return item;
  }

  async correctAttendance(input: Parameters<SchoolOperationsStore["correctAttendance"]>[0]) {
    const item = this.records.get(input.recordId);
    if (!item || item.registerId !== input.registerId || !this.belongs(item.id, input.schoolId))
      return null;
    const updated: AttendanceRecordData = {
      ...item,
      status: input.status,
      reasonId: input.reasonId ?? null,
      arrivalAt: input.arrivalAt ? new Date(`1970-01-01T${input.arrivalAt}:00Z`) : null,
      departureAt: input.departureAt ? new Date(`1970-01-01T${input.departureAt}:00Z`) : null,
      updatedAt: new Date(),
    };
    this.records.set(item.id, updated);
    this.revisions.push({ recordId: item.id, actorUserId: input.actorUserId });
    return updated;
  }

  async finalizeAttendanceRegister(
    input: Parameters<SchoolOperationsStore["finalizeAttendanceRegister"]>[0],
  ) {
    const item = this.registers.get(input.registerId);
    if (!item || !this.belongs(item.id, input.schoolId) || item.status !== "OPEN") return null;
    const updated = { ...item, status: "FINALIZED" as const };
    this.registers.set(item.id, updated);
    return updated;
  }

  async attendanceSummary() {
    return [];
  }

  async listPeriods() {
    return this.periods;
  }

  async createPeriod(input: Parameters<SchoolOperationsStore["createPeriod"]>[0]) {
    const item: TimetablePeriodRecord = {
      id: randomUUID(),
      name: input.name,
      position: input.position,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: new Date(),
    };
    this.periods.push(item);
    return item;
  }

  async listRooms() {
    return this.rooms;
  }

  async createRoom(input: Parameters<SchoolOperationsStore["createRoom"]>[0]) {
    const now = new Date();
    const item: RoomRecord = {
      id: randomUUID(),
      name: input.name,
      capacity: input.capacity,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.rooms.push(item);
    return item;
  }

  async listAvailability(schoolId: string, staffId: string) {
    if (staffId === "00000000-0000-4000-8000-000000000000") return null;
    return this.availability.filter(
      (item) => item.staffId === staffId && this.belongs(item.id, schoolId),
    );
  }

  async addAvailability(input: Parameters<SchoolOperationsStore["addAvailability"]>[0]) {
    const item: AvailabilityRecord = {
      id: randomUUID(),
      staffId: input.staffId,
      weekday: input.weekday,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: new Date(),
    };
    this.availability.push(item);
    return item;
  }

  async listTimetables(schoolId: string, academicYearId: string) {
    return [...this.timetables.values()].filter(
      (item) => item.academicYearId === academicYearId && this.belongs(item.id, schoolId),
    );
  }

  async createTimetable(input: Parameters<SchoolOperationsStore["createTimetable"]>[0]) {
    const now = new Date();
    const item: TimetableRecord = {
      id: randomUUID(),
      academicYearId: input.academicYearId,
      name: input.name,
      status: "DRAFT",
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.timetables.set(item.id, item);
    return item;
  }

  async listLessons(schoolId: string, timetableId: string) {
    if (!this.timetables.has(timetableId) || !this.belongs(timetableId, schoolId)) return null;
    return [...this.lessons.values()].filter((item) => item.timetableId === timetableId);
  }

  async createLesson(input: Parameters<SchoolOperationsStore["createLesson"]>[0]) {
    const item: TimetableLessonRecord = {
      id: randomUUID(),
      timetableId: input.timetableId,
      academicYearId: "00000000-0000-4000-8000-000000000001",
      classId: input.classId,
      streamId: input.streamId ?? null,
      classSubjectAssignmentId: input.classSubjectAssignmentId,
      staffId: input.staffId,
      roomId: input.roomId ?? null,
      weekday: input.weekday,
      startPeriodId: input.startPeriodId,
      endPeriodId: input.endPeriodId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.lessons.set(item.id, item);
    return item;
  }

  async updateLesson(input: Parameters<SchoolOperationsStore["updateLesson"]>[0]) {
    const item = this.lessons.get(input.lessonId);
    if (!item || !this.belongs(item.id, input.schoolId)) return null;
    const updated = { ...item, ...input, updatedAt: new Date() };
    this.lessons.set(item.id, updated);
    return updated;
  }

  async publishTimetable(input: Parameters<SchoolOperationsStore["publishTimetable"]>[0]) {
    const item = this.timetables.get(input.timetableId);
    if (!item || !this.belongs(item.id, input.schoolId)) return null;
    const updated: TimetableRecord = {
      ...item,
      status: "PUBLISHED",
      publishedAt: new Date(),
      updatedAt: new Date(),
    };
    this.timetables.set(item.id, updated);
    return updated;
  }

  async unpublishTimetable(input: Parameters<SchoolOperationsStore["unpublishTimetable"]>[0]) {
    const item = this.timetables.get(input.timetableId);
    if (!item || !this.belongs(item.id, input.schoolId)) return null;
    const updated: TimetableRecord = {
      ...item,
      status: "DRAFT",
      publishedAt: null,
      updatedAt: new Date(),
    };
    this.timetables.set(item.id, updated);
    return updated;
  }

  seedRegister(schoolId: string, input: Omit<AttendanceRegisterRecord, "id" | "createdAt">) {
    const record = { ...input, id: randomUUID(), createdAt: new Date() };
    this.schoolByRecord.set(record.id, schoolId);
    this.registers.set(record.id, record);
    return record;
  }

  private schoolByRecord = new Map<string, string>();

  private belongs(id: string, schoolId: string) {
    return this.schoolByRecord.get(id) === undefined || this.schoolByRecord.get(id) === schoolId;
  }
}
