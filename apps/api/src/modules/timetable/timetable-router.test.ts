import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { FakeOperationsStore } from "../attendance/test-support/fake-operations-store.js";
import { TimetableService } from "./timetable-service.js";

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
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(permissions: string[]) {
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
  const authService = new AuthService(identityStore, hasher, config);
  const app = createApp(config, {
    authService,
    timetableService: new TimetableService(new FakeOperationsStore()),
    checkDatabase: async () => {},
  });
  return app;
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
  return { agent };
}

describe("timetable API authorization", () => {
  it("requires timetable permissions and rejects a foreign school selector", async () => {
    const noPermission = setup(["attendance.register.read"]);
    const denied = await login(noPermission);
    expect((await denied.agent.get(`/api/v1/schools/${schoolAId}/rooms`)).status).toBe(403);

    const authorized = setup(["timetable.read"]);
    const signedIn = await login(authorized);
    const foreignSchool = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/rooms`);
    expect(foreignSchool.status).toBe(404);
    expect(foreignSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });
});
