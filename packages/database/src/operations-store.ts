import { type TransactionTimeoutOptions, resolveTransactionOptions } from "./transaction-options.js";
import {
  AcademicRecordStatus,
  AttendanceRegisterStatus,
  AttendanceRegisterType,
  AttendanceStatus,
  Prisma,
  SchoolStatus,
  StaffStatus,
  TimetableStatus,
  Weekday,
  type PrismaClient,
} from "@prisma/client";
import type {
  AbsenceReasonRecord,
  AttendanceRecordData,
  AttendanceRegisterRecord,
  AttendanceSummaryRow,
  AvailabilityRecord,
  CorrectAttendanceInput,
  CreateAttendanceRegisterInput,
  CreateTimetableLessonInput,
  OperationsPage,
  OperationsPageQuery,
  RecordAttendanceInput,
  RoomRecord,
  SchoolOperationsStore,
  TimetableLessonRecord,
  TimetablePeriodRecord,
  TimetableRecord,
  UpdateTimetableLessonInput,
} from "./operations-contracts.js";
import { isWithinAvailability, timetableConflict, type TimetableSlot } from "./operations-rules.js";

export class OperationsStoreError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "SCHOOL_NOT_FOUND"
      | "DUPLICATE"
      | "INVALID_RELATIONSHIP"
      | "INVALID_DATE_RANGE"
      | "INVALID_STATUS"
      | "REGISTER_FINALIZED"
      | "TIMETABLE_PUBLISHED"
      | "TIMETABLE_CONFLICT"
      | "STAFF_UNAVAILABLE"
      | "ROOM_CAPACITY"
      | "ALREADY_PUBLISHED",
    message: string,
  ) {
    super(message);
    this.name = "OperationsStoreError";
  }
}

export class PrismaSchoolOperationsStore implements SchoolOperationsStore {
  private readonly txOptions: { maxWait: number; timeout: number };

  constructor(
    private readonly prisma: PrismaClient,
    options?: TransactionTimeoutOptions,
  ) {
    this.txOptions = resolveTransactionOptions(options);
  }

