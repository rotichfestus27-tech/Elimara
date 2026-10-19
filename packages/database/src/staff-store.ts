import {
  AcademicRecordStatus,
  Prisma,
  SchoolStatus,
  StaffStatus as PrismaStaffStatus,
  type PrismaClient,
} from "@prisma/client";
import type {
  ChangeStaffStatusInput,
  CreateStaffClassAssignmentInput,
  CreateStaffDepartmentInput,
  CreateStaffEmploymentInput,
  CreateStaffInput,
  CreateStaffSubjectAssignmentInput,
  DepartmentPageQuery,
  DeactivateStaffDepartmentInput,
  EndStaffAssignmentInput,
  EndStaffEmploymentInput,
  StaffAssignmentRecord,
  StaffDepartmentRecord,
  StaffEmploymentRecord,
  StaffEntityPage,
  StaffHistoryPageQuery,
  StaffPageQuery,
  StaffRecord,
  StaffStore,
  UpdateStaffDepartmentInput,
  UpdateStaffInput,
} from "./staff-contracts.js";

export class StaffStoreError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "SCHOOL_NOT_FOUND"
      | "DUPLICATE"
      | "INVALID_RELATIONSHIP"
      | "RECORD_INACTIVE"
      | "ACTIVE_STAFF_REMAINS"
      | "ACTIVE_EMPLOYMENT_REMAINS"
      | "ACTIVE_ASSIGNMENTS_REMAIN"
      | "ACTIVE_ASSESSMENTS_REMAIN"
      | "ACTIVE_TIMETABLE_ASSIGNMENTS_REMAIN"
      | "ALREADY_ENDED"
      | "INVALID_DATE_RANGE",
    message: string,
  ) {
    super(message);
    this.name = "StaffStoreError";
  }
}

