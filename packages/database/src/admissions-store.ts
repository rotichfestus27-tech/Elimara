import { Prisma, SchoolStatus, type PrismaClient } from "@prisma/client";
import type {
  AdmissionApplicationPageQuery,
  AdmissionApplicationRecord,
  AdmissionApplicationStatus,
  AdmissionsStore,
  AdmitApplicationInput,
  AdmitApplicationResult,
  ApplicationTransitionInput,
  CreateAdmissionApplicationInput,
  CreateGuardianInput,
  EntityPage,
  GuardianPageQuery,
  GuardianProfileRevisionRecord,
  GuardianRecord,
  ProfileHistoryQuery,
  StudentGuardianRecord,
  StudentPageQuery,
  StudentPlacementRecord,
  StudentProfileRevisionRecord,
  StudentRecord,
  UpdateAdmissionApplicationInput,
  UpdateGuardianInput,
  UpdateStudentGuardianInput,
  UpdateStudentProfileInput,
  ChangeStudentStatusInput,
  CreateStudentGuardianInput,
} from "./admissions-contracts.js";

export class AdmissionsStoreError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "PARENT_NOT_FOUND"
      | "INVALID_TRANSITION"
      | "CONFIGURATION_INACTIVE"
      | "CONFIGURATION_CONFLICT"
      | "IDEMPOTENCY_KEY_REUSED"
      | "CONCURRENT_CHANGE"
      | "ADMISSION_NUMBER_EXHAUSTED"
      | "CONTACT_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "AdmissionsStoreError";
  }
}

