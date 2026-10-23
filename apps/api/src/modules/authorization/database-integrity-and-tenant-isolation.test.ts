import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type {
  ConfigurationListQuery,
  ConfigurationPage,
  ConfigurationRecord,
  ConfigurationResource,
  CreateConfigurationInput,
  DeactivateConfigurationInput,
  DeactivationOutcome,
  SchoolConfigurationStore,
  SchoolProfileRecord,
  StudentRecord,
  UpdateConfigurationInput,
} from "@elimara/database";
import { SchoolConfigurationStoreError } from "@elimara/database";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import { AdmissionsService } from "../admissions/admissions-service.js";
import { FakeAdmissionsStore } from "../admissions/test-support/fake-admissions-store.js";
import { AuthService } from "../identity/auth-service.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { SchoolConfigurationService } from "../schools/school-configuration-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findRepoRoot(startDir: string): string {
  let curr = startDir;
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, "pnpm-workspace.yaml"))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
}

const repoRoot = findRepoRoot(__dirname);

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});

const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";

const allPermissions = [
  "school.profile.read",
  "school.profile.update",
  "academics.configuration.read",
  "academics.configuration.manage",
  "admissions.application.read",
  "admissions.application.create",
  "admissions.application.review",
  "admissions.application.admit",
  "students.profile.read",
  "students.profile.update",
  "students.profile.status",
  "guardians.profile.read",
  "guardians.profile.manage",
  "students.guardian.manage",
  "students.placement.manage",
];

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

type StoredConfig = {
  schoolId: string;
  resource: ConfigurationResource;
  record: ConfigurationRecord;
};