export class PrismaStaffStore implements StaffStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listDepartments(
    schoolId: string,
    query: DepartmentPageQuery,
  ): Promise<StaffEntityPage<StaffDepartmentRecord>> {
    const where: Prisma.StaffDepartmentWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffDepartment.findMany({
        where,
        select: departmentSelect,
        orderBy: [{ name: query.sortOrder }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.staffDepartment.count({ where }),
    ]);
    return { items, total };
  }

  async createDepartment(input: CreateStaffDepartmentInput): Promise<StaffDepartmentRecord> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const created = await tx.staffDepartment.create({
        data: { schoolId: input.schoolId, name: input.name, nameKey: normalizeName(input.name) },
        select: departmentSelect,
      });
      await audit(tx, input, "STAFF_DEPARTMENT_CREATED", created.id, ["name"]);
      return created;
    });
  }

  async updateDepartment(input: UpdateStaffDepartmentInput): Promise<StaffDepartmentRecord | null> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const changed = await tx.staffDepartment.updateMany({
        where: { id: input.id, schoolId: input.schoolId, status: AcademicRecordStatus.ACTIVE },
        data: { name: input.name, nameKey: normalizeName(input.name) },
      });
      if (changed.count !== 1) return null;
      await audit(tx, input, "STAFF_DEPARTMENT_UPDATED", input.id, ["name"]);
      return tx.staffDepartment.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: departmentSelect,
      });
    });
  }

  async deactivateDepartment(input: DeactivateStaffDepartmentInput): Promise<boolean> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const department = await tx.staffDepartment.findFirst({
        where: { id: input.id, schoolId: input.schoolId, status: AcademicRecordStatus.ACTIVE },
        select: { id: true },
      });
      if (!department) return false;
      const activeStaff = await tx.staff.count({
        where: {
          schoolId: input.schoolId,
          departmentId: input.id,
          status: PrismaStaffStatus.ACTIVE,
        },
      });
      if (activeStaff > 0) {
        throw storeError(
          "ACTIVE_STAFF_REMAINS",
          "Reassign active staff before deactivating a department.",
        );
      }
      const changed = await tx.staffDepartment.updateMany({
        where: { id: input.id, schoolId: input.schoolId, status: AcademicRecordStatus.ACTIVE },
        data: { status: AcademicRecordStatus.INACTIVE },
      });
      if (changed.count !== 1) return false;
      await audit(tx, input, "STAFF_DEPARTMENT_DEACTIVATED", input.id, ["status"]);
      return true;
    });
  }

  async listStaff(schoolId: string, query: StaffPageQuery): Promise<StaffEntityPage<StaffRecord>> {
    const where: Prisma.StaffWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { staffNumber: { contains: query.search, mode: "insensitive" } },
              { givenName: { contains: query.search, mode: "insensitive" } },
              { middleName: { contains: query.search, mode: "insensitive" } },
              { familyName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staff.findMany({
        where,
        select: staffSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.StaffOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.staff.count({ where }),
    ]);
    return { items, total };
  }

  async getStaff(schoolId: string, id: string): Promise<StaffRecord | null> {
    return this.prisma.staff.findFirst({ where: { id, schoolId }, select: staffSelect });
  }

  async createStaff(input: CreateStaffInput): Promise<StaffRecord> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      await validateStaffReferences(tx, input.schoolId, input.departmentId, input.userId);
      const created = await tx.staff.create({
        data: {
          schoolId: input.schoolId,
          staffNumber: input.staffNumber,
          staffNumberKey: normalizeStaffNumber(input.staffNumber),
          givenName: input.givenName,
          middleName: input.middleName ?? null,
          familyName: input.familyName,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          positionTitle: input.positionTitle,
          departmentId: input.departmentId ?? null,
          userId: input.userId ?? null,
        },
        select: staffSelect,
      });
      await tx.staffStatusEvent.create({
        data: {
          schoolId: input.schoolId,
          staffId: created.id,
          actorUserId: input.actorUserId,
          fromStatus: null,
          toStatus: PrismaStaffStatus.ACTIVE,
          requestId: input.requestId,
        },
      });
      await audit(tx, input, "STAFF_PROFILE_CREATED", created.id, ["profile"]);
      return created;
    });
  }

  async updateStaff(input: UpdateStaffInput): Promise<StaffRecord | null> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const current = await tx.staff.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: { id: true, status: true },
      });
      if (!current) return null;
      if (input.departmentId !== undefined || input.userId !== undefined) {
        await validateStaffReferences(tx, input.schoolId, input.departmentId, input.userId);
      }
      const { id, schoolId, actorUserId, requestId, ...changes } = input;
      const data: Prisma.StaffUpdateInput = {
        ...(changes.staffNumber !== undefined
          ? {
              staffNumber: changes.staffNumber,
              staffNumberKey: normalizeStaffNumber(changes.staffNumber),
            }
          : {}),
        ...(changes.givenName !== undefined ? { givenName: changes.givenName } : {}),
        ...(changes.middleName !== undefined ? { middleName: changes.middleName } : {}),
        ...(changes.familyName !== undefined ? { familyName: changes.familyName } : {}),
        ...(changes.contactEmail !== undefined ? { contactEmail: changes.contactEmail } : {}),
        ...(changes.contactPhone !== undefined ? { contactPhone: changes.contactPhone } : {}),
        ...(changes.positionTitle !== undefined ? { positionTitle: changes.positionTitle } : {}),
        ...(changes.departmentId !== undefined ? { departmentId: changes.departmentId } : {}),
        ...(changes.userId !== undefined ? { userId: changes.userId } : {}),
      };
      const changed = await tx.staff.updateMany({ where: { id, schoolId }, data });
      if (changed.count !== 1) return null;
      await audit(
        tx,
        { schoolId, actorUserId, requestId },
        "STAFF_PROFILE_UPDATED",
        id,
        Object.keys(changes),
      );
      return tx.staff.findFirst({ where: { id, schoolId }, select: staffSelect });
    });
  }

  async changeStaffStatus(input: ChangeStaffStatusInput): Promise<StaffRecord | null> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      await lockStaff(tx, input.schoolId, input.id);
      const current = await tx.staff.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: { id: true, status: true, departmentId: true },
      });
      if (!current) return null;
      if (current.status === input.status) {
        return tx.staff.findFirst({
          where: { id: input.id, schoolId: input.schoolId },
          select: staffSelect,
        });
      }
      if (input.status === "ACTIVE" && current.departmentId) {
        const department = await tx.staffDepartment.findFirst({
          where: {
            id: current.departmentId,
            schoolId: input.schoolId,
            status: AcademicRecordStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!department) {
          throw storeError(
            "RECORD_INACTIVE",
            "Reassign staff to an active department before reactivating the profile.",
          );
        }
      }
      if (input.status === "INACTIVE") {
        const [employmentCount, classCount, subjectCount, timetableCount] = await Promise.all([
          tx.staffEmployment.count({
            where: { schoolId: input.schoolId, staffId: input.id, endsOn: null },
          }),
          tx.staffClassAssignment.count({
            where: { schoolId: input.schoolId, staffId: input.id, endedAt: null },
          }),
          tx.staffSubjectAssignment.count({
            where: { schoolId: input.schoolId, staffId: input.id, endedAt: null },
          }),
          tx.timetableLesson.count({
            where: {
              schoolId: input.schoolId,
              staffId: input.id,
              timetable: { status: "PUBLISHED" },
            },
          }),
        ]);
        if (employmentCount > 0) {
          throw storeError(
            "ACTIVE_EMPLOYMENT_REMAINS",
            "End the current employment episode before deactivating staff.",
          );
        }
        if (classCount + subjectCount > 0) {
          throw storeError(
            "ACTIVE_ASSIGNMENTS_REMAIN",
            "End active teaching assignments before deactivating staff.",
          );
        }
        if (timetableCount > 0) {
          throw storeError(
            "ACTIVE_TIMETABLE_ASSIGNMENTS_REMAIN",
            "Unpublish or reassign published timetable lessons before deactivating staff.",
          );
        }
      }
      const status =
        input.status === "ACTIVE" ? PrismaStaffStatus.ACTIVE : PrismaStaffStatus.INACTIVE;
      const changed = await tx.staff.updateMany({
        where: { id: input.id, schoolId: input.schoolId, status: current.status },
        data: { status },
      });
      if (changed.count !== 1) return null;
      await tx.staffStatusEvent.create({
        data: {
          schoolId: input.schoolId,
          staffId: input.id,
          actorUserId: input.actorUserId,
          fromStatus: current.status,
          toStatus: status,
          requestId: input.requestId,
        },
      });
      await audit(
        tx,
        input,
        input.status === "ACTIVE" ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
        input.id,
        ["status"],
      );
      return tx.staff.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: staffSelect,
      });
    });
  }

  async listEmployments(
    schoolId: string,
    staffId: string,
    query: StaffHistoryPageQuery,
  ): Promise<StaffEntityPage<StaffEmploymentRecord> | null> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId },
      select: { id: true },
    });
    if (!staff) return null;
    const where = { schoolId, staffId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffEmployment.findMany({
        where,
        select: employmentSelect,
        orderBy: [{ startsOn: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.staffEmployment.count({ where }),
    ]);
    return { items, total };
  }

  async createEmployment(input: CreateStaffEmploymentInput): Promise<StaffEmploymentRecord> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      await requireActiveStaff(tx, input.schoolId, input.staffId);
      const created = await tx.staffEmployment.create({
        data: {
          schoolId: input.schoolId,
          staffId: input.staffId,
          positionTitle: input.positionTitle,
          startsOn: asDate(input.startsOn),
        },
        select: employmentSelect,
      });
      await audit(tx, input, "STAFF_EMPLOYMENT_STARTED", created.id, ["positionTitle", "startsOn"]);
      return created;
    });
  }

  async endEmployment(input: EndStaffEmploymentInput): Promise<StaffEmploymentRecord | null> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const employment = await tx.staffEmployment.findFirst({
        where: { id: input.employmentId, schoolId: input.schoolId, staffId: input.staffId },
        select: { id: true, startsOn: true, endsOn: true },
      });
      if (!employment) return null;
      if (employment.endsOn)
        throw storeError("ALREADY_ENDED", "This employment episode has already ended.");
      const endsOn = asDate(input.endsOn);
      if (endsOn < employment.startsOn) {
        throw storeError(
          "INVALID_DATE_RANGE",
          "Employment end date cannot precede its start date.",
        );
      }
      const changed = await tx.staffEmployment.updateMany({
        where: {
          id: employment.id,
          schoolId: input.schoolId,
          staffId: input.staffId,
          endsOn: null,
        },
        data: { endsOn },
      });
      if (changed.count !== 1)
        throw storeError("ALREADY_ENDED", "This employment episode has already ended.");
      const updated = await tx.staffEmployment.findFirst({
        where: { id: employment.id, schoolId: input.schoolId, staffId: input.staffId },
        select: employmentSelect,
      });
      if (!updated) throw storeError("NOT_FOUND", "The employment record was not found.");
      await audit(tx, input, "STAFF_EMPLOYMENT_ENDED", updated.id, ["endsOn"]);
      return updated;
    });
  }

  async listAssignments(
    schoolId: string,
    staffId: string,
    query: StaffHistoryPageQuery,
  ): Promise<StaffEntityPage<StaffAssignmentRecord> | null> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId },
      select: { id: true },
    });
    if (!staff) return null;
    const [items, classTotal, subjectTotal] = await this.prisma.$transaction([
      this.prisma.$queryRaw<StaffAssignmentRaw[]>`
        SELECT 'CLASS' AS "kind", "id", "class_id" AS "classId", "stream_id" AS "streamId",
          NULL::uuid AS "classSubjectAssignmentId", "created_at" AS "createdAt", "ended_at" AS "endedAt"
        FROM "staff_class_assignments"
        WHERE "school_id" = ${schoolId}::uuid AND "staff_id" = ${staffId}::uuid
        UNION ALL
        SELECT 'SUBJECT' AS "kind", "id", NULL::uuid AS "classId", NULL::uuid AS "streamId",
          "class_subject_assignment_id" AS "classSubjectAssignmentId", "created_at" AS "createdAt",
          "ended_at" AS "endedAt"
        FROM "staff_subject_assignments"
        WHERE "school_id" = ${schoolId}::uuid AND "staff_id" = ${staffId}::uuid
        ORDER BY "createdAt" DESC, "id" ASC
        LIMIT ${query.limit} OFFSET ${query.offset}
      `,
      this.prisma.staffClassAssignment.count({ where: { schoolId, staffId } }),
      this.prisma.staffSubjectAssignment.count({ where: { schoolId, staffId } }),
    ]);
    return { items: items.map(toAssignmentRecord), total: classTotal + subjectTotal };
  }

  async createClassAssignment(
    input: CreateStaffClassAssignmentInput,
  ): Promise<StaffAssignmentRecord> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      await requireActiveStaff(tx, input.schoolId, input.staffId);
      const academicClass = await tx.academicClass.findFirst({
        where: { id: input.classId, schoolId: input.schoolId, status: AcademicRecordStatus.ACTIVE },
        select: { id: true },
      });
      if (!academicClass)
        throw storeError(
          "INVALID_RELATIONSHIP",
          "The active class is not available in this school.",
        );
      if (input.streamId) {
        const stream = await tx.classStream.findFirst({
          where: {
            id: input.streamId,
            classId: input.classId,
            schoolId: input.schoolId,
            status: AcademicRecordStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!stream)
          throw storeError(
            "INVALID_RELATIONSHIP",
            "The stream must be active and belong to the selected class.",
          );
      }
      const created = await tx.staffClassAssignment.create({
        data: {
          schoolId: input.schoolId,
          staffId: input.staffId,
          classId: input.classId,
          streamId: input.streamId ?? null,
        },
        select: classAssignmentSelect,
      });
      await audit(tx, input, "STAFF_CLASS_ASSIGNMENT_CREATED", created.id, ["classId", "streamId"]);
      return { kind: "CLASS", ...created };
    });
  }

  async createSubjectAssignment(
    input: CreateStaffSubjectAssignmentInput,
  ): Promise<StaffAssignmentRecord> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      await requireActiveStaff(tx, input.schoolId, input.staffId);
      const target = await tx.classSubjectAssignment.findFirst({
        where: {
          id: input.classSubjectAssignmentId,
          schoolId: input.schoolId,
          status: AcademicRecordStatus.ACTIVE,
          class: { status: AcademicRecordStatus.ACTIVE },
          subject: { status: AcademicRecordStatus.ACTIVE },
        },
        select: { id: true },
      });
      if (!target)
        throw storeError(
          "INVALID_RELATIONSHIP",
          "The active class-subject assignment is not available in this school.",
        );
      const created = await tx.staffSubjectAssignment.create({
        data: {
          schoolId: input.schoolId,
          staffId: input.staffId,
          classSubjectAssignmentId: input.classSubjectAssignmentId,
        },
        select: subjectAssignmentSelect,
      });
      await audit(tx, input, "STAFF_SUBJECT_ASSIGNMENT_CREATED", created.id, [
        "classSubjectAssignmentId",
      ]);
      return { kind: "SUBJECT", ...created };
    });
  }

  async endClassAssignment(input: EndStaffAssignmentInput): Promise<StaffAssignmentRecord | null> {
    return this.endAssignment(input, "class");
  }

  async endSubjectAssignment(
    input: EndStaffAssignmentInput,
  ): Promise<StaffAssignmentRecord | null> {
    return this.endAssignment(input, "subject");
  }

  private async endAssignment(
    input: EndStaffAssignmentInput,
    kind: "class" | "subject",
  ): Promise<StaffAssignmentRecord | null> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      if (kind === "class") {
        const current = await tx.staffClassAssignment.findFirst({
          where: { id: input.assignmentId, schoolId: input.schoolId, staffId: input.staffId },
          select: { id: true, endedAt: true },
        });
        if (!current) return null;
        if (current.endedAt)
          throw storeError("ALREADY_ENDED", "This assignment has already ended.");
        const changed = await tx.staffClassAssignment.updateMany({
          where: {
            id: current.id,
            schoolId: input.schoolId,
            staffId: input.staffId,
            endedAt: null,
          },
          data: { endedAt: new Date() },
        });
        if (changed.count !== 1)
          throw storeError("ALREADY_ENDED", "This assignment has already ended.");
        await audit(tx, input, "STAFF_CLASS_ASSIGNMENT_ENDED", current.id, ["endedAt"]);
        const updated = await tx.staffClassAssignment.findFirst({
          where: { id: current.id, schoolId: input.schoolId },
          select: classAssignmentSelect,
        });
        if (!updated) throw storeError("NOT_FOUND", "The assignment was not found.");
        return { kind: "CLASS", ...updated };
      }

      const current = await tx.staffSubjectAssignment.findFirst({
        where: { id: input.assignmentId, schoolId: input.schoolId, staffId: input.staffId },
        select: { id: true, endedAt: true, classSubjectAssignmentId: true },
      });
      if (!current) return null;
      if (current.endedAt) throw storeError("ALREADY_ENDED", "This assignment has already ended.");
      await lockStaff(tx, input.schoolId, input.staffId);
      const publishedLessons = await tx.timetableLesson.count({
        where: {
          schoolId: input.schoolId,
          staffId: input.staffId,
          classSubjectAssignmentId: current.classSubjectAssignmentId,
          timetable: { status: "PUBLISHED" },
        },
      });
      if (publishedLessons > 0) {
        throw storeError(
          "ACTIVE_TIMETABLE_ASSIGNMENTS_REMAIN",
          "Unpublish or reassign published timetable lessons before ending this subject assignment.",
        );
      }
      const unpublishedAssessments = await tx.assessment.count({
        where: {
          schoolId: input.schoolId,
          classSubjectAssignmentId: current.classSubjectAssignmentId,
          status: { not: "PUBLISHED" },
        },
      });
      if (unpublishedAssessments > 0) {
        throw storeError(
          "ACTIVE_ASSESSMENTS_REMAIN",
          "An active subject assignment is required until its assessments are published.",
        );
      }
      const changed = await tx.staffSubjectAssignment.updateMany({
        where: { id: current.id, schoolId: input.schoolId, staffId: input.staffId, endedAt: null },
        data: { endedAt: new Date() },
      });
      if (changed.count !== 1)
        throw storeError("ALREADY_ENDED", "This assignment has already ended.");
      await audit(tx, input, "STAFF_SUBJECT_ASSIGNMENT_ENDED", current.id, ["endedAt"]);
      const updated = await tx.staffSubjectAssignment.findFirst({
        where: { id: current.id, schoolId: input.schoolId },
        select: subjectAssignmentSelect,
      });
      if (!updated) throw storeError("NOT_FOUND", "The assignment was not found.");
      return { kind: "SUBJECT", ...updated };
    });
  }

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw storeError(
            "DUPLICATE",
            "A staff record, department, employment episode, or active assignment conflicts with an existing record.",
          );
        }
        if (error.code === "P2003") {
          throw storeError(
            "INVALID_RELATIONSHIP",
            "A referenced school, account, department, class, stream, or subject is invalid.",
          );
        }
        if (error.code === "P2034") {
          throw storeError("DUPLICATE", "The record changed concurrently. Retry the request.");
        }
      }
      throw error;
    }
  }
}

const departmentSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StaffDepartmentSelect;

const staffSelect = {
  id: true,
  staffNumber: true,
  givenName: true,
  middleName: true,
  familyName: true,
  contactEmail: true,
  contactPhone: true,
  positionTitle: true,
  departmentId: true,
  userId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  department: { select: departmentSelect },
} satisfies Prisma.StaffSelect;

const employmentSelect = {
  id: true,
  staffId: true,
  positionTitle: true,
  startsOn: true,
  endsOn: true,
  createdAt: true,
} satisfies Prisma.StaffEmploymentSelect;

const classAssignmentSelect = {
  id: true,
  classId: true,
  streamId: true,
  createdAt: true,
  endedAt: true,
} satisfies Prisma.StaffClassAssignmentSelect;

const subjectAssignmentSelect = {
  id: true,
  classSubjectAssignmentId: true,
  createdAt: true,
  endedAt: true,
} satisfies Prisma.StaffSubjectAssignmentSelect;

type StaffAssignmentRaw = {
  kind: "CLASS" | "SUBJECT";
  id: string;
  classId: string | null;
  streamId: string | null;
  classSubjectAssignmentId: string | null;
  createdAt: Date;
  endedAt: Date | null;
};

function toAssignmentRecord(record: StaffAssignmentRaw): StaffAssignmentRecord {
  if (record.kind === "CLASS") {
    if (record.classId === null) {
      throw storeError("INVALID_RELATIONSHIP", "A class assignment is missing its class.");
    }
    return {
      kind: "CLASS",
      id: record.id,
      classId: record.classId,
      streamId: record.streamId,
      createdAt: record.createdAt,
      endedAt: record.endedAt,
    };
  }
  if (record.classSubjectAssignmentId === null) {
    throw storeError(
      "INVALID_RELATIONSHIP",
      "A subject assignment is missing its class-subject record.",
    );
  }
  return {
    kind: "SUBJECT",
    id: record.id,
    classSubjectAssignmentId: record.classSubjectAssignmentId,
    createdAt: record.createdAt,
    endedAt: record.endedAt,
  };
}

