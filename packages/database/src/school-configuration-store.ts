import {
  AcademicRecordStatus as PrismaAcademicRecordStatus,
  Prisma,
  SchoolStatus,
  type AcademicClass,
  type AcademicYear,
  type Subject,
  type PrismaClient,
} from "@prisma/client";
import type {
  AcademicRecordStatus,
  ConfigurationListQuery,
  ConfigurationPage,
  ConfigurationRecord,
  ConfigurationResource,
  CreateConfigurationInput,
  DeactivationOutcome,
  DeactivateConfigurationInput,
  SchoolConfigurationStore,
  SchoolProfileRecord,
  SchoolProfileUpdate,
  UpdateConfigurationInput,
} from "./contracts.js";

export class SchoolConfigurationStoreError extends Error {
  constructor(
    readonly code:
      | "CONFIGURATION_CONFLICT"
      | "INVALID_RELATIONSHIP"
      | "CONCURRENT_CONFIGURATION_CHANGE"
      | "SCHOOL_NOT_FOUND"
      | "PARENT_NOT_FOUND"
      | "PARENT_INACTIVE"
      | "INVALID_PERIOD"
      | "CONFIGURATION_INACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "SchoolConfigurationStoreError";
  }
}

export class PrismaSchoolConfigurationStore implements SchoolConfigurationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getSchoolProfile(schoolId: string): Promise<SchoolProfileRecord | null> {
    return this.prisma.school.findFirst({
      where: { id: schoolId, status: SchoolStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async updateSchoolProfile(input: {
    schoolId: string;
    actorUserId: string;
    requestId: string;
    data: SchoolProfileUpdate;
  }): Promise<SchoolProfileRecord | null> {
    return this.transaction(async (tx) => {
      if (!(await lockActiveSchool(tx, input.schoolId))) return null;
      const changed = await tx.school.updateMany({
        where: { id: input.schoolId, status: SchoolStatus.ACTIVE },
        data: input.data,
      });
      if (changed.count !== 1) return null;
      await recordConfigurationAudit(tx, {
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        eventType: "SCHOOL_PROFILE_UPDATED",
        metadata: { changedFields: Object.keys(input.data) },
      });
      return tx.school.findFirst({
        where: { id: input.schoolId, status: SchoolStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          contactEmail: true,
          contactPhone: true,
          status: true,
          updatedAt: true,
        },
      });
    });
  }

  async listConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    switch (resource) {
      case "academicYears":
        return this.listAcademicYears(schoolId, query);
      case "terms":
        return this.listTerms(schoolId, query);
      case "classes":
        return this.listClasses(schoolId, query);
      case "streams":
        return this.listStreams(schoolId, query);
      case "subjects":
        return this.listSubjects(schoolId, query);
      case "classSubjects":
        return this.listClassSubjects(schoolId, query);
    }
  }

  async getConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    id: string,
  ): Promise<ConfigurationRecord | null> {
    switch (resource) {
      case "academicYears":
        return this.prisma.academicYear.findFirst({
          where: { id, schoolId },
          select: academicYearSelect,
        });
      case "terms":
        return this.prisma.term.findFirst({ where: { id, schoolId }, select: termSelect });
      case "classes":
        return this.prisma.academicClass.findFirst({
          where: { id, schoolId },
          select: academicClassSelect,
        });
      case "streams":
        return this.prisma.classStream.findFirst({
          where: { id, schoolId },
          select: classStreamSelect,
        });
      case "subjects":
        return this.prisma.subject.findFirst({ where: { id, schoolId }, select: subjectSelect });
      case "classSubjects":
        return this.prisma.classSubjectAssignment.findFirst({
          where: { id, schoolId },
          select: classSubjectSelect,
        });
    }
  }

  async createConfiguration(input: CreateConfigurationInput): Promise<ConfigurationRecord> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      switch (input.resource) {
        case "academicYears": {
          const startsOn = asDate(input.data.startsOn);
          const endsOn = asDate(input.data.endsOn);
          assertValidPeriod(startsOn, endsOn);
          await ensureNoYearOverlap(tx, input.schoolId, startsOn, endsOn);
          const created = await tx.academicYear.create({
            data: {
              schoolId: input.schoolId,
              name: input.data.name,
              nameKey: normalizeName(input.data.name),
              startsOn,
              endsOn,
            },
            select: academicYearSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_YEAR_CREATED", created.id);
          return created;
        }
        case "terms": {
          const year = await lockActiveYear(tx, input.schoolId, input.data.academicYearId);
          const startsOn = asDate(input.data.startsOn);
          const endsOn = asDate(input.data.endsOn);
          assertWithinPeriod(startsOn, endsOn, year.startsOn, year.endsOn);
          await ensureNoTermOverlap(tx, input.schoolId, year.id, startsOn, endsOn);
          const created = await tx.term.create({
            data: {
              schoolId: input.schoolId,
              academicYearId: year.id,
              name: input.data.name,
              nameKey: normalizeName(input.data.name),
              startsOn,
              endsOn,
            },
            select: termSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_TERM_CREATED", created.id);
          return created;
        }
        case "classes": {
          await lockActiveYear(tx, input.schoolId, input.data.academicYearId);
          const created = await tx.academicClass.create({
            data: {
              schoolId: input.schoolId,
              academicYearId: input.data.academicYearId,
              name: input.data.name,
              nameKey: normalizeName(input.data.name),
            },
            select: academicClassSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_CLASS_CREATED", created.id);
          return created;
        }
        case "streams": {
          const classRecord = await lockActiveClass(tx, input.schoolId, input.data.classId);
          await lockActiveYear(tx, input.schoolId, classRecord.academicYearId);
          const created = await tx.classStream.create({
            data: {
              schoolId: input.schoolId,
              classId: classRecord.id,
              name: input.data.name,
              nameKey: normalizeName(input.data.name),
            },
            select: classStreamSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_STREAM_CREATED", created.id);
          return created;
        }
        case "subjects": {
          const created = await tx.subject.create({
            data: {
              schoolId: input.schoolId,
              name: input.data.name,
              nameKey: normalizeName(input.data.name),
            },
            select: subjectSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_SUBJECT_CREATED", created.id);
          return created;
        }
        case "classSubjects": {
          const classRecord = await lockActiveClass(tx, input.schoolId, input.data.classId);
          await lockActiveYear(tx, input.schoolId, classRecord.academicYearId);
          const subject = await lockActiveSubject(tx, input.schoolId, input.data.subjectId);
          const created = await tx.classSubjectAssignment.create({
            data: {
              schoolId: input.schoolId,
              classId: classRecord.id,
              subjectId: subject.id,
            },
            select: classSubjectSelect,
          });
          await auditRecord(tx, input, "CLASS_SUBJECT_ASSIGNED", created.id);
          return created;
        }
      }
    });
  }

  async updateConfiguration(input: UpdateConfigurationInput): Promise<ConfigurationRecord | null> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      switch (input.resource) {
        case "academicYears": {
          const current = await tx.academicYear.findFirst({
            where: { id: input.id, schoolId: input.schoolId },
            select: academicYearSelect,
          });
          if (!current) return null;
          assertRecordActive(current.status);
          const startsOn = input.data.startsOn ? asDate(input.data.startsOn) : current.startsOn;
          const endsOn = input.data.endsOn ? asDate(input.data.endsOn) : current.endsOn;
          assertValidPeriod(startsOn, endsOn);
          await ensureNoYearOverlap(tx, input.schoolId, startsOn, endsOn, current.id);
          const childTerms = await tx.term.findMany({
            where: { schoolId: input.schoolId, academicYearId: current.id },
            select: { startsOn: true, endsOn: true },
          });
          if (childTerms.some((term) => term.startsOn < startsOn || term.endsOn > endsOn)) {
            throw new SchoolConfigurationStoreError(
              "INVALID_RELATIONSHIP",
              "The academic year dates cannot exclude an existing term.",
            );
          }
          const updated = await tx.academicYear.update({
            where: { id: current.id },
            data: {
              ...(input.data.name !== undefined ? { name: input.data.name } : {}),
              ...(input.data.name !== undefined ? { nameKey: normalizeName(input.data.name) } : {}),
              startsOn,
              endsOn,
            },
            select: academicYearSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_YEAR_UPDATED", updated.id, input.data);
          return updated;
        }
        case "terms": {
          const current = await tx.term.findFirst({
            where: { id: input.id, schoolId: input.schoolId },
            select: termSelect,
          });
          if (!current) return null;
          assertRecordActive(current.status);
          const year = await lockActiveYear(tx, input.schoolId, current.academicYearId);
          const startsOn = input.data.startsOn ? asDate(input.data.startsOn) : current.startsOn;
          const endsOn = input.data.endsOn ? asDate(input.data.endsOn) : current.endsOn;
          assertWithinPeriod(startsOn, endsOn, year.startsOn, year.endsOn);
          await ensureNoTermOverlap(tx, input.schoolId, year.id, startsOn, endsOn, current.id);
          const updated = await tx.term.update({
            where: { id: current.id },
            data: {
              ...(input.data.name !== undefined ? { name: input.data.name } : {}),
              ...(input.data.name !== undefined ? { nameKey: normalizeName(input.data.name) } : {}),
              startsOn,
              endsOn,
            },
            select: termSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_TERM_UPDATED", updated.id, input.data);
          return updated;
        }
        case "classes": {
          const current = await tx.academicClass.findFirst({
            where: { id: input.id, schoolId: input.schoolId },
            select: academicClassSelect,
          });
          if (!current) return null;
          assertRecordActive(current.status);
          await lockActiveYear(tx, input.schoolId, current.academicYearId);
          const updated = await tx.academicClass.update({
            where: { id: current.id },
            data: {
              ...(input.data.name !== undefined
                ? { name: input.data.name, nameKey: normalizeName(input.data.name) }
                : {}),
            },
            select: academicClassSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_CLASS_UPDATED", updated.id, input.data);
          return updated;
        }
        case "streams": {
          const current = await tx.classStream.findFirst({
            where: { id: input.id, schoolId: input.schoolId },
            select: classStreamSelect,
          });
          if (!current) return null;
          assertRecordActive(current.status);
          const classRecord = await lockActiveClass(tx, input.schoolId, current.classId);
          await lockActiveYear(tx, input.schoolId, classRecord.academicYearId);
          const updated = await tx.classStream.update({
            where: { id: current.id },
            data: {
              ...(input.data.name !== undefined
                ? { name: input.data.name, nameKey: normalizeName(input.data.name) }
                : {}),
            },
            select: classStreamSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_STREAM_UPDATED", updated.id, input.data);
          return updated;
        }
        case "subjects": {
          const current = await tx.subject.findFirst({
            where: { id: input.id, schoolId: input.schoolId },
            select: subjectSelect,
          });
          if (!current) return null;
          assertRecordActive(current.status);
          const updated = await tx.subject.update({
            where: { id: current.id },
            data: {
              ...(input.data.name !== undefined
                ? { name: input.data.name, nameKey: normalizeName(input.data.name) }
                : {}),
            },
            select: subjectSelect,
          });
          await auditRecord(tx, input, "ACADEMIC_SUBJECT_UPDATED", updated.id, input.data);
          return updated;
        }
      }
    });
  }

  async deactivateConfiguration(input: DeactivateConfigurationInput): Promise<DeactivationOutcome> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      const result = await deactivateInTransaction(tx, input);
      if (result === "DEACTIVATED") {
        await auditRecord(tx, input, `${auditPrefix(input.resource)}_DEACTIVATED`, input.id);
      }
      return result;
    });
  }

  private async listAcademicYears(
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const where: Prisma.AcademicYearWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicYear.findMany({
        where,
        select: academicYearSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.AcademicYearOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.academicYear.count({ where }),
    ]);
    return { items, total };
  }

  private async listTerms(
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const where: Prisma.TermWhereInput = {
      schoolId,
      ...(query.parentId ? { academicYearId: query.parentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.term.findMany({
        where,
        select: termSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.TermOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.term.count({ where }),
    ]);
    return { items, total };
  }

  private async listClasses(
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const where: Prisma.AcademicClassWhereInput = {
      schoolId,
      ...(query.parentId ? { academicYearId: query.parentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicClass.findMany({
        where,
        select: academicClassSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.AcademicClassOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.academicClass.count({ where }),
    ]);
    return { items, total };
  }

  private async listStreams(
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const where: Prisma.ClassStreamWhereInput = {
      schoolId,
      ...(query.parentId ? { classId: query.parentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.classStream.findMany({
        where,
        select: classStreamSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.ClassStreamOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.classStream.count({ where }),
    ]);
    return { items, total };
  }

  private async listSubjects(
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const where: Prisma.SubjectWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        select: subjectSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.SubjectOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.subject.count({ where }),
    ]);
    return { items, total };
  }

  private async listClassSubjects(
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const where: Prisma.ClassSubjectAssignmentWhereInput = {
      schoolId,
      ...(query.parentId ? { classId: query.parentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { subject: { name: { contains: query.search, mode: "insensitive" } } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.classSubjectAssignment.findMany({
        where,
        select: classSubjectSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.ClassSubjectAssignmentOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.classSubjectAssignment.count({ where }),
    ]);
    return { items, total };
  }

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new SchoolConfigurationStoreError(
            "CONFIGURATION_CONFLICT",
            "A record with the same name or relationship already exists.",
          );
        }
        if (error.code === "P2003") {
          throw new SchoolConfigurationStoreError(
            "INVALID_RELATIONSHIP",
            "The requested academic relationship is invalid.",
          );
        }
        if (error.code === "P2034") {
          throw new SchoolConfigurationStoreError(
            "CONCURRENT_CONFIGURATION_CHANGE",
            "The configuration changed concurrently. Retry the request.",
          );
        }
      }
      throw error;
    }
  }
}

const academicYearSelect = {
  id: true,
  name: true,
  startsOn: true,
  endsOn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AcademicYearSelect;

const termSelect = {
  id: true,
  academicYearId: true,
  name: true,
  startsOn: true,
  endsOn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TermSelect;

const academicClassSelect = {
  id: true,
  academicYearId: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AcademicClassSelect;

const classStreamSelect = {
  id: true,
  classId: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassStreamSelect;

const subjectSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubjectSelect;

const classSubjectSelect = {
  id: true,
  classId: true,
  subjectId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassSubjectAssignmentSelect;

async function requireActiveSchool(tx: Prisma.TransactionClient, schoolId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "schools"
    WHERE "id" = ${schoolId}::uuid AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length === 0) throw notFound("SCHOOL_NOT_FOUND");
}

async function lockActiveSchool(tx: Prisma.TransactionClient, schoolId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "schools"
    WHERE "id" = ${schoolId}::uuid AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  return rows.length === 1;
}

async function lockActiveYear(
  tx: Prisma.TransactionClient,
  schoolId: string,
  yearId: string,
): Promise<AcademicYear> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "academic_years"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${yearId}::uuid
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length === 0) {
    const existing = await tx.academicYear.findFirst({ where: { id: yearId, schoolId } });
    if (existing) throw parentInactive("The academic year is inactive.");
    throw notFound("ACADEMIC_YEAR_NOT_FOUND");
  }
  const year = await tx.academicYear.findFirst({ where: { id: yearId, schoolId } });
  if (!year) throw notFound("ACADEMIC_YEAR_NOT_FOUND");
  return year;
}

async function lockActiveClass(
  tx: Prisma.TransactionClient,
  schoolId: string,
  classId: string,
): Promise<AcademicClass> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "academic_classes"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${classId}::uuid
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length === 0) {
    const existing = await tx.academicClass.findFirst({ where: { id: classId, schoolId } });
    if (existing) throw parentInactive("The class is inactive.");
    throw notFound("CLASS_NOT_FOUND");
  }
  const classRecord = await tx.academicClass.findFirst({ where: { id: classId, schoolId } });
  if (!classRecord) throw notFound("CLASS_NOT_FOUND");
  return classRecord;
}

async function lockActiveSubject(
  tx: Prisma.TransactionClient,
  schoolId: string,
  subjectId: string,
): Promise<Subject> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "subjects"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${subjectId}::uuid
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length === 0) {
    const existing = await tx.subject.findFirst({ where: { id: subjectId, schoolId } });
    if (existing) throw parentInactive("The subject is inactive.");
    throw notFound("SUBJECT_NOT_FOUND");
  }
  const subject = await tx.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!subject) throw notFound("SUBJECT_NOT_FOUND");
  return subject;
}

async function ensureNoYearOverlap(
  tx: Prisma.TransactionClient,
  schoolId: string,
  startsOn: Date,
  endsOn: Date,
  excludeId?: string,
): Promise<void> {
  const overlap = await tx.academicYear.findFirst({
    where: {
      schoolId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsOn: { lte: endsOn },
      endsOn: { gte: startsOn },
    },
    select: { id: true },
  });
  if (overlap) throw overlapError();
}

async function ensureNoTermOverlap(
  tx: Prisma.TransactionClient,
  schoolId: string,
  academicYearId: string,
  startsOn: Date,
  endsOn: Date,
  excludeId?: string,
): Promise<void> {
  const overlap = await tx.term.findFirst({
    where: {
      schoolId,
      academicYearId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsOn: { lte: endsOn },
      endsOn: { gte: startsOn },
    },
    select: { id: true },
  });
  if (overlap) throw overlapError();
}

function assertWithinPeriod(
  startsOn: Date,
  endsOn: Date,
  parentStartsOn: Date,
  parentEndsOn: Date,
): void {
  if (startsOn > endsOn || startsOn < parentStartsOn || endsOn > parentEndsOn) {
    throw new SchoolConfigurationStoreError(
      "INVALID_PERIOD",
      "The term dates must be within the academic year.",
    );
  }
}

function assertValidPeriod(startsOn: Date, endsOn: Date): void {
  if (startsOn > endsOn) {
    throw new SchoolConfigurationStoreError(
      "INVALID_PERIOD",
      "The start date must be on or before the end date.",
    );
  }
}

async function deactivateInTransaction(
  tx: Prisma.TransactionClient,
  input: DeactivateConfigurationInput,
): Promise<DeactivationOutcome> {
  switch (input.resource) {
    case "academicYears": {
      const current = await tx.academicYear.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
      });
      if (!current) return "NOT_FOUND";
      if (current.status === PrismaAcademicRecordStatus.INACTIVE) return "ALREADY_INACTIVE";
      const [terms, classes, publishedTimetables] = await Promise.all([
        tx.term.count({
          where: { schoolId: input.schoolId, academicYearId: current.id, status: "ACTIVE" },
        }),
        tx.academicClass.count({
          where: { schoolId: input.schoolId, academicYearId: current.id, status: "ACTIVE" },
        }),
        tx.timetable.count({
          where: { schoolId: input.schoolId, academicYearId: current.id, status: "PUBLISHED" },
        }),
      ]);
      if (terms > 0 || classes > 0 || publishedTimetables > 0) throw activeChildrenError();
      await tx.academicYear.updateMany({
        where: { id: current.id, schoolId: input.schoolId, status: "ACTIVE" },
        data: { status: PrismaAcademicRecordStatus.INACTIVE },
      });
      return "DEACTIVATED";
    }
    case "terms": {
      const current = await tx.term.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: { status: true },
      });
      if (!current) return "NOT_FOUND";
      if (current.status === PrismaAcademicRecordStatus.INACTIVE) return "ALREADY_INACTIVE";
      const result = await tx.term.updateMany({
        where: { id: input.id, schoolId: input.schoolId, status: "ACTIVE" },
        data: { status: PrismaAcademicRecordStatus.INACTIVE },
      });
      return result.count === 1 ? "DEACTIVATED" : "NOT_FOUND";
    }
    case "classes": {
      const current = await tx.academicClass.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
      });
      if (!current) return "NOT_FOUND";
      if (current.status === PrismaAcademicRecordStatus.INACTIVE) return "ALREADY_INACTIVE";
      const [streams, assignments, staffAssignments, publishedLessons] = await Promise.all([
        tx.classStream.count({
          where: { schoolId: input.schoolId, classId: current.id, status: "ACTIVE" },
        }),
        tx.classSubjectAssignment.count({
          where: { schoolId: input.schoolId, classId: current.id, status: "ACTIVE" },
        }),
        tx.staffClassAssignment.count({
          where: { schoolId: input.schoolId, classId: current.id, endedAt: null },
        }),
        tx.timetableLesson.count({
          where: {
            schoolId: input.schoolId,
            classId: current.id,
            timetable: { status: "PUBLISHED" },
          },
        }),
      ]);
      if (streams > 0 || assignments > 0 || staffAssignments > 0 || publishedLessons > 0) {
        throw activeChildrenError();
      }
      await tx.academicClass.updateMany({
        where: { id: current.id, schoolId: input.schoolId, status: "ACTIVE" },
        data: { status: PrismaAcademicRecordStatus.INACTIVE },
      });
      return "DEACTIVATED";
    }
    case "streams": {
      const current = await tx.classStream.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: { status: true },
      });
      if (!current) return "NOT_FOUND";
      if (current.status === PrismaAcademicRecordStatus.INACTIVE) return "ALREADY_INACTIVE";
      const [assignments, publishedLessons] = await Promise.all([
        tx.staffClassAssignment.count({
          where: { schoolId: input.schoolId, streamId: input.id, endedAt: null },
        }),
        tx.timetableLesson.count({
          where: {
            schoolId: input.schoolId,
            streamId: input.id,
            timetable: { status: "PUBLISHED" },
          },
        }),
      ]);
      if (assignments > 0 || publishedLessons > 0) throw activeChildrenError();
      const result = await tx.classStream.updateMany({
        where: { id: input.id, schoolId: input.schoolId, status: "ACTIVE" },
        data: { status: PrismaAcademicRecordStatus.INACTIVE },
      });
      return result.count === 1 ? "DEACTIVATED" : "NOT_FOUND";
    }
    case "subjects": {
      const current = await tx.subject.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
      });
      if (!current) return "NOT_FOUND";
      if (current.status === PrismaAcademicRecordStatus.INACTIVE) return "ALREADY_INACTIVE";
      const [assignments, publishedLessons] = await Promise.all([
        tx.classSubjectAssignment.count({
          where: { schoolId: input.schoolId, subjectId: current.id, status: "ACTIVE" },
        }),
        tx.timetableLesson.count({
          where: {
            schoolId: input.schoolId,
            classSubject: { subjectId: current.id },
            timetable: { status: "PUBLISHED" },
          },
        }),
      ]);
      if (assignments > 0 || publishedLessons > 0) throw activeChildrenError();
      await tx.subject.updateMany({
        where: { id: current.id, schoolId: input.schoolId, status: "ACTIVE" },
        data: { status: PrismaAcademicRecordStatus.INACTIVE },
      });
      return "DEACTIVATED";
    }
    case "classSubjects": {
      const current = await tx.classSubjectAssignment.findFirst({
        where: { id: input.id, schoolId: input.schoolId },
        select: { status: true },
      });
      if (!current) return "NOT_FOUND";
      if (current.status === PrismaAcademicRecordStatus.INACTIVE) return "ALREADY_INACTIVE";
      const [staffAssignments, publishedLessons] = await Promise.all([
        tx.staffSubjectAssignment.count({
          where: { schoolId: input.schoolId, classSubjectAssignmentId: input.id, endedAt: null },
        }),
        tx.timetableLesson.count({
          where: {
            schoolId: input.schoolId,
            classSubjectAssignmentId: input.id,
            timetable: { status: "PUBLISHED" },
          },
        }),
      ]);
      if (staffAssignments > 0 || publishedLessons > 0) throw activeChildrenError();
      const result = await tx.classSubjectAssignment.updateMany({
        where: { id: input.id, schoolId: input.schoolId, status: "ACTIVE" },
        data: { status: PrismaAcademicRecordStatus.INACTIVE },
      });
      return result.count === 1 ? "DEACTIVATED" : "NOT_FOUND";
    }
  }
}

async function recordConfigurationAudit(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    actorUserId: string;
    requestId: string;
    eventType: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.securityAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      schoolId: input.schoolId,
      eventType: input.eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: input.metadata ?? {},
    },
  });
}

function auditRecord(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; actorUserId: string; requestId: string },
  eventType: string,
  recordId: string,
  changed?: object,
): Promise<void> {
  return recordConfigurationAudit(tx, {
    ...input,
    eventType,
    metadata: {
      recordId,
      ...(changed ? { changedFields: Object.keys(changed) } : {}),
    },
  });
}

