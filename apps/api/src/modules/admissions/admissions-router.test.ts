import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { AdmissionsService } from "./admissions-service.js";
import { FakeAdmissionsStore } from "./test-support/fake-admissions-store.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});
const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";
const userId = "user-a";
const permissions = [
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
];
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(grantedPermissions = permissions) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set(userId, {
    id: userId,
    email: "staff@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId,
    access: { id: schoolAId, name: "Elimara Academy", permissions: grantedPermissions },
  });
  const authService = new AuthService(identityStore, hasher, config);
  const admissionsStore = new FakeAdmissionsStore();
  const app = createApp(config, {
    authService,
    admissionsService: new AdmissionsService(admissionsStore),
    checkDatabase: async () => {},
  });
  return { app, admissionsStore };
}

async function login(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({
    email: "staff@school-a.test",
    password: "Correct Horse Battery Staple",
  });
  const csrfCookie = (response.headers["set-cookie"] as string[]).find((cookie) =>
    cookie.startsWith(`${config.CSRF_COOKIE_NAME}=`),
  );
  if (!csrfCookie) throw new Error("Login response did not set a CSRF cookie.");
  const csrfToken = csrfCookie.split(";")[0]?.split("=")[1];
  if (!csrfToken) throw new Error("CSRF cookie did not contain a token.");
  return { agent, csrfToken };
}

function applicationPayload(givenName = "Amina") {
  return {
    givenName,
    middleName: null,
    familyName: "Otieno",
    dateOfBirth: "2017-03-14",
    guardians: [
      {
        givenName: "Grace",
        familyName: "Otieno",
        phone: "+254700000000",
        relationship: "Parent",
        authorizedAccess: true,
      },
    ],
  };
}