async function requireActiveSchool(tx: Prisma.TransactionClient, schoolId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "schools"
    WHERE "id" = ${schoolId}::uuid AND "status" = ${SchoolStatus.ACTIVE}::"SchoolStatus"
    FOR SHARE
  `;
  if (rows.length !== 1) throw storeError("SCHOOL_NOT_FOUND", "The school is not available.");
}

async function requireActiveStaff(
  tx: Prisma.TransactionClient,
  schoolId: string,
  staffId: string,
): Promise<void> {
  const staff = await tx.staff.findFirst({
    where: { id: staffId, schoolId },
    select: { status: true },
  });
  if (!staff) throw storeError("NOT_FOUND", "The staff record was not found.");
  if (staff.status !== PrismaStaffStatus.ACTIVE) {
    throw storeError("RECORD_INACTIVE", "Assignments require an active staff record.");
  }
}

async function validateStaffReferences(
  tx: Prisma.TransactionClient,
  schoolId: string,
  departmentId: string | null | undefined,
  userId: string | null | undefined,
): Promise<void> {
  if (departmentId) {
    const department = await tx.staffDepartment.findFirst({
      where: { id: departmentId, schoolId, status: AcademicRecordStatus.ACTIVE },
      select: { id: true },
    });
    if (!department)
      throw storeError(
        "INVALID_RELATIONSHIP",
        "The department must be active and belong to this school.",
      );
  }
  if (userId) {
    const membership = await tx.schoolMembership.findFirst({
      where: { schoolId, userId },
      select: { id: true },
    });
    if (!membership)
      throw storeError(
        "INVALID_RELATIONSHIP",
        "The linked account must have a membership in this school.",
      );
  }
}

async function audit(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; actorUserId: string; requestId: string },
  eventType: string,
  targetId: string,
  changedFields: string[],
): Promise<void> {
  await tx.securityAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      schoolId: input.schoolId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: { targetId, changedFields },
    },
  });
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function normalizeStaffNumber(value: string): string {
  return value.trim().toLocaleUpperCase("en");
}

function asDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw storeError("INVALID_DATE_RANGE", "The supplied date is invalid.");
  }
  return date;
}

function storeError(
  code: ConstructorParameters<typeof StaffStoreError>[0],
  message: string,
): StaffStoreError {
  return new StaffStoreError(code, message);
}

async function lockStaff(tx: Prisma.TransactionClient, schoolId: string, staffId: string) {
  await tx.$queryRaw`SELECT id FROM staff WHERE school_id = ${schoolId}::uuid AND id = ${staffId}::uuid FOR UPDATE`;
}