  async listAbsenceReasons(schoolId: string): Promise<AbsenceReasonRecord[]> {
    return this.prisma.attendanceAbsenceReason.findMany({
      where: { schoolId, status: AcademicRecordStatus.ACTIVE },
      select: reasonSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async createAbsenceReason(
    input: Parameters<SchoolOperationsStore["createAbsenceReason"]>[0],
  ): Promise<AbsenceReasonRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const created = await tx.attendanceAbsenceReason.create({
          data: { schoolId: input.schoolId, name: input.name, nameKey: normalizeName(input.name) },
          select: reasonSelect,
        });
        await audit(tx, input, "ATTENDANCE_ABSENCE_REASON_CREATED", created.id);
        return created;
      }),
    );
  }

  async deactivateAbsenceReason(
    input: Parameters<SchoolOperationsStore["deactivateAbsenceReason"]>[0],
  ): Promise<boolean> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const changed = await tx.attendanceAbsenceReason.updateMany({
        where: {
          id: input.reasonId,
          schoolId: input.schoolId,
          status: AcademicRecordStatus.ACTIVE,
        },
        data: { status: AcademicRecordStatus.INACTIVE },
      });
      if (changed.count !== 1) return false;
      await audit(tx, input, "ATTENDANCE_ABSENCE_REASON_DEACTIVATED", input.reasonId);
      return true;
    });
  }

  async listAttendanceRegisters(
    schoolId: string,
    query: OperationsPageQuery & {
      from?: string;
      to?: string;
      type?: "STUDENT_DAILY" | "STUDENT_LESSON" | "STAFF_DAILY";
      classId?: string;
    },
  ): Promise<OperationsPage<AttendanceRegisterRecord>> {
    const where: Prisma.AttendanceRegisterWhereInput = {
      schoolId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: dateOnly(query.from) } : {}),
              ...(query.to ? { lte: dateOnly(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceRegister.findMany({
        where,
        select: registerSelect,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.attendanceRegister.count({ where }),
    ]);
    return { items, total };
  }

  async createAttendanceRegister(
    input: CreateAttendanceRegisterInput,
  ): Promise<AttendanceRegisterRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const date = dateOnly(input.date);
        const year = await tx.academicYear.findFirst({
          where: {
            schoolId: input.schoolId,
            id: input.academicYearId,
            status: AcademicRecordStatus.ACTIVE,
            startsOn: { lte: date },
            endsOn: { gte: date },
          },
          select: { id: true },
        });
        if (!year)
          throw storeError(
            "INVALID_RELATIONSHIP",
            "The date must fall within the active academic year.",
          );

        if (input.type === AttendanceRegisterType.STAFF_DAILY) {
          if (input.classId || input.streamId || input.timetableLessonId) {
            throw storeError(
              "INVALID_RELATIONSHIP",
              "Staff daily registers cannot have a class, stream, or lesson.",
            );
          }
        } else {
          if (!input.classId)
            throw storeError("INVALID_RELATIONSHIP", "Student registers require a class.");
          const classRecord = await tx.academicClass.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.classId,
              academicYearId: input.academicYearId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!classRecord)
            throw storeError(
              "INVALID_RELATIONSHIP",
              "The class is not active in this academic year.",
            );
          if (input.streamId) {
            const stream = await tx.classStream.findFirst({
              where: {
                schoolId: input.schoolId,
                id: input.streamId,
                classId: input.classId,
                status: AcademicRecordStatus.ACTIVE,
              },
              select: { id: true },
            });
            if (!stream)
              throw storeError(
                "INVALID_RELATIONSHIP",
                "The stream does not belong to the selected active class.",
              );
          }
          if (input.type === AttendanceRegisterType.STUDENT_DAILY && input.timetableLessonId) {
            throw storeError(
              "INVALID_RELATIONSHIP",
              "Daily student registers cannot reference a timetable lesson.",
            );
          }
          if (input.type === AttendanceRegisterType.STUDENT_LESSON) {
            if (!input.timetableLessonId)
              throw storeError(
                "INVALID_RELATIONSHIP",
                "Lesson registers require a timetable lesson.",
              );
            const lesson = await tx.timetableLesson.findFirst({
              where: {
                schoolId: input.schoolId,
                id: input.timetableLessonId,
                academicYearId: input.academicYearId,
                classId: input.classId,
                streamId: input.streamId ?? null,
                weekday: weekdayFor(date),
                timetable: { status: TimetableStatus.PUBLISHED },
              },
              select: { id: true },
            });
            if (!lesson)
              throw storeError(
                "INVALID_RELATIONSHIP",
                "The lesson must be published and match the class and date.",
              );
          }
        }

        const created = await tx.attendanceRegister.create({
          data: {
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            date,
            type: input.type,
            classId: input.classId ?? null,
            streamId: input.streamId ?? null,
            timetableLessonId: input.timetableLessonId ?? null,
            createdByUserId: input.actorUserId,
          },
          select: registerSelect,
        });
        await audit(tx, input, "ATTENDANCE_REGISTER_CREATED", created.id);
        return created;
      }),
    );
  }

  async listAttendanceRecords(
    schoolId: string,
    registerId: string,
  ): Promise<AttendanceRecordData[] | null> {
    const register = await this.prisma.attendanceRegister.findFirst({
      where: { schoolId, id: registerId },
      select: { id: true },
    });
    if (!register) return null;
    return this.prisma.attendanceRecord.findMany({
      where: { schoolId, registerId },
      select: attendanceRecordSelect,
      orderBy: [{ markedAt: "asc" }, { id: "asc" }],
    });
  }

  async recordAttendance(input: RecordAttendanceInput): Promise<AttendanceRecordData> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await lockRegister(tx, input.schoolId, input.registerId);
        await requireActiveSchool(tx, input.schoolId);
        const register = await tx.attendanceRegister.findFirst({
          where: { schoolId: input.schoolId, id: input.registerId },
          select: {
            id: true,
            type: true,
            status: true,
            academicYearId: true,
            classId: true,
            streamId: true,
          },
        });
        if (!register) throw storeError("NOT_FOUND", "The attendance register was not found.");
        if (register.status !== AttendanceRegisterStatus.OPEN) {
          throw storeError("REGISTER_FINALIZED", "Finalized registers cannot accept new records.");
        }
        await validateAttendee(tx, input, register);
        const record = await tx.attendanceRecord.create({
          data: {
            schoolId: input.schoolId,
            registerId: input.registerId,
            studentId: input.studentId ?? null,
            staffId: input.staffId ?? null,
            status: input.status,
            reasonId: input.reasonId ?? null,
            arrivalAt: input.arrivalAt ? timeOnly(input.arrivalAt) : null,
            departureAt: input.departureAt ? timeOnly(input.departureAt) : null,
            markedByUserId: input.actorUserId,
          },
          select: attendanceRecordSelect,
        });
        await audit(tx, input, "ATTENDANCE_RECORD_CREATED", record.id);
        return record;
      }),
    );
  }

  async correctAttendance(input: CorrectAttendanceInput): Promise<AttendanceRecordData | null> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        const existing = await tx.attendanceRecord.findFirst({
          where: { schoolId: input.schoolId, id: input.recordId, registerId: input.registerId },
          select: {
            ...attendanceRecordSelect,
            register: {
              select: {
                status: true,
                type: true,
                academicYearId: true,
                classId: true,
                streamId: true,
              },
            },
          },
        });
        if (!existing) return null;
        await lockRegister(tx, input.schoolId, input.registerId);
        await requireActiveSchool(tx, input.schoolId);
        const currentRegister = await tx.attendanceRegister.findFirst({
          where: { schoolId: input.schoolId, id: input.registerId },
          select: { status: true, type: true, academicYearId: true, classId: true, streamId: true },
        });
        if (!currentRegister) return null;
        await validateAttendanceFields(tx, input);
        const changed = await tx.attendanceRecord.updateMany({
          where: { schoolId: input.schoolId, id: input.recordId, registerId: input.registerId },
          data: {
            status: input.status,
            reasonId: input.reasonId ?? null,
            arrivalAt: input.arrivalAt ? timeOnly(input.arrivalAt) : null,
            departureAt: input.departureAt ? timeOnly(input.departureAt) : null,
            markedByUserId: input.actorUserId,
          },
        });
        if (changed.count !== 1) return null;
        await tx.attendanceRecordRevision.create({
          data: {
            schoolId: input.schoolId,
            recordId: existing.id,
            beforeData: attendanceSnapshot(existing),
            afterData: {
              status: input.status,
              reasonId: input.reasonId ?? null,
              arrivalAt: input.arrivalAt ?? null,
              departureAt: input.departureAt ?? null,
            },
            actorUserId: input.actorUserId,
            requestId: input.requestId,
          },
        });
        await audit(tx, input, "ATTENDANCE_RECORD_CORRECTED", existing.id);
        return tx.attendanceRecord.findFirst({
          where: { schoolId: input.schoolId, id: input.recordId },
          select: attendanceRecordSelect,
        });
      }),
    );
  }

  async finalizeAttendanceRegister(
    input: Parameters<SchoolOperationsStore["finalizeAttendanceRegister"]>[0],
  ): Promise<AttendanceRegisterRecord | null> {
    return this.transaction(async (tx) => {
      await lockRegister(tx, input.schoolId, input.registerId);
      await requireActiveSchool(tx, input.schoolId);
      const changed = await tx.attendanceRegister.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.registerId,
          status: AttendanceRegisterStatus.OPEN,
        },
        data: {
          status: AttendanceRegisterStatus.FINALIZED,
          finalizedByUserId: input.actorUserId,
          finalizedAt: new Date(),
        },
      });
      if (changed.count !== 1) return null;
      await audit(tx, input, "ATTENDANCE_REGISTER_FINALIZED", input.registerId);
      return tx.attendanceRegister.findFirst({
        where: { schoolId: input.schoolId, id: input.registerId },
        select: registerSelect,
      });
    });
  }

  async attendanceSummary(
    schoolId: string,
    query: {
      from: string;
      to: string;
      type?: "STUDENT_DAILY" | "STUDENT_LESSON" | "STAFF_DAILY";
      classId?: string;
    },
  ): Promise<AttendanceSummaryRow[]> {
    const typeFilter = query.type
      ? Prisma.sql`AND r.type = ${query.type}::"AttendanceRegisterType"`
      : Prisma.empty;
    const classFilter = query.classId
      ? Prisma.sql`AND r.class_id = ${query.classId}::uuid`
      : Prisma.empty;
    const grouped = await this.prisma.$queryRaw<
      Array<{ date: string; status: AttendanceSummaryRow["status"]; total: number }>
    >(Prisma.sql`
      SELECT
        to_char(r.date, 'YYYY-MM-DD') AS date,
        ar.status::text AS status,
        count(*)::int AS total
      FROM attendance_records ar
      INNER JOIN attendance_registers r
        ON r.school_id = ar.school_id AND r.id = ar.register_id
      WHERE ar.school_id = ${schoolId}::uuid
        AND r.date >= ${query.from}::date
        AND r.date <= ${query.to}::date
        ${typeFilter}
        ${classFilter}
      GROUP BY r.date, ar.status
      ORDER BY r.date, ar.status
    `);
    return grouped.map((row) => ({
      date: row.date,
      status: row.status,
      total: row.total,
    }));
  }

  async listPeriods(schoolId: string): Promise<TimetablePeriodRecord[]> {
    const records = await this.prisma.timetablePeriod.findMany({
      where: { schoolId },
      select: periodSelect,
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return records.map(serializePeriod);
  }

  async createPeriod(
    input: Parameters<SchoolOperationsStore["createPeriod"]>[0],
  ): Promise<TimetablePeriodRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        await lockSchool(tx, input.schoolId);
        if (input.startsAt >= input.endsAt)
          throw storeError("INVALID_DATE_RANGE", "Period end must be after its start.");
        const periods = await tx.timetablePeriod.findMany({
          where: { schoolId: input.schoolId },
          select: { startsAt: true, endsAt: true },
        });
        if (
          periods.some((period) =>
            overlaps(
              timeOnly(input.startsAt),
              timeOnly(input.endsAt),
              period.startsAt,
              period.endsAt,
            ),
          )
        ) {
          throw storeError("INVALID_RELATIONSHIP", "Timetable periods cannot overlap.");
        }
        const period = await tx.timetablePeriod.create({
          data: {
            schoolId: input.schoolId,
            name: input.name,
            nameKey: normalizeName(input.name),
            position: input.position,
            startsAt: timeOnly(input.startsAt),
            endsAt: timeOnly(input.endsAt),
          },
          select: periodSelect,
        });
        await audit(tx, input, "TIMETABLE_PERIOD_CREATED", period.id);
        return serializePeriod(period);
      }),
    );
  }

  async listRooms(schoolId: string): Promise<RoomRecord[]> {
    return this.prisma.schoolRoom.findMany({
      where: { schoolId, status: AcademicRecordStatus.ACTIVE },
      select: roomSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async createRoom(input: Parameters<SchoolOperationsStore["createRoom"]>[0]): Promise<RoomRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const room = await tx.schoolRoom.create({
          data: {
            schoolId: input.schoolId,
            name: input.name,
            nameKey: normalizeName(input.name),
            capacity: input.capacity,
          },
          select: roomSelect,
        });
        await audit(tx, input, "SCHOOL_ROOM_CREATED", room.id);
        return room;
      }),
    );
  }

  async listAvailability(schoolId: string, staffId: string): Promise<AvailabilityRecord[] | null> {
    const staff = await this.prisma.staff.findFirst({
      where: { schoolId, id: staffId, status: StaffStatus.ACTIVE },
      select: { id: true },
    });
    if (!staff) return null;
    const windows = await this.prisma.staffAvailabilityWindow.findMany({
      where: { schoolId, staffId },
      orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
      select: availabilitySelect,
    });
    return windows.map(serializeAvailability);
  }

  async addAvailability(
    input: Parameters<SchoolOperationsStore["addAvailability"]>[0],
  ): Promise<AvailabilityRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        if (input.startsAt >= input.endsAt)
          throw storeError("INVALID_DATE_RANGE", "Availability end must be after its start.");
        await lockStaff(tx, input.schoolId, input.staffId);
        const staff = await tx.staff.findFirst({
          where: { schoolId: input.schoolId, id: input.staffId, status: StaffStatus.ACTIVE },
          select: { id: true },
        });
        if (!staff) throw storeError("NOT_FOUND", "The active staff member was not found.");
        const existing = await tx.staffAvailabilityWindow.findMany({
          where: { schoolId: input.schoolId, staffId: input.staffId, weekday: input.weekday },
          select: { startsAt: true, endsAt: true },
        });
        if (
          existing.some((window) =>
            overlaps(
              timeOnly(input.startsAt),
              timeOnly(input.endsAt),
              window.startsAt,
              window.endsAt,
            ),
          )
        ) {
          throw storeError("DUPLICATE", "Teacher availability windows cannot overlap.");
        }
        const created = await tx.staffAvailabilityWindow.create({
          data: {
            schoolId: input.schoolId,
            staffId: input.staffId,
            weekday: input.weekday,
            startsAt: timeOnly(input.startsAt),
            endsAt: timeOnly(input.endsAt),
          },
          select: availabilitySelect,
        });
        await audit(tx, input, "STAFF_AVAILABILITY_CREATED", created.id);
        return serializeAvailability(created);
      }),
    );
  }

  async listTimetables(schoolId: string, academicYearId: string): Promise<TimetableRecord[]> {
    return this.prisma.timetable.findMany({
      where: { schoolId, academicYearId },
      select: timetableSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }

  async createTimetable(
    input: Parameters<SchoolOperationsStore["createTimetable"]>[0],
  ): Promise<TimetableRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const year = await tx.academicYear.findFirst({
          where: {
            schoolId: input.schoolId,
            id: input.academicYearId,
            status: AcademicRecordStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!year)
          throw storeError("INVALID_RELATIONSHIP", "The active academic year was not found.");
        const timetable = await tx.timetable.create({
          data: {
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            name: input.name,
            nameKey: normalizeName(input.name),
          },
          select: timetableSelect,
        });
        await audit(tx, input, "TIMETABLE_CREATED", timetable.id);
        return timetable;
      }),
    );
  }

  async listLessons(
    schoolId: string,
    timetableId: string,
  ): Promise<TimetableLessonRecord[] | null> {
    const timetable = await this.prisma.timetable.findFirst({
      where: { schoolId, id: timetableId },
      select: { id: true },
    });
    if (!timetable) return null;
    return this.prisma.timetableLesson.findMany({
      where: { schoolId, timetableId },
      select: lessonSelect,
      orderBy: [{ weekday: "asc" }, { startPeriod: { position: "asc" } }, { id: "asc" }],
    });
  }

  async createLesson(input: CreateTimetableLessonInput): Promise<TimetableLessonRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await lockTimetable(tx, input.schoolId, input.timetableId);
        await requireActiveSchool(tx, input.schoolId);
        const timetable = await tx.timetable.findFirst({
          where: { schoolId: input.schoolId, id: input.timetableId },
          select: { id: true, academicYearId: true, status: true },
        });
        if (!timetable) throw storeError("NOT_FOUND", "The timetable was not found.");
        if (timetable.status !== TimetableStatus.DRAFT)
          throw storeError("TIMETABLE_PUBLISHED", "Unpublish the timetable before editing.");
        const lesson = await prepareLesson(tx, input, timetable.academicYearId);
        await ensureNoConflict(tx, input.schoolId, timetable.id, lesson);
        const created = await tx.timetableLesson.create({
          data: {
            schoolId: input.schoolId,
            academicYearId: timetable.academicYearId,
            timetableId: input.timetableId,
            classId: input.classId,
            streamId: input.streamId ?? null,
            classSubjectAssignmentId: input.classSubjectAssignmentId,
            staffId: input.staffId,
            roomId: input.roomId ?? null,
            weekday: input.weekday,
            startPeriodId: input.startPeriodId,
            endPeriodId: input.endPeriodId,
          },
          select: lessonSelect,
        });
        await audit(tx, input, "TIMETABLE_LESSON_CREATED", created.id);
        return created;
      }),
    );
  }

  async updateLesson(input: UpdateTimetableLessonInput): Promise<TimetableLessonRecord | null> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        const current = await tx.timetableLesson.findFirst({
          where: { schoolId: input.schoolId, id: input.lessonId },
          select: { id: true, timetableId: true, academicYearId: true },
        });
        if (!current) return null;
        await lockTimetable(tx, input.schoolId, current.timetableId);
        await requireActiveSchool(tx, input.schoolId);
        const timetable = await tx.timetable.findFirst({
          where: { schoolId: input.schoolId, id: current.timetableId },
          select: { status: true },
        });
        if (!timetable || timetable.status !== TimetableStatus.DRAFT) {
          throw storeError("TIMETABLE_PUBLISHED", "Unpublish the timetable before editing.");
        }
        const lesson = await prepareLesson(tx, input, current.academicYearId);
        await ensureNoConflict(tx, input.schoolId, current.timetableId, lesson, current.id);
        const changed = await tx.timetableLesson.updateMany({
          where: { schoolId: input.schoolId, id: current.id },
          data: {
            classId: input.classId,
            streamId: input.streamId ?? null,
            classSubjectAssignmentId: input.classSubjectAssignmentId,
            staffId: input.staffId,
            roomId: input.roomId ?? null,
            weekday: input.weekday,
            startPeriodId: input.startPeriodId,
            endPeriodId: input.endPeriodId,
          },
        });
        if (changed.count !== 1) return null;
        await audit(tx, input, "TIMETABLE_LESSON_UPDATED", current.id);
        return tx.timetableLesson.findFirst({
          where: { schoolId: input.schoolId, id: current.id },
          select: lessonSelect,
        });
      }),
    );
  }

  async publishTimetable(
    input: Parameters<SchoolOperationsStore["publishTimetable"]>[0],
  ): Promise<TimetableRecord | null> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        const timetable = await tx.timetable.findFirst({
          where: { schoolId: input.schoolId, id: input.timetableId },
          select: { id: true, academicYearId: true, status: true },
        });
        if (!timetable) return null;
        await lockTimetable(tx, input.schoolId, timetable.id);
        await requireActiveSchool(tx, input.schoolId);
        await tx.$queryRaw`SELECT id FROM academic_years WHERE school_id = ${input.schoolId}::uuid AND id = ${timetable.academicYearId}::uuid FOR UPDATE`;
        const current = await tx.timetable.findFirst({
          where: { schoolId: input.schoolId, id: timetable.id },
          select: { status: true },
        });
        if (!current) return null;
        if (current.status === TimetableStatus.PUBLISHED) {
          throw storeError("ALREADY_PUBLISHED", "The timetable is already published.");
        }
        const active = await tx.timetable.findFirst({
          where: {
            schoolId: input.schoolId,
            academicYearId: timetable.academicYearId,
            status: TimetableStatus.PUBLISHED,
          },
          select: { id: true },
        });
        if (active)
          throw storeError(
            "ALREADY_PUBLISHED",
            "Another timetable is already published for this academic year.",
          );
        const year = await tx.academicYear.findFirst({
          where: {
            schoolId: input.schoolId,
            id: timetable.academicYearId,
            status: AcademicRecordStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!year) {
          throw storeError("INVALID_RELATIONSHIP", "The timetable's academic year is inactive.");
        }
        const lessons = await tx.timetableLesson.findMany({
          where: { schoolId: input.schoolId, timetableId: timetable.id },
          select: {
            id: true,
            classId: true,
            streamId: true,
            classSubjectAssignmentId: true,
            staffId: true,
            roomId: true,
            weekday: true,
            startPeriodId: true,
            endPeriodId: true,
          },
        });
        for (const lesson of lessons) {
          const candidate = await prepareLesson(
            tx,
            {
              ...input,
              timetableId: timetable.id,
              classId: lesson.classId,
              ...(lesson.streamId ? { streamId: lesson.streamId } : {}),
              classSubjectAssignmentId: lesson.classSubjectAssignmentId,
              staffId: lesson.staffId,
              ...(lesson.roomId ? { roomId: lesson.roomId } : {}),
              weekday: lesson.weekday,
              startPeriodId: lesson.startPeriodId,
              endPeriodId: lesson.endPeriodId,
            },
            timetable.academicYearId,
          );
          await ensureNoConflict(tx, input.schoolId, timetable.id, candidate, lesson.id);
        }
        const updated = await tx.timetable.update({
          where: { id: timetable.id },
          data: { status: TimetableStatus.PUBLISHED, publishedAt: new Date() },
          select: timetableSelect,
        });
        await tx.timetableEvent.create({
          data: {
            schoolId: input.schoolId,
            timetableId: timetable.id,
            actorUserId: input.actorUserId,
            eventType: "PUBLISHED",
            requestId: input.requestId,
          },
        });
        await audit(tx, input, "TIMETABLE_PUBLISHED", timetable.id);
        return updated;
      }),
    );
  }

  async unpublishTimetable(
    input: Parameters<SchoolOperationsStore["unpublishTimetable"]>[0],
  ): Promise<TimetableRecord | null> {
    return this.transaction(async (tx) => {
      await lockTimetable(tx, input.schoolId, input.timetableId);
      await requireActiveSchool(tx, input.schoolId);
      const changed = await tx.timetable.updateMany({
        where: {
          schoolId: input.schoolId,
          id: input.timetableId,
          status: TimetableStatus.PUBLISHED,
        },
        data: { status: TimetableStatus.DRAFT, publishedAt: null },
      });
      if (changed.count !== 1) return null;
      await tx.timetableEvent.create({
        data: {
          schoolId: input.schoolId,
          timetableId: input.timetableId,
          actorUserId: input.actorUserId,
          eventType: "UNPUBLISHED",
          requestId: input.requestId,
        },
      });
      await audit(tx, input, "TIMETABLE_UNPUBLISHED", input.timetableId);
      return tx.timetable.findFirst({
        where: { schoolId: input.schoolId, id: input.timetableId },
        select: timetableSelect,
      });
    });
  }

  private transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: this.txOptions.maxWait,
      timeout: this.txOptions.timeout,
    });
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002")
          throw storeError("DUPLICATE", "A record with these values already exists.");
        if (error.code === "P2003" || error.code === "P2025") {
          throw storeError("INVALID_RELATIONSHIP", "A referenced record is missing or inactive.");
        }
      }
      throw error;
    }
  }
}

const reasonSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttendanceAbsenceReasonSelect;
const registerSelect = {
  id: true,
  academicYearId: true,
  classId: true,
  streamId: true,
  timetableLessonId: true,
  type: true,
  date: true,
  status: true,
  createdAt: true,
} satisfies Prisma.AttendanceRegisterSelect;
const attendanceRecordSelect = {
  id: true,
  registerId: true,
  studentId: true,
  staffId: true,
  status: true,
  reasonId: true,
  arrivalAt: true,
  departureAt: true,
  markedAt: true,
  updatedAt: true,
} satisfies Prisma.AttendanceRecordSelect;
const periodSelect = {
  id: true,
  name: true,
  position: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
} satisfies Prisma.TimetablePeriodSelect;
const roomSelect = {
  id: true,
  name: true,
  capacity: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SchoolRoomSelect;
const availabilitySelect = {
  id: true,
  staffId: true,
  weekday: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
} satisfies Prisma.StaffAvailabilityWindowSelect;
const timetableSelect = {
  id: true,
  academicYearId: true,
  name: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TimetableSelect;
const lessonSelect = {
  id: true,
  timetableId: true,
  academicYearId: true,
  classId: true,
  streamId: true,
  classSubjectAssignmentId: true,
  staffId: true,
  roomId: true,
  weekday: true,
  startPeriodId: true,
  endPeriodId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TimetableLessonSelect;

async function requireActiveSchool(tx: Prisma.TransactionClient, schoolId: string) {
  const school = await tx.school.findFirst({
    where: { id: schoolId, status: SchoolStatus.ACTIVE },
    select: { id: true },
  });
  if (!school) throw storeError("SCHOOL_NOT_FOUND", "The active school was not found.");
}

async function validateAttendee(
  tx: Prisma.TransactionClient,
  input: RecordAttendanceInput,
  register: {
    type: AttendanceRegisterType;
    academicYearId: string;
    classId: string | null;
    streamId: string | null;
  },
) {
  await validateAttendanceFields(tx, input);
  const student = input.studentId ?? null;
  const staff = input.staffId ?? null;
  if ((student === null) === (staff === null)) {
    throw storeError(
      "INVALID_RELATIONSHIP",
      "Each attendance record must identify exactly one student or staff member.",
    );
  }
  if (register.type === AttendanceRegisterType.STAFF_DAILY) {
    if (!staff)
      throw storeError("INVALID_RELATIONSHIP", "Staff registers accept only staff records.");
    const activeStaff = await tx.staff.findFirst({
      where: { schoolId: input.schoolId, id: staff, status: StaffStatus.ACTIVE },
      select: { id: true },
    });
    if (!activeStaff)
      throw storeError("INVALID_RELATIONSHIP", "The staff member is not active in this school.");
  } else {
    if (!student || !register.classId)
      throw storeError("INVALID_RELATIONSHIP", "Student registers accept only student records.");
    const placement = await tx.studentPlacement.findFirst({
      where: {
        schoolId: input.schoolId,
        academicYearId: register.academicYearId,
        classId: register.classId,
        ...(register.streamId ? { streamId: register.streamId } : {}),
        studentId: student,
        endedAt: null,
        student: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!placement)
      throw storeError(
        "INVALID_RELATIONSHIP",
        "The student is not actively placed in this register's class and year.",
      );
  }
}

async function validateAttendanceFields(
  tx: Prisma.TransactionClient,
  input: RecordAttendanceInput,
) {
  if (input.reasonId) {
    if (input.status !== AttendanceStatus.ABSENT) {
      throw storeError(
        "INVALID_RELATIONSHIP",
        "Configured absence reasons may only be used with ABSENT.",
      );
    }
    const reason = await tx.attendanceAbsenceReason.findFirst({
      where: { schoolId: input.schoolId, id: input.reasonId, status: AcademicRecordStatus.ACTIVE },
      select: { id: true },
    });
    if (!reason)
      throw storeError("INVALID_RELATIONSHIP", "The absence reason is not active in this school.");
  }
  if (input.status === AttendanceStatus.LATE && !input.arrivalAt) {
    throw storeError("INVALID_RELATIONSHIP", "Late attendance requires an arrival time.");
  }
  if (input.status !== AttendanceStatus.LATE && input.arrivalAt) {
    throw storeError("INVALID_RELATIONSHIP", "Arrival time is only accepted for LATE attendance.");
  }
  if (input.status === AttendanceStatus.EARLY_DEPARTURE && !input.departureAt) {
    throw storeError("INVALID_RELATIONSHIP", "Early departure requires a departure time.");
  }
  if (input.status !== AttendanceStatus.EARLY_DEPARTURE && input.departureAt) {
    throw storeError(
      "INVALID_RELATIONSHIP",
      "Departure time is only accepted for EARLY_DEPARTURE attendance.",
    );
  }
}

async function prepareLesson(
  tx: Prisma.TransactionClient,
  input: CreateTimetableLessonInput | UpdateTimetableLessonInput,
  academicYearId: string,
) {
  await lockStaff(tx, input.schoolId, input.staffId);
  const [classRecord, assignment, staff, start, end] = await Promise.all([
    tx.academicClass.findFirst({
      where: {
        schoolId: input.schoolId,
        id: input.classId,
        academicYearId,
        status: AcademicRecordStatus.ACTIVE,
      },
      select: { id: true },
    }),
    tx.classSubjectAssignment.findFirst({
      where: {
        schoolId: input.schoolId,
        id: input.classSubjectAssignmentId,
        classId: input.classId,
        status: AcademicRecordStatus.ACTIVE,
      },
      select: { id: true },
    }),
    tx.staff.findFirst({
      where: {
        schoolId: input.schoolId,
        id: input.staffId,
        status: StaffStatus.ACTIVE,
        subjectAssignments: {
          some: { classSubjectAssignmentId: input.classSubjectAssignmentId, endedAt: null },
        },
      },
      select: { id: true },
    }),
    tx.timetablePeriod.findFirst({
      where: { schoolId: input.schoolId, id: input.startPeriodId },
      select: { id: true, position: true, startsAt: true, endsAt: true },
    }),
    tx.timetablePeriod.findFirst({
      where: { schoolId: input.schoolId, id: input.endPeriodId },
      select: { id: true, position: true, startsAt: true, endsAt: true },
    }),
  ]);
  if (!classRecord || !assignment || !staff || !start || !end) {
    throw storeError(
      "INVALID_RELATIONSHIP",
      "The class, subject assignment, teacher, or period is not active in this school.",
    );
  }
  if (input.streamId) {
    const stream = await tx.classStream.findFirst({
      where: {
        schoolId: input.schoolId,
        id: input.streamId,
        classId: input.classId,
        status: AcademicRecordStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!stream)
      throw storeError(
        "INVALID_RELATIONSHIP",
        "The stream does not belong to the selected active class.",
      );
  }
  if (end.position < start.position)
    throw storeError("INVALID_RELATIONSHIP", "The end period must not precede the start period.");
  const periods = await tx.timetablePeriod.findMany({
    where: { schoolId: input.schoolId, position: { gte: start.position, lte: end.position } },
    orderBy: { position: "asc" },
    select: { position: true, startsAt: true, endsAt: true },
  });
  if (
    periods.length !== end.position - start.position + 1 ||
    periods.some(
      (period, index) =>
        index > 0 && periods[index - 1]?.endsAt.getTime() !== period.startsAt.getTime(),
    )
  ) {
    throw storeError(
      "INVALID_RELATIONSHIP",
      "Double lessons must span consecutive, adjacent configured periods.",
    );
  }
  let room: { id: string; capacity: number } | null = null;
  if (input.roomId) {
    room = await tx.schoolRoom.findFirst({
      where: { schoolId: input.schoolId, id: input.roomId, status: AcademicRecordStatus.ACTIVE },
      select: { id: true, capacity: true },
    });
    if (!room) throw storeError("INVALID_RELATIONSHIP", "The room is not active in this school.");
    const students = await tx.studentPlacement.count({
      where: {
        schoolId: input.schoolId,
        academicYearId,
        classId: input.classId,
        endedAt: null,
        student: { status: "ACTIVE" },
        ...(input.streamId ? { streamId: input.streamId } : {}),
      },
    });
    if (students > room.capacity)
      throw storeError(
        "ROOM_CAPACITY",
        "The room capacity is below the current class or stream enrollment.",
      );
  }
  const availability = await tx.staffAvailabilityWindow.findMany({
    where: { schoolId: input.schoolId, staffId: input.staffId, weekday: input.weekday },
    select: { startsAt: true, endsAt: true },
  });
  if (!isWithinAvailability(start.startsAt, end.endsAt, availability)) {
    throw storeError(
      "STAFF_UNAVAILABLE",
      "The lesson falls outside the teacher's configured availability.",
    );
  }
  return {
    startAt: start.startsAt,
    endAt: end.endsAt,
    weekday: input.weekday,
    classId: input.classId,
    streamId: input.streamId ?? null,
    staffId: input.staffId,
    roomId: input.roomId ?? null,
  };
}

async function ensureNoConflict(
  tx: Prisma.TransactionClient,
  schoolId: string,
  timetableId: string,
  candidate: Awaited<ReturnType<typeof prepareLesson>>,
  exceptId?: string,
) {
  const lessons = await tx.timetableLesson.findMany({
    where: {
      schoolId,
      timetableId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    include: {
      startPeriod: { select: { startsAt: true } },
      endPeriod: { select: { endsAt: true } },
    },
  });
  const candidateSlot: TimetableSlot = {
    weekday: candidate.weekday,
    classId: candidate.classId,
    streamId: candidate.streamId,
    staffId: candidate.staffId,
    roomId: candidate.roomId,
    startsAt: candidate.startAt,
    endsAt: candidate.endAt,
  };
  const existingSlots: TimetableSlot[] = lessons.map((lesson) => ({
    weekday: lesson.weekday,
    classId: lesson.classId,
    streamId: lesson.streamId,
    staffId: lesson.staffId,
    roomId: lesson.roomId,
    startsAt: lesson.startPeriod.startsAt,
    endsAt: lesson.endPeriod.endsAt,
  }));
  if (timetableConflict(candidateSlot, existingSlots)) {
    throw storeError(
      "TIMETABLE_CONFLICT",
      "The lesson conflicts with an existing teacher, class/stream, or room assignment.",
    );
  }
}

async function lockRegister(tx: Prisma.TransactionClient, schoolId: string, registerId: string) {
  await tx.$queryRaw`SELECT id FROM attendance_registers WHERE school_id = ${schoolId}::uuid AND id = ${registerId}::uuid FOR UPDATE`;
}

async function lockSchool(tx: Prisma.TransactionClient, schoolId: string) {
  await tx.$queryRaw`SELECT id FROM schools WHERE id = ${schoolId}::uuid FOR UPDATE`;
}

async function lockStaff(tx: Prisma.TransactionClient, schoolId: string, staffId: string) {
  await tx.$queryRaw`SELECT id FROM staff WHERE school_id = ${schoolId}::uuid AND id = ${staffId}::uuid FOR UPDATE`;
}

async function lockTimetable(tx: Prisma.TransactionClient, schoolId: string, timetableId: string) {
  await tx.$queryRaw`SELECT id FROM timetables WHERE school_id = ${schoolId}::uuid AND id = ${timetableId}::uuid FOR UPDATE`;
}

async function audit(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; actorUserId: string; requestId: string },
  eventType: string,
  resourceId: string,
) {
  await tx.securityAuditEvent.create({
    data: {
      schoolId: input.schoolId,
      actorUserId: input.actorUserId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: { resourceId },
    },
  });
}

function attendanceSnapshot(record: {
  status: AttendanceStatus;
  reasonId: string | null;
  arrivalAt: Date | null;
  departureAt: Date | null;
}) {
  return {
    status: record.status,
    reasonId: record.reasonId,
    arrivalAt: record.arrivalAt?.toISOString().slice(11, 16) ?? null,
    departureAt: record.departureAt?.toISOString().slice(11, 16) ?? null,
  };
}

function serializePeriod<T extends { startsAt: Date; endsAt: Date }>(
  period: T,
): T & { startsAt: string; endsAt: string } {
  return { ...period, startsAt: timeString(period.startsAt), endsAt: timeString(period.endsAt) };
}

function serializeAvailability<T extends { startsAt: Date; endsAt: Date }>(
  window: T,
): T & { startsAt: string; endsAt: string } {
  return { ...window, startsAt: timeString(window.startsAt), endsAt: timeString(window.endsAt) };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function timeOnly(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function timeString(value: Date): string {
  return value.toISOString().slice(11, 16);
}

function weekdayFor(date: Date): Weekday {
  const weekdays: Weekday[] = [
    Weekday.SUNDAY,
    Weekday.MONDAY,
    Weekday.TUESDAY,
    Weekday.WEDNESDAY,
    Weekday.THURSDAY,
    Weekday.FRIDAY,
    Weekday.SATURDAY,
  ];
  return weekdays[date.getUTCDay()] ?? Weekday.MONDAY;
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date): boolean {
  return start < otherEnd && end > otherStart;
}

function normalizeName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en");
}

function storeError(
  code: ConstructorParameters<typeof OperationsStoreError>[0],
  message: string,
): OperationsStoreError {
  return new OperationsStoreError(code, message);
}
