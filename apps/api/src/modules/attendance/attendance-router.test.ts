import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { AttendanceService } from "./attendance-service.js";
import { FakeOperationsStore } from "./test-support/fake-operations-store.js";

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
const allPermissions = [
  "attendance.register.read",
  "attendance.register.manage",
  "attendance.register.correct",
];
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(permissions = allPermissions) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set(userId, {
    id: userId,
    email: "staff@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId,
    access: { id: schoolAId, name: "Elimara Academy", permissions },
  });
  const store = new FakeOperationsStore();
  const authService = new AuthService(identityStore, hasher, config);
  const app = createApp(config, {
    authService,
    attendanceService: new AttendanceService(store),
    checkDatabase: async () => {},
  });
  return { app, store, identityStore };
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

async function createStaffRegister(agent: request.SuperAgentTest, csrfToken: string) {
  return agent
    .post(`/api/v1/schools/${schoolAId}/attendance/registers`)
    .set("X-CSRF-Token", csrfToken)
    .send({
      academicYearId: randomUUID(),
      date: "2026-10-19",
      type: "STAFF_DAILY",
    });
}

describe("attendance API", () => {
  it("requires authentication, the exact permission, and the authorized school", async () => {
    const anonymous = setup();
    expect(
      (await request(anonymous.app).get(`/api/v1/schools/${schoolAId}/attendance/reasons`)).status,
    ).toBe(401);

    const denied = setup(["staff.profile.read"]);
    const deniedAgent = await login(denied.app);
    expect(
      (await deniedAgent.agent.get(`/api/v1/schools/${schoolAId}/attendance/reasons`)).status,
    ).toBe(403);

    const authorized = setup();
    const signedIn = await login(authorized.app);
    const foreignSchool = await signedIn.agent.get(
      `/api/v1/schools/${schoolBId}/attendance/registers`,
    );
    expect(foreignSchool.status).toBe(404);
    expect(foreignSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });

  it("rejects invalid statuses and prevents duplicate attendees in a register", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const registerId = randomUUID();
    const invalid = await agent
      .post(`/api/v1/schools/${schoolAId}/attendance/registers/${registerId}/records`)
      .set("X-CSRF-Token", csrfToken)
      .send({ staffId: randomUUID(), status: "ON_TIME" });
    expect(invalid.status).toBe(400);

    const register = await createStaffRegister(agent, csrfToken);
    expect(register.status).toBe(201);
    const staffId = randomUUID();
    const first = await agent
      .post(`/api/v1/schools/${schoolAId}/attendance/registers/${register.body.data.id}/records`)
      .set("X-CSRF-Token", csrfToken)
      .send({ staffId, status: "PRESENT" });
    expect(first.status).toBe(201);

    const duplicate = await agent
      .post(`/api/v1/schools/${schoolAId}/attendance/registers/${register.body.data.id}/records`)
      .set("X-CSRF-Token", csrfToken)
      .send({ staffId, status: "ABSENT" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE");
  });

  it("requires correction permission and records corrections to finalized registers", async () => {
    const { app, store, identityStore } = setup([
      "attendance.register.read",
      "attendance.register.manage",
    ]);
    const { agent, csrfToken } = await login(app);
    const register = await createStaffRegister(agent, csrfToken);
    const staffId = randomUUID();
    const record = await agent
      .post(`/api/v1/schools/${schoolAId}/attendance/registers/${register.body.data.id}/records`)
      .set("X-CSRF-Token", csrfToken)
      .send({ staffId, status: "PRESENT" });
    expect(record.status).toBe(201);

    const finalized = await agent
      .post(`/api/v1/schools/${schoolAId}/attendance/registers/${register.body.data.id}/finalize`)
      .set("X-CSRF-Token", csrfToken);
    expect(finalized.status).toBe(200);
    const correctionPath = `/api/v1/schools/${schoolAId}/attendance/registers/${register.body.data.id}/records/${record.body.data.id}`;
    const denied = await agent
      .patch(correctionPath)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "ABSENT" });
    expect(denied.status).toBe(403);

    identityStore.schools.set(schoolAId, {
      userId,
      access: {
        id: schoolAId,
        name: "Elimara Academy",
        permissions: [...allPermissions],
      },
    });
    const corrected = await agent
      .patch(correctionPath)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "ABSENT" });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.status).toBe("ABSENT");
    expect(store.revisions).toHaveLength(1);
  });
});