export class PrismaAdmissionsStore implements AdmissionsStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createApplication(
    input: CreateAdmissionApplicationInput,
  ): Promise<AdmissionApplicationRecord> {
    try {
      return await this.transaction(async (tx) => {
        await lockActiveSchool(tx, input.schoolId);
        const existing = await tx.admissionApplication.findFirst({
          where: {
            schoolId: input.schoolId,
            createdByUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
          },
          select: { requestFingerprint: true, id: true },
        });
        if (existing) {
          if (existing.requestFingerprint !== input.requestFingerprint) {
            throw idempotencyConflict();
          }
          const replay = await findApplication(tx, input.schoolId, existing.id);
          if (!replay) throw notFound();
          return replay;
        }

        const guardians = [];
        for (const guardian of input.guardians) {
          if ("existingGuardianId" in guardian) {
            const existingGuardian = await tx.guardian.findFirst({
              where: {
                schoolId: input.schoolId,
                id: guardian.existingGuardianId,
              },
              select: {
                id: true,
                givenName: true,
                middleName: true,
                familyName: true,
                email: true,
                phone: true,
              },
            });
            if (!existingGuardian) throw parentNotFound();
            guardians.push({
              existingGuardianId: existingGuardian.id,
              givenName: existingGuardian.givenName,
              middleName: existingGuardian.middleName,
              familyName: existingGuardian.familyName,
              email: existingGuardian.email,
              phone: existingGuardian.phone,
              relationship: guardian.relationship,
              authorizedAccess: guardian.authorizedAccess,
            });
          } else {
            guardians.push({
              existingGuardianId: null,
              givenName: guardian.givenName,
              middleName: guardian.middleName ?? null,
              familyName: guardian.familyName,
              email: guardian.email ?? null,
              phone: guardian.phone ?? null,
              relationship: guardian.relationship,
              authorizedAccess: guardian.authorizedAccess,
            });
          }
        }

        const possibleDuplicate = await hasPossibleDuplicate(
          tx,
          input.schoolId,
          input.givenName,
          input.familyName,
          input.dateOfBirth ? asDate(input.dateOfBirth) : null,
        );
        const application = await tx.admissionApplication.create({
          data: {
            schoolId: input.schoolId,
            createdByUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            givenName: input.givenName,
            middleName: input.middleName ?? null,
            familyName: input.familyName,
            dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null,
            possibleDuplicate,
            guardians: { create: guardians },
          },
          select: { id: true },
        });
        await recordApplicationTransition(tx, {
          schoolId: input.schoolId,
          applicationId: application.id,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          fromStatus: null,
          toStatus: "DRAFT",
        });
        await recordAudit(tx, input, "ADMISSION_APPLICATION_CREATED", application.id);
        const created = await findApplication(tx, input.schoolId, application.id);
        if (!created) throw notFound();
        return created;
      });
    } catch (error) {
      if (
        isUniqueViolation(error) ||
        (error instanceof AdmissionsStoreError && error.code === "CONFIGURATION_CONFLICT")
      ) {
        const existing = await this.findApplicationByIdempotencyKey(
          input.schoolId,
          input.actorUserId,
          input.idempotencyKey,
        );
        if (existing?.requestFingerprint === input.requestFingerprint) {
          const replay = await this.getApplication(input.schoolId, existing.id);
          if (replay) return replay;
        }
        if (existing) throw idempotencyConflict();
        if (isUniqueViolation(error)) {
          throw new AdmissionsStoreError(
            "CONFIGURATION_CONFLICT",
            "A conflicting school record already exists.",
          );
        }
      }
      throw error;
    }
  }

  async listApplications(
    schoolId: string,
    query: AdmissionApplicationPageQuery,
  ): Promise<EntityPage<AdmissionApplicationRecord>> {
    const where: Prisma.AdmissionApplicationWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { givenName: { contains: query.search, mode: "insensitive" } },
              { middleName: { contains: query.search, mode: "insensitive" } },
              { familyName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.admissionApplication.findMany({
        where,
        select: applicationSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.AdmissionApplicationOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.admissionApplication.count({ where }),
    ]);
    return { items: items.map(toApplicationRecord), total };
  }

  async getApplication(schoolId: string, id: string): Promise<AdmissionApplicationRecord | null> {
    const application = await this.prisma.admissionApplication.findFirst({
      where: { schoolId, id },
      select: applicationSelect,
    });
    return application ? toApplicationRecord(application) : null;
  }

  async updateDraftApplication(
    input: UpdateAdmissionApplicationInput,
  ): Promise<AdmissionApplicationRecord | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await lockApplication(tx, input.schoolId, input.id);
      if (!current) return null;
      if (current.status !== "DRAFT") throw invalidTransition();
      const guardians = [];
      for (const guardian of input.guardians) {
        if ("existingGuardianId" in guardian) {
          const existingGuardian = await tx.guardian.findFirst({
            where: {
              schoolId: input.schoolId,
              id: guardian.existingGuardianId,
            },
            select: {
              id: true,
              givenName: true,
              middleName: true,
              familyName: true,
              email: true,
              phone: true,
            },
          });
          if (!existingGuardian) throw parentNotFound();
          guardians.push({
            existingGuardianId: existingGuardian.id,
            givenName: existingGuardian.givenName,
            middleName: existingGuardian.middleName,
            familyName: existingGuardian.familyName,
            email: existingGuardian.email,
            phone: existingGuardian.phone,
            relationship: guardian.relationship,
            authorizedAccess: guardian.authorizedAccess,
          });
        } else {
          guardians.push({
            existingGuardianId: null,
            givenName: guardian.givenName,
            middleName: guardian.middleName ?? null,
            familyName: guardian.familyName,
            email: guardian.email ?? null,
            phone: guardian.phone ?? null,
            relationship: guardian.relationship,
            authorizedAccess: guardian.authorizedAccess,
          });
        }
      }
      await tx.admissionApplicationGuardian.deleteMany({
        where: { schoolId: input.schoolId, applicationId: input.id },
      });
      await tx.admissionApplication.update({
        where: { id: input.id },
        data: {
          givenName: input.givenName,
          middleName: input.middleName ?? null,
          familyName: input.familyName,
          dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null,
          possibleDuplicate: await hasPossibleDuplicate(
            tx,
            input.schoolId,
            input.givenName,
            input.familyName,
            input.dateOfBirth ? asDate(input.dateOfBirth) : null,
            input.id,
          ),
          guardians: { create: guardians },
        },
      });
      await recordAudit(tx, input, "ADMISSION_APPLICATION_UPDATED", input.id, [
        "givenName",
        "middleName",
        "familyName",
        "dateOfBirth",
        "guardians",
      ]);
      return findApplication(tx, input.schoolId, input.id);
    });
  }

  async transitionApplication(
    input: ApplicationTransitionInput,
  ): Promise<AdmissionApplicationRecord | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await lockApplication(tx, input.schoolId, input.id);
      if (!current) return null;
      const next = transitionTarget(current.status, input.transition);
      if (next === current.status) return findApplication(tx, input.schoolId, input.id);
      const now = new Date();
      await tx.admissionApplication.update({
        where: { id: input.id },
        data: {
          status: next,
          ...(next === "SUBMITTED" ? { submittedAt: now } : {}),
          ...(next === "UNDER_REVIEW" ? { reviewedAt: now } : {}),
          ...(next === "ACCEPTED" ? { acceptedAt: now } : {}),
          ...(next === "REJECTED" ? { rejectedAt: now } : {}),
          ...(next === "WITHDRAWN" ? { withdrawnAt: now } : {}),
        },
      });
      await recordApplicationTransition(tx, {
        schoolId: input.schoolId,
        applicationId: input.id,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        fromStatus: current.status,
        toStatus: next,
      });
      await recordAudit(tx, input, `ADMISSION_APPLICATION_${next}`, input.id);
      return findApplication(tx, input.schoolId, input.id);
    });
  }

  async admitApplication(input: AdmitApplicationInput): Promise<AdmitApplicationResult | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await lockApplication(tx, input.schoolId, input.id);
      if (!current) return null;
      if (current.status === "ADMITTED") {
        const prior = await tx.student.findFirst({
          where: { schoolId: input.schoolId, admissionApplicationId: input.id },
          select: studentSelect,
        });
        if (!prior) throw new Error("Admitted application has no student record.");
        const placement = await tx.studentPlacement.findFirst({
          where: {
            schoolId: input.schoolId,
            studentId: prior.id,
            academicYearId: input.academicYearId,
            classId: input.classId,
            streamId: input.streamId ?? null,
          },
          select: { id: true },
        });
        if (!placement)
          throw invalidTransition("The application was admitted with a different placement.");
        return { student: prior, replayed: true };
      }
      if (current.status !== "ACCEPTED") throw invalidTransition();

      const year = await lockActiveYear(tx, input.schoolId, input.academicYearId);
      const classRecord = await lockActiveClass(tx, input.schoolId, input.classId);
      if (classRecord.academicYearId !== year.id) {
        throw new AdmissionsStoreError(
          "CONFIGURATION_CONFLICT",
          "The selected class does not belong to the selected academic year.",
        );
      }
      if (input.streamId) {
        await lockActiveStream(tx, input.schoolId, classRecord.id, input.streamId);
      }

      const sequence = await nextAdmissionSequence(tx, input.schoolId, year.id);
      const admissionNumber = `${year.startsOn.getUTCFullYear()}/${String(sequence).padStart(3, "0")}`;

      const student = await tx.student.create({
        data: {
          schoolId: input.schoolId,
          admissionApplicationId: input.id,
          admissionYearId: year.id,
          admissionNumber,
          givenName: current.givenName,
          middleName: current.middleName,
          familyName: current.familyName,
          dateOfBirth: current.dateOfBirth,
        },
        select: studentSelect,
      });

      await tx.studentPlacement.create({
        data: {
          schoolId: input.schoolId,
          studentId: student.id,
          academicYearId: year.id,
          classId: classRecord.id,
          streamId: input.streamId ?? null,
          assignedByUserId: input.actorUserId,
        },
      });

      const applicationGuardians = await tx.admissionApplicationGuardian.findMany({
        where: { schoolId: input.schoolId, applicationId: input.id },
      });
      for (const applicationGuardian of applicationGuardians) {
        let guardianId = applicationGuardian.existingGuardianId;
        if (!guardianId) {
          const guardian = await tx.guardian.create({
            data: {
              schoolId: input.schoolId,
              givenName: applicationGuardian.givenName,
              middleName: applicationGuardian.middleName,
              familyName: applicationGuardian.familyName,
              email: applicationGuardian.email,
              phone: applicationGuardian.phone,
            },
            select: { id: true },
          });
          guardianId = guardian.id;
        } else {
          const guardian = await tx.guardian.findFirst({
            where: { schoolId: input.schoolId, id: guardianId },
            select: { id: true },
          });
          if (!guardian) throw parentNotFound();
        }
        await tx.studentGuardian.create({
          data: {
            schoolId: input.schoolId,
            studentId: student.id,
            guardianId,
            relationship: applicationGuardian.relationship,
            authorizedAccess: applicationGuardian.authorizedAccess,
          },
        });
      }

      const now = new Date();
      await tx.admissionApplication.update({
        where: { id: input.id },
        data: { status: "ADMITTED", admittedAt: now },
      });
      await recordApplicationTransition(tx, {
        schoolId: input.schoolId,
        applicationId: input.id,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        fromStatus: "ACCEPTED",
        toStatus: "ADMITTED",
      });
      await tx.studentStatusEvent.create({
        data: {
          schoolId: input.schoolId,
          studentId: student.id,
          actorUserId: input.actorUserId,
          fromStatus: null,
          toStatus: "ACTIVE",
          requestId: input.requestId,
        },
      });
      await recordAudit(tx, input, "STUDENT_ADMITTED", student.id, [
        "admissionNumber",
        "placement",
        "guardians",
      ]);
      return { student, replayed: false };
    });
  }

  async listStudents(
    schoolId: string,
    query: StudentPageQuery,
  ): Promise<EntityPage<StudentRecord>> {
    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { admissionNumber: { contains: query.search, mode: "insensitive" } },
              { givenName: { contains: query.search, mode: "insensitive" } },
              { middleName: { contains: query.search, mode: "insensitive" } },
              { familyName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: studentSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.StudentOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items, total };
  }

  async getStudent(schoolId: string, id: string): Promise<StudentRecord | null> {
    return this.prisma.student.findFirst({ where: { schoolId, id }, select: studentSelect });
  }

  async updateStudentProfile(input: UpdateStudentProfileInput): Promise<StudentRecord | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await lockStudent(tx, input.schoolId, input.id);
      if (!current) return null;
      const data = {
        ...(input.givenName !== undefined ? { givenName: input.givenName } : {}),
        ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
        ...(input.familyName !== undefined ? { familyName: input.familyName } : {}),
        ...(input.dateOfBirth !== undefined
          ? { dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null }
          : {}),
      };
      await tx.studentProfileRevision.create({
        data: {
          schoolId: input.schoolId,
          studentId: current.id,
          actorUserId: input.actorUserId,
          givenName: current.givenName,
          middleName: current.middleName,
          familyName: current.familyName,
          dateOfBirth: current.dateOfBirth,
          requestId: input.requestId,
        },
      });
      const updated = await tx.student.update({
        where: { id: input.id },
        data,
        select: studentSelect,
      });
      await recordAudit(tx, input, "STUDENT_PROFILE_UPDATED", input.id, Object.keys(data));
      return updated;
    });
  }

  async changeStudentStatus(input: ChangeStudentStatusInput): Promise<StudentRecord | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await lockStudent(tx, input.schoolId, input.id);
      if (!current) return null;
      if (current.status !== "ACTIVE") {
        throw invalidTransition("Only active students can transition to a terminal status.");
      }
      const updated = await tx.student.update({
        where: { id: input.id },
        data: { status: input.status },
        select: studentSelect,
      });
      await tx.studentStatusEvent.create({
        data: {
          schoolId: input.schoolId,
          studentId: input.id,
          actorUserId: input.actorUserId,
          fromStatus: current.status,
          toStatus: input.status,
          requestId: input.requestId,
        },
      });
      await recordAudit(tx, input, `STUDENT_STATUS_${input.status}`, input.id);
      return updated;
    });
  }

  async listGuardians(
    schoolId: string,
    query: GuardianPageQuery,
  ): Promise<EntityPage<GuardianRecord>> {
    const where: Prisma.GuardianWhereInput = {
      schoolId,
      ...(query.search
        ? {
            OR: [
              { givenName: { contains: query.search, mode: "insensitive" } },
              { middleName: { contains: query.search, mode: "insensitive" } },
              { familyName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.guardian.findMany({
        where,
        select: guardianSelect,
        orderBy: [
          { [query.sortBy]: query.sortOrder },
          { id: "asc" },
        ] as Prisma.GuardianOrderByWithRelationInput[],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.guardian.count({ where }),
    ]);
    return { items, total };
  }

  async getGuardian(schoolId: string, id: string): Promise<GuardianRecord | null> {
    return this.prisma.guardian.findFirst({ where: { schoolId, id }, select: guardianSelect });
  }

  async createGuardian(input: CreateGuardianInput): Promise<GuardianRecord> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      if (!hasContact(input.email, input.phone)) throw contactRequired();
      const guardian = await tx.guardian.create({
        data: {
          schoolId: input.schoolId,
          givenName: input.givenName,
          middleName: input.middleName ?? null,
          familyName: input.familyName,
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
        select: guardianSelect,
      });
      await recordAudit(tx, input, "GUARDIAN_PROFILE_CREATED", guardian.id);
      return guardian;
    });
  }

  async updateGuardian(input: UpdateGuardianInput): Promise<GuardianRecord | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await tx.guardian.findFirst({
        where: { schoolId: input.schoolId, id: input.id },
        select: {
          id: true,
          givenName: true,
          middleName: true,
          familyName: true,
          email: true,
          phone: true,
        },
      });
      if (!current) return null;
      const email = input.email === undefined ? current.email : input.email;
      const phone = input.phone === undefined ? current.phone : input.phone;
      if (!hasContact(email, phone)) throw contactRequired();
      const data = {
        ...(input.givenName !== undefined ? { givenName: input.givenName } : {}),
        ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
        ...(input.familyName !== undefined ? { familyName: input.familyName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      };
      await tx.guardianProfileRevision.create({
        data: {
          schoolId: input.schoolId,
          guardianId: current.id,
          actorUserId: input.actorUserId,
          givenName: current.givenName,
          middleName: current.middleName,
          familyName: current.familyName,
          email: current.email,
          phone: current.phone,
          requestId: input.requestId,
        },
      });
      const guardian = await tx.guardian.update({
        where: { id: input.id },
        data,
        select: guardianSelect,
      });
      await recordAudit(tx, input, "GUARDIAN_PROFILE_UPDATED", guardian.id, Object.keys(data));
      return guardian;
    });
  }

  async listStudentGuardians(
    schoolId: string,
    studentId: string,
  ): Promise<StudentGuardianRecord[] | null> {
    const student = await this.prisma.student.findFirst({
      where: { schoolId, id: studentId },
      select: { id: true },
    });
    if (!student) return null;
    return this.prisma.studentGuardian.findMany({
      where: { schoolId, studentId },
      select: {
        id: true,
        studentId: true,
        guardianId: true,
        relationship: true,
        authorizedAccess: true,
        guardian: { select: guardianSelect },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async updateStudentGuardian(
    input: UpdateStudentGuardianInput,
  ): Promise<StudentGuardianRecord | null> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const current = await tx.studentGuardian.findFirst({
        where: {
          schoolId: input.schoolId,
          studentId: input.studentId,
          guardianId: input.guardianId,
        },
        select: { id: true },
      });
      if (!current) return null;
      const data = {
        ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
        ...(input.authorizedAccess !== undefined
          ? { authorizedAccess: input.authorizedAccess }
          : {}),
      };
      const updated = await tx.studentGuardian.update({
        where: { id: current.id },
        data,
        select: {
          id: true,
          studentId: true,
          guardianId: true,
          relationship: true,
          authorizedAccess: true,
          guardian: { select: guardianSelect },
        },
      });
      await recordAudit(tx, input, "STUDENT_GUARDIAN_UPDATED", current.id, Object.keys(data));
      return updated;
    });
  }

  async createStudentGuardian(input: CreateStudentGuardianInput): Promise<StudentGuardianRecord> {
    return this.transaction(async (tx) => {
      await lockActiveSchool(tx, input.schoolId);
      const student = await tx.student.findFirst({
        where: { schoolId: input.schoolId, id: input.studentId },
        select: { id: true },
      });
      const guardian = await tx.guardian.findFirst({
        where: { schoolId: input.schoolId, id: input.guardianId },
        select: { id: true },
      });
      if (!student || !guardian) throw parentNotFound();
      const record = await tx.studentGuardian.create({
        data: {
          schoolId: input.schoolId,
          studentId: input.studentId,
          guardianId: input.guardianId,
          relationship: input.relationship,
          authorizedAccess: input.authorizedAccess,
        },
        select: {
          id: true,
          studentId: true,
          guardianId: true,
          relationship: true,
          authorizedAccess: true,
          guardian: { select: guardianSelect },
        },
      });
      await recordAudit(tx, input, "STUDENT_GUARDIAN_CREATED", record.id);
      return record;
    });
  }

  async listStudentPlacements(
    schoolId: string,
    studentId: string,
  ): Promise<StudentPlacementRecord[] | null> {
    const student = await this.prisma.student.findFirst({
      where: { schoolId, id: studentId },
      select: { id: true },
    });
    if (!student) return null;
    return this.prisma.studentPlacement.findMany({
      where: { schoolId, studentId },
      select: placementSelect,
      orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    });
  }

  async listStudentProfileRevisions(
    schoolId: string,
    studentId: string,
    query: ProfileHistoryQuery,
  ): Promise<EntityPage<StudentProfileRevisionRecord> | null> {
    const student = await this.prisma.student.findFirst({
      where: { schoolId, id: studentId },
      select: { id: true },
    });
    if (!student) return null;
    const where = { schoolId, studentId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.studentProfileRevision.findMany({
        where,
        select: {
          id: true,
          studentId: true,
          givenName: true,
          middleName: true,
          familyName: true,
          dateOfBirth: true,
          recordedAt: true,
        },
        orderBy: [{ recordedAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.studentProfileRevision.count({ where }),
    ]);
    return { items, total };
  }

  async listGuardianProfileRevisions(
    schoolId: string,
    guardianId: string,
    query: ProfileHistoryQuery,
  ): Promise<EntityPage<GuardianProfileRevisionRecord> | null> {
    const guardian = await this.prisma.guardian.findFirst({
      where: { schoolId, id: guardianId },
      select: { id: true },
    });
    if (!guardian) return null;
    const where = { schoolId, guardianId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.guardianProfileRevision.findMany({
        where,
        select: {
          id: true,
          guardianId: true,
          givenName: true,
          middleName: true,
          familyName: true,
          email: true,
          phone: true,
          recordedAt: true,
        },
        orderBy: [{ recordedAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.guardianProfileRevision.count({ where }),
    ]);
    return { items, total };
  }

  private async findApplicationByIdempotencyKey(
    schoolId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<{ id: string; requestFingerprint: string } | null> {
    return this.prisma.admissionApplication.findFirst({
      where: { schoolId, createdByUserId: actorUserId, idempotencyKey },
      select: { id: true, requestFingerprint: true },
    });
  }

  private async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isSerializationFailure(error) && attempt < 2) {
          lastError = error;
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2002") {
            throw new AdmissionsStoreError(
              "CONFIGURATION_CONFLICT",
              "A conflicting school record already exists.",
            );
          }
          if (error.code === "P2003") {
            throw new AdmissionsStoreError(
              "CONFIGURATION_CONFLICT",
              "A referenced record is not valid for this school.",
            );
          }
          if (error.code === "P2034") {
            throw new AdmissionsStoreError(
              "CONCURRENT_CHANGE",
              "The record changed concurrently. Retry the request.",
            );
          }
        }
        throw error;
      }
    }
    throw lastError;
  }
}

const applicationSelect = {
  id: true,
  status: true,
  possibleDuplicate: true,
  givenName: true,
  middleName: true,
  familyName: true,
  dateOfBirth: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true,
  acceptedAt: true,
  rejectedAt: true,
  withdrawnAt: true,
  admittedAt: true,
  student: { select: { id: true } },
  guardians: {
    select: {
      id: true,
      existingGuardianId: true,
      givenName: true,
      middleName: true,
      familyName: true,
      email: true,
      phone: true,
      relationship: true,
      authorizedAccess: true,
    },
    orderBy: [{ id: "asc" }],
  },
} satisfies Prisma.AdmissionApplicationSelect;

type SelectedApplication = Prisma.AdmissionApplicationGetPayload<{
  select: typeof applicationSelect;
}>;

function toApplicationRecord(application: SelectedApplication): AdmissionApplicationRecord {
  const { student, guardians, ...record } = application;
  return {
    ...record,
    studentId: student?.id ?? null,
    guardians: guardians.map((guardian) => ({
      id: guardian.id,
      guardianId: guardian.existingGuardianId,
      givenName: guardian.givenName,
      middleName: guardian.middleName,
      familyName: guardian.familyName,
      email: guardian.email,
      phone: guardian.phone,
      relationship: guardian.relationship,
      authorizedAccess: guardian.authorizedAccess,
    })),
  };
}

const studentSelect = {
  id: true,
  admissionNumber: true,
  admissionYearId: true,
  admissionApplicationId: true,
  givenName: true,
  middleName: true,
  familyName: true,
  dateOfBirth: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudentSelect;

const guardianSelect = {
  id: true,
  givenName: true,
  middleName: true,
  familyName: true,
  email: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GuardianSelect;

const placementSelect = {
  id: true,
  studentId: true,
  academicYearId: true,
  classId: true,
  streamId: true,
  startedAt: true,
  endedAt: true,
} satisfies Prisma.StudentPlacementSelect;

async function findApplication(
  tx: Prisma.TransactionClient,
  schoolId: string,
  id: string,
): Promise<AdmissionApplicationRecord | null> {
  const application = await tx.admissionApplication.findFirst({
    where: { schoolId, id },
    select: applicationSelect,
  });
  return application ? toApplicationRecord(application) : null;
}

async function lockActiveSchool(tx: Prisma.TransactionClient, schoolId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "schools"
    WHERE "id" = ${schoolId}::uuid AND "status" = ${SchoolStatus.ACTIVE}::"SchoolStatus"
    FOR SHARE
  `;
  if (rows.length !== 1) throw notFound();
}

async function nextAdmissionSequence(
  tx: Prisma.TransactionClient,
  schoolId: string,
  academicYearId: string,
): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO "admission_number_counters" ("school_id", "academic_year_id", "last_sequence")
    VALUES (${schoolId}::uuid, ${academicYearId}::uuid, 0)
    ON CONFLICT ("school_id", "academic_year_id") DO NOTHING
  `;
  const rows = await tx.$queryRaw<Array<{ lastSequence: number }>>`
    SELECT "last_sequence" AS "lastSequence"
    FROM "admission_number_counters"
    WHERE "school_id" = ${schoolId}::uuid AND "academic_year_id" = ${academicYearId}::uuid
    FOR UPDATE
  `;
  const current = rows[0]?.lastSequence;
  if (current === undefined) throw new Error("Admission number counter could not be locked.");
  if (current >= 2_147_483_647) {
    throw new AdmissionsStoreError(
      "ADMISSION_NUMBER_EXHAUSTED",
      "No further admission numbers are available for this academic year.",
    );
  }
  const next = current + 1;
  await tx.admissionNumberCounter.update({
    where: { schoolId_academicYearId: { schoolId, academicYearId } },
    data: { lastSequence: next },
  });
  return next;
}

async function lockApplication(
  tx: Prisma.TransactionClient,
  schoolId: string,
  applicationId: string,
): Promise<{
  id: string;
  status: AdmissionApplicationStatus;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: Date | null;
} | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "admission_applications"
    WHERE "school_id" = ${schoolId}::uuid AND "id" = ${applicationId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) return null;
  return tx.admissionApplication.findFirst({
    where: { schoolId, id: applicationId },
    select: {
      id: true,
      status: true,
      givenName: true,
      middleName: true,
      familyName: true,
      dateOfBirth: true,
    },
  });
}

async function lockStudent(
  tx: Prisma.TransactionClient,
  schoolId: string,
  studentId: string,
): Promise<{
  id: string;
  status: "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "WITHDRAWN";
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: Date | null;
} | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "students"
    WHERE "school_id" = ${schoolId}::uuid AND "id" = ${studentId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) return null;
  return tx.student.findFirst({
    where: { schoolId, id: studentId },
    select: {
      id: true,
      status: true,
      givenName: true,
      middleName: true,
      familyName: true,
      dateOfBirth: true,
    },
  });
}

async function hasPossibleDuplicate(
  tx: Prisma.TransactionClient,
  schoolId: string,
  givenName: string,
  familyName: string,
  dateOfBirth: Date | null,
  excludeApplicationId?: string,
): Promise<boolean> {
  const match = await tx.admissionApplication.findFirst({
    where: {
      schoolId,
      ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
      givenName: { equals: givenName, mode: "insensitive" },
      familyName: { equals: familyName, mode: "insensitive" },
      ...(dateOfBirth ? { dateOfBirth } : {}),
    },
    select: { id: true },
  });
  return match !== null;
}

async function lockActiveYear(
  tx: Prisma.TransactionClient,
  schoolId: string,
  academicYearId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "academic_years"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${academicYearId}::uuid
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length !== 1) throw parentNotFound();
  const year = await tx.academicYear.findFirst({ where: { schoolId, id: academicYearId } });
  if (!year) throw parentNotFound();
  return year;
}

async function lockActiveClass(tx: Prisma.TransactionClient, schoolId: string, classId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "academic_classes"
    WHERE "school_id" = ${schoolId}::uuid
      AND "id" = ${classId}::uuid
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length !== 1) throw parentNotFound();
  const record = await tx.academicClass.findFirst({ where: { schoolId, id: classId } });
  if (!record) throw parentNotFound();
  return record;
}

async function lockActiveStream(
  tx: Prisma.TransactionClient,
  schoolId: string,
  classId: string,
  streamId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "class_streams"
    WHERE "school_id" = ${schoolId}::uuid
      AND "class_id" = ${classId}::uuid
      AND "id" = ${streamId}::uuid
      AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length !== 1) throw parentNotFound();
}

function transitionTarget(
  current: AdmissionApplicationStatus,
  transition: ApplicationTransitionInput["transition"],
): AdmissionApplicationRecord["status"] {
  const targets: Record<ApplicationTransitionInput["transition"], string[]> = {
    submit: ["DRAFT"],
    review: ["SUBMITTED"],
    accept: ["UNDER_REVIEW"],
    reject: ["UNDER_REVIEW"],
    withdraw: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED"],
  };
  if (transition === "review" && current === "UNDER_REVIEW") return "UNDER_REVIEW";
  if (targets[transition].includes(current)) {
    const result: Record<
      ApplicationTransitionInput["transition"],
      AdmissionApplicationRecord["status"]
    > = {
      submit: "SUBMITTED",
      review: "UNDER_REVIEW",
      accept: "ACCEPTED",
      reject: "REJECTED",
      withdraw: "WITHDRAWN",
    };
    return result[transition];
  }
  if (
    (transition === "submit" && current === "SUBMITTED") ||
    (transition === "accept" && current === "ACCEPTED") ||
    (transition === "reject" && current === "REJECTED") ||
    (transition === "withdraw" && current === "WITHDRAWN")
  ) {
    return current;
  }
  throw invalidTransition();
}

async function recordApplicationTransition(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    applicationId: string;
    actorUserId: string;
    requestId: string;
    fromStatus: AdmissionApplicationStatus | null;
    toStatus: AdmissionApplicationStatus;
  },
): Promise<void> {
  await tx.admissionApplicationStatusEvent.create({
    data: {
      schoolId: input.schoolId,
      applicationId: input.applicationId,
      actorUserId: input.actorUserId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      requestId: input.requestId,
    },
  });
}

