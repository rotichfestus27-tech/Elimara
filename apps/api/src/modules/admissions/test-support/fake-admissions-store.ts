import { randomUUID } from "node:crypto";
import type {
  AdmissionApplicationPageQuery,
  AdmissionApplicationRecord,
  AdmissionsStore,
  AdmitApplicationInput,
  AdmitApplicationResult,
  ApplicationTransitionInput,
  ChangeStudentStatusInput,
  CreateAdmissionApplicationInput,
  CreateGuardianInput,
  CreateStudentGuardianInput,
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
} from "@elimara/database";
import { AdmissionsStoreError } from "@elimara/database";

export class FakeAdmissionsStore implements AdmissionsStore {
  readonly applications = new Map<string, AdmissionApplicationRecord>();
  readonly students = new Map<string, StudentRecord>();
  readonly guardians = new Map<string, GuardianRecord>();
  readonly studentGuardians: StudentGuardianRecord[] = [];
  readonly placements: StudentPlacementRecord[] = [];
  readonly studentRevisions: StudentProfileRevisionRecord[] = [];
  readonly guardianRevisions: GuardianProfileRevisionRecord[] = [];
  readonly idempotency = new Map<string, { fingerprint: string; applicationId: string }>();
  private readonly applicationSchools = new Map<string, string>();
  private readonly studentSchools = new Map<string, string>();
  private readonly guardianSchools = new Map<string, string>();
  private readonly numberSequences = new Map<string, number>();

  seedStudentForTest(schoolId: string, student: StudentRecord): void {
    this.students.set(student.id, student);
    this.studentSchools.set(student.id, schoolId);
  }

