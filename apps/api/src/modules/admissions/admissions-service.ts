import { createHash } from "node:crypto";
import type {
  AdmissionApplicationPageQuery,
  AdmissionApplicationRecord,
  AdmissionsStore,
  AdmitApplicationResult,
  ApplicationPersonData,
  ApplicationTransitionInput,
  CreateGuardianInput,
  CreateStudentGuardianInput,
  GuardianPageQuery,
  GuardianRecord,
  ProfileHistoryQuery,
  StudentPageQuery,
  StudentRecord,
  UpdateGuardianInput,
  UpdateStudentGuardianInput,
  UpdateStudentProfileInput,
} from "@elimara/database";
import { AdmissionsStoreError } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class AdmissionsService {
  constructor(private readonly store: AdmissionsStore) {}

  async createApplication(
    input: {
      schoolId: string;
      actorUserId: string;
      requestId: string;
      idempotencyKey: string;
    } & ApplicationPersonData,
  ): Promise<AdmissionApplicationRecord> {
    return this.run(() =>
      this.store.createApplication({
        ...input,
        requestFingerprint: createHash("sha256")
          .update(
            canonicalJson({
              givenName: input.givenName,
              middleName: input.middleName ?? null,
              familyName: input.familyName,
              dateOfBirth: input.dateOfBirth ?? null,
              guardians: input.guardians,
            }),
          )
          .digest("hex"),
      }),
    );
  }

  async listApplications(schoolId: string, query: AdmissionApplicationPageQuery) {
    return this.run(() => this.store.listApplications(schoolId, query));
  }

  async getApplication(schoolId: string, id: string): Promise<AdmissionApplicationRecord> {
    return this.run(async () => {
      const record = await this.store.getApplication(schoolId, id);
      if (!record) throw recordNotFound("admission application");
      return record;
    });
  }

  async updateDraftApplication(
    input: Parameters<AdmissionsStore["updateDraftApplication"]>[0],
  ): Promise<AdmissionApplicationRecord> {
    return this.run(async () => {
      const record = await this.store.updateDraftApplication(input);
      if (!record) throw recordNotFound("admission application");
      return record;
    });
  }

  async transitionApplication(
    input: ApplicationTransitionInput,
  ): Promise<AdmissionApplicationRecord> {
    return this.run(async () => {
      const record = await this.store.transitionApplication(input);
      if (!record) throw recordNotFound("admission application");
      return record;
    });
  }

  async admitApplication(
    input: Parameters<AdmissionsStore["admitApplication"]>[0],
  ): Promise<AdmitApplicationResult> {
    return this.run(async () => {
      const result = await this.store.admitApplication(input);
      if (!result) throw recordNotFound("admission application");
      return result;
    });
  }

  async listStudents(schoolId: string, query: StudentPageQuery) {
    return this.run(() => this.store.listStudents(schoolId, query));
  }

  async getStudent(schoolId: string, id: string): Promise<StudentRecord> {
    return this.run(async () => {
      const record = await this.store.getStudent(schoolId, id);
      if (!record) throw recordNotFound("student");
      return record;
    });
  }

  async updateStudentProfile(input: UpdateStudentProfileInput): Promise<StudentRecord> {
    return this.run(async () => {
      const record = await this.store.updateStudentProfile(input);
      if (!record) throw recordNotFound("student");
      return record;
    });
  }

  async changeStudentStatus(
    input: Parameters<AdmissionsStore["changeStudentStatus"]>[0],
  ): Promise<StudentRecord> {
    return this.run(async () => {
      const record = await this.store.changeStudentStatus(input);
      if (!record) throw recordNotFound("student");
      return record;
    });
  }

  async listGuardians(schoolId: string, query: GuardianPageQuery) {
    return this.run(() => this.store.listGuardians(schoolId, query));
  }

  async getGuardian(schoolId: string, id: string): Promise<GuardianRecord> {
    return this.run(async () => {
      const record = await this.store.getGuardian(schoolId, id);
      if (!record) throw recordNotFound("guardian");
      return record;
    });
  }

  async createGuardian(input: CreateGuardianInput): Promise<GuardianRecord> {
    return this.run(() => this.store.createGuardian(input));
  }

  async updateGuardian(input: UpdateGuardianInput): Promise<GuardianRecord> {
    return this.run(async () => {
      const record = await this.store.updateGuardian(input);
      if (!record) throw recordNotFound("guardian");
      return record;
    });
  }

  async listStudentGuardians(schoolId: string, studentId: string) {
    return this.run(async () => {
      const records = await this.store.listStudentGuardians(schoolId, studentId);
      if (!records) throw recordNotFound("student");
      return records;
    });
  }

  async updateStudentGuardian(input: UpdateStudentGuardianInput) {
    return this.run(async () => {
      const record = await this.store.updateStudentGuardian(input);
      if (!record) throw recordNotFound("student guardian relationship");
      return record;
    });
  }

  async createStudentGuardian(input: CreateStudentGuardianInput) {
    return this.run(() => this.store.createStudentGuardian(input));
  }

  async listStudentPlacements(schoolId: string, studentId: string) {
    return this.run(async () => {
      const records = await this.store.listStudentPlacements(schoolId, studentId);
      if (!records) throw recordNotFound("student");
      return records;
    });
  }

  async listStudentProfileRevisions(
    schoolId: string,
    studentId: string,
    query: ProfileHistoryQuery,
  ) {
    return this.run(async () => {
      const records = await this.store.listStudentProfileRevisions(schoolId, studentId, query);
      if (!records) throw recordNotFound("student");
      return records;
    });
  }

  async listGuardianProfileRevisions(
    schoolId: string,
    guardianId: string,
    query: ProfileHistoryQuery,
  ) {
    return this.run(async () => {
      const records = await this.store.listGuardianProfileRevisions(schoolId, guardianId, query);
      if (!records) throw recordNotFound("guardian");
      return records;
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AdmissionsStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function mapStoreError(error: AdmissionsStoreError): ApiError {
  switch (error.code) {
    case "CONTACT_REQUIRED":
      return new ApiError(400, error.code, error.message);
    case "NOT_FOUND":
    case "PARENT_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_TRANSITION":
    case "CONFIGURATION_INACTIVE":
    case "CONFIGURATION_CONFLICT":
    case "IDEMPOTENCY_KEY_REUSED":
    case "CONCURRENT_CHANGE":
    case "ADMISSION_NUMBER_EXHAUSTED":
      return new ApiError(409, error.code, error.message);
  }
}

function recordNotFound(label: string): ApiError {
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${label} was not found.`);
}