function auditPrefix(resource: ConfigurationResource): string {
  switch (resource) {
    case "academicYears":
      return "ACADEMIC_YEAR";
    case "terms":
      return "ACADEMIC_TERM";
    case "classes":
      return "ACADEMIC_CLASS";
    case "streams":
      return "ACADEMIC_STREAM";
    case "subjects":
      return "ACADEMIC_SUBJECT";
    case "classSubjects":
      return "CLASS_SUBJECT_ASSIGNMENT";
  }
}

function assertRecordActive(status: AcademicRecordStatus): void {
  if (status !== "ACTIVE") {
    throw new SchoolConfigurationStoreError(
      "CONFIGURATION_INACTIVE",
      "Inactive academic records cannot be edited or reactivated.",
    );
  }
}

function notFound(resource: string): SchoolConfigurationStoreError {
  const code = resource === "SCHOOL_NOT_FOUND" ? "SCHOOL_NOT_FOUND" : "PARENT_NOT_FOUND";
  return new SchoolConfigurationStoreError(code, `${resource} was not found.`);
}

function parentInactive(message: string): SchoolConfigurationStoreError {
  return new SchoolConfigurationStoreError("PARENT_INACTIVE", message);
}

function overlapError(): SchoolConfigurationStoreError {
  return new SchoolConfigurationStoreError(
    "CONFIGURATION_CONFLICT",
    "The academic period overlaps an existing period.",
  );
}

function activeChildrenError(): SchoolConfigurationStoreError {
  return new SchoolConfigurationStoreError(
    "CONFIGURATION_CONFLICT",
    "Deactivate active child records and assignments before deactivating this record.",
  );
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeName(value: string): string {
  return value.toLowerCase();
}