  async createApplication(input: CreateAdmissionApplicationInput) {
    const key = `${input.schoolId}:${input.actorUserId}:${input.idempotencyKey}`;
    const existing = this.idempotency.get(key);
    if (existing) {
      if (existing.fingerprint !== input.requestFingerprint) {
        throw new AdmissionsStoreError("IDEMPOTENCY_KEY_REUSED", "Idempotency key reused.");
      }
      const replay = this.applications.get(existing.applicationId);
      if (!replay) throw new Error("Missing fake application.");
      return replay;
    }
    const duplicate = [...this.applications.values()].some(
      (application) =>
        this.applicationSchools.get(application.id) === input.schoolId &&
        application.givenName.toLowerCase() === input.givenName.toLowerCase() &&
        application.familyName.toLowerCase() === input.familyName.toLowerCase() &&
        (input.dateOfBirth === undefined ||
          application.dateOfBirth?.toISOString().slice(0, 10) === input.dateOfBirth),
    );
    const record: AdmissionApplicationRecord = {
      id: randomUUID(),
      status: "DRAFT",
      possibleDuplicate: duplicate,
      givenName: input.givenName,
      middleName: input.middleName ?? null,
      familyName: input.familyName,
      dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null,
      guardians: input.guardians.map((guardian) => {
        const existingGuardian =
          "existingGuardianId" in guardian
            ? this.guardians.get(guardian.existingGuardianId)
            : undefined;
        if ("existingGuardianId" in guardian && !existingGuardian) {
          throw new AdmissionsStoreError("PARENT_NOT_FOUND", "Guardian not found.");
        }
        return {
          id: randomUUID(),
          guardianId: existingGuardian?.id ?? null,
          givenName:
            existingGuardian?.givenName ?? ("givenName" in guardian ? guardian.givenName : ""),
          middleName:
            existingGuardian?.middleName ??
            ("middleName" in guardian ? (guardian.middleName ?? null) : null),
          familyName:
            existingGuardian?.familyName ?? ("familyName" in guardian ? guardian.familyName : ""),
          email: existingGuardian?.email ?? ("email" in guardian ? (guardian.email ?? null) : null),
          phone: existingGuardian?.phone ?? ("phone" in guardian ? (guardian.phone ?? null) : null),
          relationship: guardian.relationship,
          authorizedAccess: guardian.authorizedAccess,
        };
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedAt: null,
      reviewedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      withdrawnAt: null,
      admittedAt: null,
      studentId: null,
    };
    this.applications.set(record.id, record);
    this.applicationSchools.set(record.id, input.schoolId);
    this.idempotency.set(key, { fingerprint: input.requestFingerprint, applicationId: record.id });
    return record;
  }

  async listApplications(
    schoolId: string,
    query: AdmissionApplicationPageQuery,
  ): Promise<EntityPage<AdmissionApplicationRecord>> {
    const values = [...this.applications.values()]
      .filter((application) => this.applicationSchools.get(application.id) === schoolId)
      .filter((application) => !query.status || application.status === query.status)
      .filter(
        (application) =>
          !query.search ||
          `${application.givenName} ${application.middleName ?? ""} ${application.familyName}`
            .toLowerCase()
            .includes(query.search.toLowerCase()),
      );
    return { items: values.slice(query.offset, query.offset + query.limit), total: values.length };
  }

  async getApplication(schoolId: string, id: string) {
    return this.applicationSchools.get(id) === schoolId
      ? (this.applications.get(id) ?? null)
      : null;
  }

  async updateDraftApplication(input: UpdateAdmissionApplicationInput) {
    const current =
      this.applicationSchools.get(input.id) === input.schoolId
        ? this.applications.get(input.id)
        : undefined;
    if (!current) return null;
    if (current.status !== "DRAFT") {
      throw new AdmissionsStoreError("INVALID_TRANSITION", "Application is not a draft.");
    }
    const updated = {
      ...current,
      possibleDuplicate: [...this.applications.values()].some(
        (application) =>
          application.id !== current.id &&
          this.applicationSchools.get(application.id) === input.schoolId &&
          application.givenName.toLowerCase() === input.givenName.toLowerCase() &&
          application.familyName.toLowerCase() === input.familyName.toLowerCase() &&
          (input.dateOfBirth === undefined ||
            application.dateOfBirth?.toISOString().slice(0, 10) === input.dateOfBirth),
      ),
      givenName: input.givenName,
      middleName: input.middleName ?? null,
      familyName: input.familyName,
      dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null,
      updatedAt: new Date(),
    };
    this.applications.set(input.id, updated);
    return updated;
  }

  async transitionApplication(input: ApplicationTransitionInput) {
    const current =
      this.applicationSchools.get(input.id) === input.schoolId
        ? this.applications.get(input.id)
        : undefined;
    if (!current) return null;
    const allowed: Record<ApplicationTransitionInput["transition"], string[]> = {
      submit: ["DRAFT"],
      review: ["SUBMITTED", "UNDER_REVIEW"],
      accept: ["UNDER_REVIEW"],
      reject: ["UNDER_REVIEW"],
      withdraw: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED"],
    };
    const targets = {
      submit: "SUBMITTED",
      review: "UNDER_REVIEW",
      accept: "ACCEPTED",
      reject: "REJECTED",
      withdraw: "WITHDRAWN",
    } as const;
    if (!allowed[input.transition].includes(current.status)) {
      if (
        current.status === targets[input.transition] &&
        ["submit", "review", "accept", "reject", "withdraw"].includes(input.transition)
      ) {
        return current;
      }
      throw new AdmissionsStoreError("INVALID_TRANSITION", "Invalid application transition.");
    }
    const now = new Date();
    const updated = {
      ...current,
      status: targets[input.transition],
      updatedAt: now,
      ...(input.transition === "submit" ? { submittedAt: now } : {}),
      ...(input.transition === "review" ? { reviewedAt: now } : {}),
      ...(input.transition === "accept" ? { acceptedAt: now } : {}),
      ...(input.transition === "reject" ? { rejectedAt: now } : {}),
      ...(input.transition === "withdraw" ? { withdrawnAt: now } : {}),
    };
    this.applications.set(input.id, updated);
    return updated;
  }

  async admitApplication(input: AdmitApplicationInput): Promise<AdmitApplicationResult | null> {
    const application =
      this.applicationSchools.get(input.id) === input.schoolId
        ? this.applications.get(input.id)
        : undefined;
    if (!application) return null;
    const prior = [...this.students.values()].find(
      (student) => student.admissionApplicationId === input.id,
    );
    if (application.status === "ADMITTED" && prior) {
      const matching = this.placements.some(
        (placement) =>
          placement.studentId === prior.id &&
          placement.academicYearId === input.academicYearId &&
          placement.classId === input.classId &&
          placement.streamId === (input.streamId ?? null),
      );
      if (!matching) throw new AdmissionsStoreError("INVALID_TRANSITION", "Placement mismatch.");
      return { student: prior, replayed: true };
    }
    if (application.status !== "ACCEPTED") {
      throw new AdmissionsStoreError("INVALID_TRANSITION", "Application is not accepted.");
    }
    const counterKey = `${input.schoolId}:${input.academicYearId}`;
    const sequence = (this.numberSequences.get(counterKey) ?? 0) + 1;
    this.numberSequences.set(counterKey, sequence);
    const now = new Date();
    const student: StudentRecord = {
      id: randomUUID(),
      admissionNumber: `2026/${String(sequence).padStart(3, "0")}`,
      admissionYearId: input.academicYearId,
      admissionApplicationId: input.id,
      givenName: application.givenName,
      middleName: application.middleName,
      familyName: application.familyName,
      dateOfBirth: application.dateOfBirth,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.students.set(student.id, student);
    this.studentSchools.set(student.id, input.schoolId);
    this.placements.push({
      id: randomUUID(),
      studentId: student.id,
      academicYearId: input.academicYearId,
      classId: input.classId,
      streamId: input.streamId ?? null,
      startedAt: now,
      endedAt: null,
    });
    for (const applicationGuardian of application.guardians) {
      let guardianId = applicationGuardian.guardianId;
      if (!guardianId) {
        const guardian = this.makeGuardian({
          schoolId: input.schoolId,
          givenName: applicationGuardian.givenName,
          middleName: applicationGuardian.middleName,
          familyName: applicationGuardian.familyName,
          email: applicationGuardian.email,
          phone: applicationGuardian.phone,
        });
        guardianId = guardian.id;
      }
      const guardian = this.guardians.get(guardianId);
      if (!guardian) throw new AdmissionsStoreError("PARENT_NOT_FOUND", "Guardian not found.");
      this.studentGuardians.push({
        id: randomUUID(),
        studentId: student.id,
        guardianId,
        relationship: applicationGuardian.relationship,
        authorizedAccess: applicationGuardian.authorizedAccess,
        guardian,
      });
    }
    this.applications.set(input.id, {
      ...application,
      status: "ADMITTED",
      admittedAt: now,
      updatedAt: now,
      studentId: student.id,
    });
    return { student, replayed: false };
  }

  async listStudents(schoolId: string, query: StudentPageQuery) {
    const values = [...this.students.values()].filter(
      (student) =>
        this.studentSchools.get(student.id) === schoolId &&
        (!query.status || student.status === query.status) &&
        (!query.search ||
          `${student.admissionNumber} ${student.givenName} ${student.familyName}`
            .toLowerCase()
            .includes(query.search.toLowerCase())),
    );
    return { items: values.slice(query.offset, query.offset + query.limit), total: values.length };
  }

  async getStudent(schoolId: string, id: string) {
    return this.studentSchools.get(id) === schoolId ? (this.students.get(id) ?? null) : null;
  }

  async updateStudentProfile(input: UpdateStudentProfileInput) {
    const current =
      this.studentSchools.get(input.id) === input.schoolId
        ? this.students.get(input.id)
        : undefined;
    if (!current) return null;
    this.studentRevisions.push({
      id: randomUUID(),
      studentId: current.id,
      givenName: current.givenName,
      middleName: current.middleName,
      familyName: current.familyName,
      dateOfBirth: current.dateOfBirth,
      recordedAt: new Date(),
    });
    const updated = {
      ...current,
      ...(input.givenName !== undefined ? { givenName: input.givenName } : {}),
      ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
      ...(input.familyName !== undefined ? { familyName: input.familyName } : {}),
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null }
        : {}),
      updatedAt: new Date(),
    };
    this.students.set(input.id, updated);
    return updated;
  }

  async changeStudentStatus(input: ChangeStudentStatusInput) {
    const current =
      this.studentSchools.get(input.id) === input.schoolId
        ? this.students.get(input.id)
        : undefined;
    if (!current) return null;
    if (current.status !== "ACTIVE") {
      throw new AdmissionsStoreError("INVALID_TRANSITION", "Student is already terminal.");
    }
    const updated = { ...current, status: input.status, updatedAt: new Date() };
    this.students.set(input.id, updated);
    return updated;
  }

  async listGuardians(schoolId: string, query: GuardianPageQuery) {
    const values = [...this.guardians.values()].filter(
      (guardian) =>
        this.guardianSchools.get(guardian.id) === schoolId &&
        (!query.search ||
          `${guardian.givenName} ${guardian.familyName} ${guardian.email ?? ""} ${guardian.phone ?? ""}`
            .toLowerCase()
            .includes(query.search.toLowerCase())),
    );
    return { items: values.slice(query.offset, query.offset + query.limit), total: values.length };
  }

  async getGuardian(schoolId: string, id: string) {
    return this.guardianSchools.get(id) === schoolId ? (this.guardians.get(id) ?? null) : null;
  }

  async createGuardian(input: CreateGuardianInput) {
    return this.makeGuardian(input);
  }

  async updateGuardian(input: UpdateGuardianInput) {
    const current =
      this.guardianSchools.get(input.id) === input.schoolId
        ? this.guardians.get(input.id)
        : undefined;
    if (!current) return null;
    const updated = {
      ...current,
      ...(input.givenName !== undefined ? { givenName: input.givenName } : {}),
      ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
      ...(input.familyName !== undefined ? { familyName: input.familyName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      updatedAt: new Date(),
    };
    this.guardians.set(input.id, updated);
    this.guardianRevisions.push({
      id: randomUUID(),
      guardianId: current.id,
      givenName: current.givenName,
      middleName: current.middleName,
      familyName: current.familyName,
      email: current.email,
      phone: current.phone,
      recordedAt: new Date(),
    });
    return updated;
  }

  async listStudentGuardians(schoolId: string, studentId: string) {
    if (this.studentSchools.get(studentId) !== schoolId) return null;
    return this.studentGuardians.filter((link) => link.studentId === studentId);
  }

  async createStudentGuardian(input: CreateStudentGuardianInput) {
    const guardian = this.guardians.get(input.guardianId);
    if (
      !guardian ||
      this.guardianSchools.get(input.guardianId) !== input.schoolId ||
      this.studentSchools.get(input.studentId) !== input.schoolId
    ) {
      throw new AdmissionsStoreError("PARENT_NOT_FOUND", "Related record not found.");
    }
    const record = {
      id: randomUUID(),
      studentId: input.studentId,
      guardianId: input.guardianId,
      relationship: input.relationship,
      authorizedAccess: input.authorizedAccess,
      guardian,
    };
    this.studentGuardians.push(record);
    return record;
  }

  async updateStudentGuardian(input: UpdateStudentGuardianInput) {
    const current = this.studentGuardians.find(
      (link) =>
        this.studentSchools.get(input.studentId) === input.schoolId &&
        link.studentId === input.studentId &&
        link.guardianId === input.guardianId,
    );
    if (!current) return null;
    Object.assign(current, {
      ...(input.relationship !== undefined ? { relationship: input.relationship } : {}),
      ...(input.authorizedAccess !== undefined ? { authorizedAccess: input.authorizedAccess } : {}),
    });
    return current;
  }

  async listStudentPlacements(schoolId: string, studentId: string) {
    if (this.studentSchools.get(studentId) !== schoolId) return null;
    return this.placements.filter((placement) => placement.studentId === studentId);
  }

  async listStudentProfileRevisions(
    schoolId: string,
    studentId: string,
    query: ProfileHistoryQuery,
  ) {
    if (this.studentSchools.get(studentId) !== schoolId) return null;
    const items = this.studentRevisions.filter((revision) => revision.studentId === studentId);
    return {
      items: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
    };
  }

  async listGuardianProfileRevisions(
    schoolId: string,
    guardianId: string,
    query: ProfileHistoryQuery,
  ) {
    if (this.guardianSchools.get(guardianId) !== schoolId) return null;
    const items = this.guardianRevisions.filter((revision) => revision.guardianId === guardianId);
    return {
      items: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
    };
  }

  private makeGuardian(input: {
    givenName: string;
    middleName?: string | null;
    familyName: string;
    email?: string | null;
    phone?: string | null;
    schoolId: string;
  }): GuardianRecord {
    const now = new Date();
    const record = {
      id: randomUUID(),
      givenName: input.givenName,
      middleName: input.middleName ?? null,
      familyName: input.familyName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.guardians.set(record.id, record);
    this.guardianSchools.set(record.id, input.schoolId);
    return record;
  }
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