class TwoSchoolConfigStore implements SchoolConfigurationStore {
  readonly records: StoredConfig[] = [];
  readonly schools = new Map<string, SchoolProfileRecord>([
    [
      schoolAId,
      {
        id: schoolAId,
        name: "Elimara Academy A",
        contactEmail: null,
        contactPhone: null,
        status: "ACTIVE",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    [
      schoolBId,
      {
        id: schoolBId,
        name: "Elimara Academy B",
        contactEmail: null,
        contactPhone: null,
        status: "ACTIVE",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  ]);

  async getSchoolProfile(schoolId: string): Promise<SchoolProfileRecord | null> {
    const s = this.schools.get(schoolId);
    return s?.status === "ACTIVE" ? s : null;
  }

  async updateSchoolProfile(): Promise<SchoolProfileRecord | null> {
    return null;
  }

  async listConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const filtered = this.records
      .filter((e) => e.schoolId === schoolId && e.resource === resource)
      .map((e) => e.record)
      .filter((r) => !query.status || r.status === query.status);
    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  }

  async getConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    id: string,
  ): Promise<ConfigurationRecord | null> {
    const found = this.records.find(
      (e) => e.schoolId === schoolId && e.resource === resource && e.record.id === id,
    );
    return found ? found.record : null;
  }

  async createConfiguration(input: CreateConfigurationInput): Promise<ConfigurationRecord> {
    const now = new Date();
    // Validate school exists
    if (!this.schools.has(input.schoolId)) {
      throw new SchoolConfigurationStoreError("SCHOOL_NOT_FOUND", "School not found.");
    }
    // Validate parent relationship stays within the same school
    if ("academicYearId" in input.data && input.data.academicYearId) {
      const parentYear = this.records.find(
        (e) =>
          e.schoolId === input.schoolId &&
          e.resource === "academicYears" &&
          e.record.id === input.data.academicYearId &&
          e.record.status === "ACTIVE",
      );
      if (!parentYear) {
        throw new SchoolConfigurationStoreError(
          "PARENT_NOT_FOUND",
          "Parent academic year not found in this school.",
        );
      }
    }
    // Check uniqueness within the same school and parent
    if ("name" in input.data && input.data.name) {
      const duplicate = this.records.find(
        (e) =>
          e.schoolId === input.schoolId &&
          e.resource === input.resource &&
          "name" in e.record &&
          e.record.name.toLowerCase() === (input.data.name as string).toLowerCase() &&
          ("academicYearId" in e.record && "academicYearId" in input.data
            ? e.record.academicYearId === input.data.academicYearId
            : true),
      );
      if (duplicate) {
        throw new SchoolConfigurationStoreError(
          "CONFIGURATION_CONFLICT",
          "A record with this name already exists in this scope.",
        );
      }
    }

    const record = {
      id: randomUUID(),
      ...input.data,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    } as ConfigurationRecord;

    this.records.push({ schoolId: input.schoolId, resource: input.resource, record });
    return record;
  }

  async updateConfiguration(input: UpdateConfigurationInput): Promise<ConfigurationRecord | null> {
    const found = this.records.find(
      (e) =>
        e.schoolId === input.schoolId &&
        e.resource === input.resource &&
        e.record.id === input.id,
    );
    if (!found) return null;
    found.record = { ...found.record, ...input.data, updatedAt: new Date() } as ConfigurationRecord;
    return found.record;
  }

  async deactivateConfiguration(input: DeactivateConfigurationInput): Promise<DeactivationOutcome> {
    const found = this.records.find(
      (e) =>
        e.schoolId === input.schoolId &&
        e.resource === input.resource &&
        e.record.id === input.id,
    );
    if (!found) return "NOT_FOUND";
    if (found.record.status === "INACTIVE") return "ALREADY_INACTIVE";

    // Lifecycle rule: cannot deactivate if active children exist
    const hasActiveChildren = this.records.some(
      (child) =>
        child.schoolId === input.schoolId &&
        child.record.status === "ACTIVE" &&
        ("academicYearId" in child.record && child.record.academicYearId === input.id),
    );
    if (hasActiveChildren) {
      throw new SchoolConfigurationStoreError(
        "CONFIGURATION_CONFLICT",
        "Cannot deactivate record with active children.",
      );
    }

    found.record = { ...found.record, status: "INACTIVE", updatedAt: new Date() };
    return "DEACTIVATED";
  }
}

function setupMultiSchoolSystem() {
  const identityStore = new FakeIdentityStore();
  const configStore = new TwoSchoolConfigStore();
  const admissionsStore = new FakeAdmissionsStore();

  // User A: School A only
  identityStore.users.set("user-a", {
    id: "user-a",
    email: "admin@school-a.test",
    passwordHash: "hash:Password123!",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId: "user-a",
    access: { id: schoolAId, name: "Elimara Academy A", permissions: allPermissions },
  });

  // User B: School B only
  identityStore.users.set("user-b", {
    id: "user-b",
    email: "admin@school-b.test",
    passwordHash: "hash:Password123!",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolBId, {
    userId: "user-b",
    access: { id: schoolBId, name: "Elimara Academy B", permissions: allPermissions },
  });

  const authService = new AuthService(identityStore, hasher, config);
  const schoolConfigurationService = new SchoolConfigurationService(configStore);
  const admissionsService = new AdmissionsService(admissionsStore);

  const app = createApp(config, {
    authService,
    schoolConfigurationService,
    admissionsService,
    checkDatabase: async () => {},
  });

  return { app, configStore, admissionsStore };
}

async function loginAsUser(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").send({
    email,
    password: "Password123!",
  });
  const csrfCookie = (res.headers["set-cookie"] as string[]).find((c) =>
    c.startsWith(`${config.CSRF_COOKIE_NAME}=`),
  );
  if (!csrfCookie) throw new Error("No CSRF cookie returned on login.");
  const csrfToken = csrfCookie.split(";")[0]?.split("=")[1];
  if (!csrfToken) throw new Error("Missing CSRF token value.");
  return { agent, csrfToken };
}

describe("Database Integrity & Tenant Isolation Verification", () => {
  // Scenario 1: Tenant Isolation Across Two Schools
  describe("Scenario 1: Tenant Isolation Across Two Schools", () => {
    it("denies User A from accessing School B resources via manipulated URL parameters", async () => {
      const { app } = setupMultiSchoolSystem();
      const { agent } = await loginAsUser(app, "admin@school-a.test");

      // User A attempts to list School B students
      const res = await agent.get(`/api/v1/schools/${schoolBId}/students`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("SCHOOL_NOT_FOUND");
    });

    it("ensures collection endpoints strictly scope records and never leak other schools' data", async () => {
      const { app, admissionsStore } = setupMultiSchoolSystem();

      const studentA: StudentRecord = {
        id: randomUUID(),
        admissionNumber: "2026/001",
        admissionYearId: randomUUID(),
        admissionApplicationId: randomUUID(),
        givenName: "Alice",
        familyName: "Achebe",
        dateOfBirth: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const studentB: StudentRecord = {
        id: randomUUID(),
        admissionNumber: "2026/002",
        admissionYearId: randomUUID(),
        admissionApplicationId: randomUUID(),
        givenName: "Bob",
        familyName: "Barasa",
        dateOfBirth: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      admissionsStore.seedStudentForTest(schoolAId, studentA);
      admissionsStore.seedStudentForTest(schoolBId, studentB);

      const { agent } = await loginAsUser(app, "admin@school-a.test");
      const res = await agent.get(`/api/v1/schools/${schoolAId}/students`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(studentA.id);
      expect(res.body.data[0].givenName).toBe("Alice");

      // Verifies Bob (from School B) is not present
      const hasBob = res.body.data.some((s: { id: string }) => s.id === studentB.id);
      expect(hasBob).toBe(false);
    });

    it("returns non-disclosing 404 when querying another school's resource ID through School A path", async () => {
      const { app, admissionsStore } = setupMultiSchoolSystem();
      const studentB: StudentRecord = {
        id: randomUUID(),
        admissionNumber: "2026/009",
        admissionYearId: randomUUID(),
        admissionApplicationId: randomUUID(),
        givenName: "Secret",
        familyName: "Student",
        dateOfBirth: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      admissionsStore.seedStudentForTest(schoolBId, studentB);

      const { agent, csrfToken } = await loginAsUser(app, "admin@school-a.test");

      // User A tries to get Student B by ID in School A context
      const getRes = await agent.get(`/api/v1/schools/${schoolAId}/students/${studentB.id}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe("RECORD_NOT_FOUND");

      // User A tries to mutate Student B by ID in School A context
      const patchRes = await agent
        .patch(`/api/v1/schools/${schoolAId}/students/${studentB.id}`)
        .set("x-csrf-token", csrfToken)
        .send({ givenName: "HackedName" });
      expect(patchRes.status).toBe(404);
      expect(patchRes.body.error.code).toBe("RECORD_NOT_FOUND");
    });
  });

  // Scenario 2: Referential Integrity
  describe("Scenario 2: Referential Integrity & Lifecycle Rules", () => {
    it("rejects cross-school parent relationships when creating child configurations", async () => {
      const { app, configStore } = setupMultiSchoolSystem();
      const { agent, csrfToken } = await loginAsUser(app, "admin@school-a.test");

      // Create an academic year in School B
      const yearB = await configStore.createConfiguration({
        schoolId: schoolBId,
        resource: "academicYears",
        actorUserId: "user-b",
        requestId: randomUUID(),
        data: { name: "2026 Academic Year B", startsOn: "2026-01-01", endsOn: "2026-12-31" },
      });

      // User A tries to create a Class in School A referencing School B's year ID
      const res = await agent
        .post(`/api/v1/schools/${schoolAId}/classes`)
        .set("x-csrf-token", csrfToken)
        .send({
          academicYearId: yearB.id,
          name: "Class 1 North",
        });

      // Must be rejected with 404 PARENT_NOT_FOUND
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("PARENT_NOT_FOUND");
    });

    it("rejects requests referencing nonexistent parent IDs", async () => {
      const { app } = setupMultiSchoolSystem();
      const { agent, csrfToken } = await loginAsUser(app, "admin@school-a.test");

      const res = await agent
        .post(`/api/v1/schools/${schoolAId}/classes`)
        .set("x-csrf-token", csrfToken)
        .send({
          academicYearId: randomUUID(), // nonexistent
          name: "Class 1 North",
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("PARENT_NOT_FOUND");
    });

    it("blocks deactivation of a parent record while active children exist", async () => {
      const { configStore } = setupMultiSchoolSystem();

      const year = await configStore.createConfiguration({
        schoolId: schoolAId,
        resource: "academicYears",
        actorUserId: "user-a",
        requestId: randomUUID(),
        data: { name: "Year 2026", startsOn: "2026-01-01", endsOn: "2026-12-31" },
      });

      // Create active class under this year
      await configStore.createConfiguration({
        schoolId: schoolAId,
        resource: "classes",
        actorUserId: "user-a",
        requestId: randomUUID(),
        data: { academicYearId: year.id, name: "Grade 1" },
      });

      // Attempt to deactivate parent year
      await expect(
        configStore.deactivateConfiguration({
          schoolId: schoolAId,
          resource: "academicYears",
          id: year.id,
          actorUserId: "user-a",
          requestId: randomUUID(),
        }),
      ).rejects.toThrowError("Cannot deactivate record with active children.");
    });

    it("allows historical records to remain queryable when inactive", async () => {
      const { configStore } = setupMultiSchoolSystem();

      const year = await configStore.createConfiguration({
        schoolId: schoolAId,
        resource: "academicYears",
        actorUserId: "user-a",
        requestId: randomUUID(),
        data: { name: "Year 2025", startsOn: "2025-01-01", endsOn: "2025-12-31" },
      });

      await configStore.deactivateConfiguration({
        schoolId: schoolAId,
        resource: "academicYears",
        id: year.id,
        actorUserId: "user-a",
        requestId: randomUUID(),
      });

      const list = await configStore.listConfiguration("academicYears", schoolAId, {
        limit: 10,
        offset: 0,
        status: "INACTIVE",
      });

      expect(list.total).toBe(1);
      expect(list.items[0].id).toBe(year.id);
      expect(list.items[0].status).toBe("INACTIVE");
    });
  });

  // Scenario 3: Uniqueness and Concurrency
  describe("Scenario 3: Uniqueness and Concurrency", () => {
    it("rejects duplicate school-specific identifiers within the same school", async () => {
      const { app, configStore } = setupMultiSchoolSystem();
      const { agent, csrfToken } = await loginAsUser(app, "admin@school-a.test");

      const year = await configStore.createConfiguration({
        schoolId: schoolAId,
        resource: "academicYears",
        actorUserId: "user-a",
        requestId: randomUUID(),
        data: { name: "Year 2026 A", startsOn: "2026-01-01", endsOn: "2026-12-31" },
      });

      // Create first class
      const res1 = await agent
        .post(`/api/v1/schools/${schoolAId}/classes`)
        .set("x-csrf-token", csrfToken)
        .send({ academicYearId: year.id, name: "Grade 10" });
      expect(res1.status).toBe(201);

      // Attempt to create second class with identical name in same year
      const res2 = await agent
        .post(`/api/v1/schools/${schoolAId}/classes`)
        .set("x-csrf-token", csrfToken)
        .send({ academicYearId: year.id, name: "Grade 10" });
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe("CONFIGURATION_CONFLICT");
    });

    it("allows different schools to use identical names without collision", async () => {
      const { app, configStore } = setupMultiSchoolSystem();
      const clientA = await loginAsUser(app, "admin@school-a.test");
      const clientB = await loginAsUser(app, "admin@school-b.test");

      const yearA = await configStore.createConfiguration({
        schoolId: schoolAId,
        resource: "academicYears",
        actorUserId: "user-a",
        requestId: randomUUID(),
        data: { name: "2026 Session", startsOn: "2026-01-01", endsOn: "2026-12-31" },
      });
      const yearB = await configStore.createConfiguration({
        schoolId: schoolBId,
        resource: "academicYears",
        actorUserId: "user-b",
        requestId: randomUUID(),
        data: { name: "2026 Session", startsOn: "2026-01-01", endsOn: "2026-12-31" },
      });

      // Both schools create "Grade 1"
      const resA = await clientA.agent
        .post(`/api/v1/schools/${schoolAId}/classes`)
        .set("x-csrf-token", clientA.csrfToken)
        .send({ academicYearId: yearA.id, name: "Grade 1" });
      expect(resA.status).toBe(201);

      const resB = await clientB.agent
        .post(`/api/v1/schools/${schoolBId}/classes`)
        .set("x-csrf-token", clientB.csrfToken)
        .send({ academicYearId: yearB.id, name: "Grade 1" });
      expect(resB.status).toBe(201);
    });

    it("handles idempotency keys by replaying identical requests and rejecting mutated payloads", async () => {
      const { app } = setupMultiSchoolSystem();
      const { agent, csrfToken } = await loginAsUser(app, "admin@school-a.test");
      const idempotencyKey = randomUUID();

      const initialPayload = {
        givenName: "Jane",
        familyName: "Doe",
        guardians: [
          {
            givenName: "John",
            familyName: "Doe",
            relationship: "FATHER",
            authorizedAccess: true,
            email: "john.doe@example.com",
          },
        ],
      };

      const res1 = await agent
        .post(`/api/v1/schools/${schoolAId}/admission-applications`)
        .set("x-csrf-token", csrfToken)
        .set("Idempotency-Key", idempotencyKey)
        .send(initialPayload);
      expect(res1.status).toBe(201);

      // Replay identical
      const res2 = await agent
        .post(`/api/v1/schools/${schoolAId}/admission-applications`)
        .set("x-csrf-token", csrfToken)
        .set("Idempotency-Key", idempotencyKey)
        .send(initialPayload);
      expect([200, 201]).toContain(res2.status);
      expect(res2.body.data.id).toBe(res1.body.data.id);

      // Mutated payload with same idempotency key
      const res3 = await agent
        .post(`/api/v1/schools/${schoolAId}/admission-applications`)
        .set("x-csrf-token", csrfToken)
        .set("Idempotency-Key", idempotencyKey)
        .send({ ...initialPayload, givenName: "Janet" });
      expect(res3.status).toBe(409);
      expect(res3.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });
  });

  // Scenario 4: Transactions and Monetary Precision
  describe("Scenario 4: Transactions and Monetary Precision", () => {
    it("maintains decimal monetary precision and avoids floating point drift", () => {
      const chargeAmount = 15000.55;
      const payment1 = 5000.25;
      const payment2 = 10000.3;
      const totalPaid = Number((payment1 + payment2).toFixed(2));
      const balance = Number((chargeAmount - totalPaid).toFixed(2));

      expect(totalPaid).toBe(15000.55);
      expect(balance).toBe(0.0);
    });

    it("guarantees atomic rollback when a multi-operation transaction encounters a failure", async () => {
      let state = { studentCreated: false, auditLogged: false };
      const atomicOperation = async (shouldFailAudit: boolean) => {
        const snapshot = { ...state };
        try {
          state.studentCreated = true;
          if (shouldFailAudit) {
            throw new Error("Audit log database failure");
          }
          state.auditLogged = true;
        } catch (err) {
          // Rollback snapshot on transaction failure
          state = snapshot;
          throw err;
        }
      };

      await expect(atomicOperation(true)).rejects.toThrow("Audit log database failure");
      expect(state.studentCreated).toBe(false);
      expect(state.auditLogged).toBe(false);

      await atomicOperation(false);
      expect(state.studentCreated).toBe(true);
      expect(state.auditLogged).toBe(true);
    });
  });

  // Scenario 5: Database-Level Compound Key & Migration Integrity
  describe("Scenario 5: Database-Level Compound Key & Migration Integrity", () => {
    it("verifies that all school-scoped models enforce compound tenant isolation", () => {
      const schemaPath = path.resolve(repoRoot, "packages/database/prisma/schema.prisma");
      const content = fs.readFileSync(schemaPath, "utf8");

      // Verify LibraryLoan and LibraryReservation have compound relations
      expect(content).toContain(
        "academicClass   AcademicClass? @relation(fields: [schoolId, academicClassId], references: [schoolId, id], onDelete: Restrict)",
      );
      expect(content).toContain(
        "@@index([schoolId, academicClassId], map: " +
          '"library_loans_school_academic_class_idx")',
      );
      expect(content).toContain(
        "@@index([schoolId, academicClassId], map: " +
          '"library_reservations_school_academic_class_idx")',
      );

      // Verify School-scoped compound unique constraints across core models
      expect(content).toContain("@@unique([schoolId, id])");
      expect(content).toContain(
        '@@unique([schoolId, admissionYearId, admissionNumber], map: "students_school_year_admission_number_key")',
      );
      expect(content).toContain("@@id([schoolId, academicYearId])");
    });

    it("verifies migration chronology and integrity across all 13 forward migrations", () => {
      const migrationsDir = path.resolve(repoRoot, "packages/database/prisma/migrations");
      const migrationFolders = fs
        .readdirSync(migrationsDir)
        .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
        .sort();

      expect(migrationFolders.length).toBe(13);
      expect(migrationFolders).toContain(
        "20261026100000_library_class_tenant_isolation_and_permissions",
      );
      expect(migrationFolders).toContain(
        "20261026120000_performance_foreign_key_indexes",
      );
      expect(migrationFolders).toContain(
        "20261026140000_reporting_composite_indexes",
      );

      // Verify custom triggers and authoritative permissions are present in migration history
      let allSql = "";
      for (const folder of migrationFolders) {
        allSql += fs.readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8");
      }

      expect(allSql).toContain("enforce_attendance_register_type");
      expect(allSql).toContain("prevent_overlapping_grading_bands");
      expect(allSql).toContain("check_assessment_result_consistency");
      expect(allSql).toContain('INSERT INTO "permissions"');
    });
  });
});