describe("admissions and student API", () => {
  it("requires authentication, active school membership, and the exact permission", async () => {
    const { app } = setup();
    const path = `/api/v1/schools/${schoolAId}/students`;
    const anonymous = await request(app).get(path);
    expect(anonymous.status).toBe(401);

    const noPermission = setup([]);
    const { agent } = await login(noPermission.app);
    const denied = await agent.get(path);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const allowed = setup();
    const signedIn = await login(allowed.app);
    const crossSchool = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/students`);
    expect(crossSchool.status).toBe(404);
    expect(crossSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
    expect(JSON.stringify(crossSchool.body)).not.toContain("student");
  });

  it("validates guardian requirements and protects mutations with CSRF", async () => {
    const { app, admissionsStore } = setup();
    const { agent, csrfToken } = await login(app);
    const path = `/api/v1/schools/${schoolAId}/admission-applications`;
    const missingCsrf = await agent
      .post(path)
      .set("Idempotency-Key", randomUUID())
      .send(applicationPayload());
    expect(missingCsrf.status).toBe(403);

    const invalid = await agent
      .post(path)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", randomUUID())
      .send({ ...applicationPayload(), guardians: [] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    expect(admissionsStore.applications.size).toBe(0);

    const noGuardianContact = await agent
      .post(path)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", randomUUID())
      .send({
        ...applicationPayload(),
        guardians: [
          {
            givenName: "Grace",
            familyName: "Otieno",
            relationship: "Parent",
            authorizedAccess: true,
          },
        ],
      });
    expect(noGuardianContact.status).toBe(400);
    expect(admissionsStore.applications.size).toBe(0);
  });

  it("creates idempotent drafts, flags possible duplicates, and admits only once", async () => {
    const { app, admissionsStore } = setup();
    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}`;
    const idempotencyKey = randomUUID();
    const first = await agent
      .post(`${base}/admission-applications`)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", idempotencyKey)
      .send(applicationPayload());
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("DRAFT");
    expect(first.body.data.possibleDuplicate).toBe(false);
    expect(first.body.data.guardians[0].phone).toBe("+254700000000");
    expect(JSON.stringify(first.body)).not.toMatch(/password|token/i);

    const replay = await agent
      .post(`${base}/admission-applications`)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", idempotencyKey)
      .send(applicationPayload());
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(admissionsStore.applications.size).toBe(1);

    const reusedKey = await agent
      .post(`${base}/admission-applications`)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", idempotencyKey)
      .send(applicationPayload("Different"));
    expect(reusedKey.status).toBe(409);
    expect(reusedKey.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const potentialDuplicate = await agent
      .post(`${base}/admission-applications`)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", randomUUID())
      .send(applicationPayload());
    expect(potentialDuplicate.status).toBe(201);
    expect(potentialDuplicate.body.data.possibleDuplicate).toBe(true);

    const applicationId = first.body.data.id as string;
    const transitionPath = `${base}/admission-applications/${applicationId}/transitions`;
    for (const transition of ["submit", "review", "accept"]) {
      const result = await agent
        .post(transitionPath)
        .set("X-CSRF-Token", csrfToken)
        .send({ transition });
      expect(result.status).toBe(200);
    }

    const duplicateId = potentialDuplicate.body.data.id as string;
    const duplicateTransitionPath = `${base}/admission-applications/${duplicateId}/transitions`;
    for (const transition of ["submit", "review", "accept"]) {
      const result = await agent
        .post(duplicateTransitionPath)
        .set("X-CSRF-Token", csrfToken)
        .send({ transition });
      expect(result.status).toBe(200);
    }

    const admissionInput = {
      academicYearId: randomUUID(),
      classId: randomUUID(),
    };
    const admitPath = `${base}/admission-applications/${applicationId}/admit`;
    const [firstAdmission, idempotentRetry, concurrentAdmission] = await Promise.all([
      agent.post(admitPath).set("X-CSRF-Token", csrfToken).send(admissionInput),
      agent.post(admitPath).set("X-CSRF-Token", csrfToken).send(admissionInput),
      agent
        .post(`${base}/admission-applications/${duplicateId}/admit`)
        .set("X-CSRF-Token", csrfToken)
        .send(admissionInput),
    ]);
    expect(
      [firstAdmission.status, idempotentRetry.status, concurrentAdmission.status].sort(),
    ).toEqual([200, 201, 201]);
    expect(firstAdmission.body.data.id).toBe(idempotentRetry.body.data.id);
    expect(firstAdmission.body.data.admissionNumber).toBe("2026/001");
    expect(concurrentAdmission.body.data.admissionNumber).toBe("2026/002");
    expect(admissionsStore.students.size).toBe(2);
    expect(admissionsStore.studentGuardians).toHaveLength(2);
    expect(admissionsStore.studentGuardians[0]?.authorizedAccess).toBe(true);

    const studentId = firstAdmission.body.data.id as string;
    const linkedGuardianId = admissionsStore.studentGuardians[0]?.guardianId;
    if (!linkedGuardianId) throw new Error("Admission did not create a guardian link.");
    const revoked = await agent
      .patch(`${base}/students/${studentId}/guardians/${linkedGuardianId}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ authorizedAccess: false });
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.authorizedAccess).toBe(false);

    const correction = await agent
      .patch(`${base}/students/${studentId}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ givenName: "Amina Rose" });
    expect(correction.status).toBe(200);
    expect(correction.body.data.givenName).toBe("Amina Rose");
    const profileHistory = await agent.get(`${base}/students/${studentId}/profile-history?limit=1`);
    expect(profileHistory.status).toBe(200);
    expect(profileHistory.body.data[0].givenName).toBe("Amina");
    expect(profileHistory.body.meta).toEqual({ limit: 1, offset: 0, total: 1 });

    const statusChange = await agent
      .post(`${base}/students/${studentId}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "WITHDRAWN" });
    expect(statusChange.status).toBe(200);
    const repeatedStatusChange = await agent
      .post(`${base}/students/${studentId}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "WITHDRAWN" });
    expect(repeatedStatusChange.status).toBe(409);

    const invalidTransition = await agent
      .post(transitionPath)
      .set("X-CSRF-Token", csrfToken)
      .send({ transition: "reject" });
    expect(invalidTransition.status).toBe(409);
  });

  it("returns non-disclosing record errors for another school's identifiers", async () => {
    const { app, admissionsStore } = setup();
    const foreignStudentId = randomUUID();
    admissionsStore.seedStudentForTest(schoolBId, {
      id: foreignStudentId,
      admissionNumber: "2026/999",
      admissionYearId: randomUUID(),
      admissionApplicationId: randomUUID(),
      givenName: "Confidential",
      middleName: null,
      familyName: "Student",
      dateOfBirth: null,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { agent } = await login(app);
    const response = await agent.get(`/api/v1/schools/${schoolAId}/students/${foreignStudentId}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("RECORD_NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("Confidential");
    expect(JSON.stringify(response.body)).not.toContain(foreignStudentId);
  });
});