async function recordAudit(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; actorUserId: string; requestId: string },
  eventType: string,
  recordId: string,
  changedFields?: string[],
): Promise<void> {
  await tx.securityAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      schoolId: input.schoolId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: {
        recordId,
        ...(changedFields ? { changedFields } : {}),
      },
    },
  });
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function contactRequired(): AdmissionsStoreError {
  return new AdmissionsStoreError(
    "CONTACT_REQUIRED",
    "A guardian must have at least one contact method.",
  );
}

function hasContact(email: string | null | undefined, phone: string | null | undefined): boolean {
  return Boolean(email?.trim() || phone?.trim());
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function notFound(): AdmissionsStoreError {
  return new AdmissionsStoreError("NOT_FOUND", "The requested record was not found.");
}

function parentNotFound(): AdmissionsStoreError {
  return new AdmissionsStoreError("PARENT_NOT_FOUND", "A required school record was not found.");
}

function invalidTransition(
  message = "This workflow transition is not allowed.",
): AdmissionsStoreError {
  return new AdmissionsStoreError("INVALID_TRANSITION", message);
}

function idempotencyConflict(): AdmissionsStoreError {
  return new AdmissionsStoreError(
    "IDEMPOTENCY_KEY_REUSED",
    "The idempotency key has already been used for a different request.",
  );
}
