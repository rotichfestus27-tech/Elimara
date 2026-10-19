import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { AssessmentService } from "./assessment-service.js";
import { FakeAssessmentStore } from "./test-support/fake-assessment-store.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});
const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";
const userId = "teacher-a";
const assessmentId = "3f1303b0-fd26-42fc-893f-dc6f1bd10767";
const allPermissions = [
  "assessments.read",
  "assessments.manage",
  "results.enter",
  "results.correct",
  "results.moderate",
  "results.finalize",
  "results.publish",
];
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(permissions = allPermissions) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set(userId, {
    id: userId,
    email: "teacher@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId,
    access: { id: schoolAId, name: "Elimara Academy", permissions },
  });
  const store = new FakeAssessmentStore();
  const authService = new AuthService(identityStore, hasher, config);
  const app = createApp(config, {
    authService,
    assessmentService: new AssessmentService(store),
    checkDatabase: async () => {},
  });
  return { app, store, identityStore };
}

async function login(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({
    email: "teacher@school-a.test",
    password: "Correct Horse Battery Staple",
  });
  const csrfCookie = (response.headers["set-cookie"] as string[]).find((cookie) =>
    cookie.startsWith(`${config.CSRF_COOKIE_NAME}=`),
  );
  if (!csrfCookie) throw new Error("Login response did not set a CSRF cookie.");
  const csrfToken = csrfCookie.split(";")[0]?.split("=")[1];
  if (!csrfToken) throw new Error("Login response did not set a CSRF token.");
  return { agent, csrfToken };
}

function addAssessment(store: FakeAssessmentStore, status: "OPEN" | "PUBLISHED" = "OPEN") {
  store.schoolIds.set(assessmentId, schoolAId);
  store.assessments.set(assessmentId, {
    id: assessmentId,
    academicYearId: randomUUID(),
    termId: randomUUID(),
    classId: randomUUID(),
    streamId: null,
    classSubjectAssignmentId: randomUUID(),
    subjectId: randomUUID(),
    subjectName: "Mathematics",
    gradingScaleId: randomUUID(),
    name: "Term 1 Examination",
    startsOn: new Date("2026-10-01T00:00:00.000Z"),
    endsOn: new Date("2026-10-02T00:00:00.000Z"),
    maximumScore: "100.0000",
    status,
    eligibleCount: 1,
    enteredCount: 0,
    missingCount: 1,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  });
}

describe("assessments and results API", () => {
  it("requires authentication, exact permission, and authorized school membership", async () => {
    const anonymous = setup();
    expect(
      (await request(anonymous.app).get(`/api/v1/schools/${schoolAId}/assessments`)).status,
    ).toBe(401);

    const denied = setup(["staff.profile.read"]);
    const deniedAgent = await login(denied.app);
    expect((await deniedAgent.agent.get(`/api/v1/schools/${schoolAId}/assessments`)).status).toBe(
      403,
    );

    const authorized = setup();
    const signedIn = await login(authorized.app);
    const foreignSchool = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/assessments`);
    expect(foreignSchool.status).toBe(404);
    expect(foreignSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });

  it("rejects duplicate students in one mark submission before persistence", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const studentId = randomUUID();
    const response = await agent
      .post(`/api/v1/schools/${schoolAId}/assessments/${assessmentId}/marks`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        results: [
          { studentId, score: "80" },
          { studentId, score: "70" },
        ],
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("denies publication without its separate permission and preserves assessment state", async () => {
    const { app, store } = setup(["assessments.read"]);
    addAssessment(store, "OPEN");
    const { agent, csrfToken } = await login(app);
    const response = await agent
      .post(`/api/v1/schools/${schoolAId}/assessments/${assessmentId}/publish`)
      .set("X-CSRF-Token", csrfToken);
    expect(response.status).toBe(403);
    expect(store.assessments.get(assessmentId)?.status).toBe("OPEN");
  });

  it("does not allow an open assessment to be published as finalized", async () => {
    const { app, store } = setup();
    addAssessment(store, "OPEN");
    const { agent, csrfToken } = await login(app);
    const response = await agent
      .post(`/api/v1/schools/${schoolAId}/assessments/${assessmentId}/publish`)
      .set("X-CSRF-Token", csrfToken);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_STATUS");
    expect(store.assessments.get(assessmentId)?.status).toBe("OPEN");
  });
});
