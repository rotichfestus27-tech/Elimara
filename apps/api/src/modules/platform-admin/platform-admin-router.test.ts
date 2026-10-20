import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import { AuthService } from "../identity/auth-service.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { PlatformAdminService } from "./platform-admin-service.js";
import { FakePlatformAdminStore } from "./test-support/fake-platform-admin-store.js";
import { generateTotpCode } from "./totp.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});

const user = {
  id: "user-platform-admin",
  email: "platform-admin@example.test",
  status: "ACTIVE" as const,
  passwordHash: "hash:Correct Horse Battery Staple",
};
const fakeHasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

async function setup(isAdmin: boolean) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set(user.id, { ...user });
  if (isAdmin) identityStore.platformAdmins.add(user.id);
  const authService = new AuthService(identityStore, fakeHasher, config);
  const platformStore = new FakePlatformAdminStore((userId, now) => {
    for (const session of identityStore.sessions.values()) {
      if (session.userId === userId) session.mfaVerifiedAt = now;
    }
  });
  if (isAdmin) {
    platformStore.mfaRecords.set(user.id, {
      passwordHash: user.passwordHash,
      active: true,
      revokedAt: null,
      pendingTotpSecretEncrypted: null,
      pendingTotpSecretExpiresAt: null,
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
    });
  }
  const platformService = new PlatformAdminService(
    platformStore,
    identityStore,
    authService,
    config,
  );
  const app = createApp(config, {
    checkDatabase: async () => {},
    authService,
    platformAdminService: platformService,
  });
  const session = await authService.login(
    user.email,
    "Correct Horse Battery Staple",
    "127.0.0.1",
    "login-request",
  );
  const cookie = `${config.SESSION_COOKIE_NAME}=${session.sessionToken}; ${config.CSRF_COOKIE_NAME}=${session.csrfToken}`;
  return { app, authService, identityStore, platformStore, session, cookie };
}

describe("platform administration security and operations", () => {
  it("denies anonymous, school-only, and non-MFA platform requests", async () => {
    const nonAdmin = await setup(false);
    const anonymous = await request(nonAdmin.app).get("/api/v1/platform/summary");
    const schoolOnly = await request(nonAdmin.app)
      .get("/api/v1/platform/summary")
      .set("Cookie", nonAdmin.cookie);
    expect(anonymous.status).toBe(401);
    expect(schoolOnly.status).toBe(403);

    const admin = await setup(true);
    const initialMfaStatus = await request(admin.app)
      .get("/api/v1/platform/mfa/status")
      .set("Cookie", admin.cookie);
    expect(initialMfaStatus.status).toBe(200);
    expect(initialMfaStatus.body.data).toEqual({ enrolled: false, sessionVerified: false });
    const needsMfa = await request(admin.app)
      .get("/api/v1/platform/summary")
      .set("Cookie", admin.cookie);
    expect(needsMfa.status).toBe(403);
    expect(needsMfa.body.error.code).toBe("PLATFORM_MFA_REQUIRED");
  });

  it("requires CSRF protection and password confirmation for first-factor enrollment", async () => {
    const setupState = await setup(true);
    const csrfMissing = await request(setupState.app)
      .post("/api/v1/platform/mfa/enrollment")
      .set("Cookie", setupState.cookie)
      .send({ password: "Correct Horse Battery Staple" });
    expect(csrfMissing.status).toBe(403);

    const invalidPassword = await request(setupState.app)
      .post("/api/v1/platform/mfa/enrollment")
      .set("Cookie", setupState.cookie)
      .set("X-CSRF-Token", setupState.session.csrfToken)
      .send({ password: "incorrect password" });
    expect(invalidPassword.status).toBe(401);
    expect(JSON.stringify(invalidPassword.body)).not.toContain(user.passwordHash);
  });

  it("rejects expired pending TOTP enrollment", async () => {
    const state = await setup(true);
    const enrollment = await request(state.app)
      .post("/api/v1/platform/mfa/enrollment")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ password: "Correct Horse Battery Staple" });
    expect(enrollment.status).toBe(201);

    const mfa = state.platformStore.mfaRecords.get(user.id);
    if (!mfa) throw new Error("Expected platform MFA state.");
    mfa.pendingTotpSecretExpiresAt = new Date(Date.now() - 1_000);

    const expired = await request(state.app)
      .post("/api/v1/platform/mfa/enrollment/confirm")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ code: "123456" });
    expect(expired.status).toBe(403);
  });

  it("enforces MFA, provisions suspended schools, and audits metadata-only operations", async () => {
    const state = await setup(true);
    const enrollment = await request(state.app)
      .post("/api/v1/platform/mfa/enrollment")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ password: "Correct Horse Battery Staple" });
    expect(enrollment.status).toBe(201);
    expect(enrollment.headers["cache-control"]).toBe("no-store");
    const secret = enrollment.body.data.secret as string;
    expect(enrollment.body.data.provisioningUri).toContain("otpauth://totp/");

    const actualCode = generateTotpCode(secret, new Date());
    const wrongCode = await request(state.app)
      .post("/api/v1/platform/mfa/enrollment/confirm")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ code: actualCode === "000000" ? "000001" : "000000" });
    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body.error.code).toBe("INVALID_MFA_CODE");

    const confirmed = await request(state.app)
      .post("/api/v1/platform/mfa/enrollment/confirm")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ code: actualCode });
    expect(confirmed.status).toBe(204);
    const mfaStatus = await request(state.app)
      .get("/api/v1/platform/mfa/status")
      .set("Cookie", state.cookie);
    expect(mfaStatus.body.data).toEqual({ enrolled: true, sessionVerified: true });

    const replayedCode = await request(state.app)
      .post("/api/v1/platform/mfa/verify")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ code: actualCode });
    expect(replayedCode.status).toBe(401);

    const schoolResponse = await request(state.app)
      .post("/api/v1/platform/schools")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ name: "Example School", contactEmail: "office@example.test" });
    expect(schoolResponse.status).toBe(201);
    const school = schoolResponse.body.data;
    expect(school.status).toBe("SUSPENDED");
    const updateSchool = await request(state.app)
      .patch(`/api/v1/platform/schools/${school.id}`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ name: "Example School Updated", contactEmail: null });
    expect(updateSchool.status).toBe(200);
    expect(updateSchool.body.data).toMatchObject({
      name: "Example School Updated",
      contactEmail: null,
      status: "SUSPENDED",
    });
    const emptySchoolUpdate = await request(state.app)
      .patch(`/api/v1/platform/schools/${school.id}`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({});
    expect(emptySchoolUpdate.status).toBe(400);

    const planResponse = await request(state.app)
      .post("/api/v1/platform/plans")
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({
        code: "STANDARD",
        name: "Standard",
        entitlements: { modules: "basic", max_staff: 20 },
      });
    expect(planResponse.status).toBe(201);
    expect(planResponse.body.data).not.toHaveProperty("price");
    const planId = planResponse.body.data.id as string;

    const assigned = await request(state.app)
      .put(`/api/v1/platform/schools/${school.id}/subscription`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ planId });
    expect(assigned.status).toBe(200);
    const repeatedAssignment = await request(state.app)
      .put(`/api/v1/platform/schools/${school.id}/subscription`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ planId });
    expect(repeatedAssignment.body.data.id).toBe(assigned.body.data.id);
    expect(state.platformStore.subscriptions).toHaveLength(1);

    const planUpdate = await request(state.app)
      .patch(`/api/v1/platform/plans/${planId}`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ name: "Standard v2", entitlements: { max_staff: 40 } });
    expect(planUpdate.status).toBe(200);
    const history = await request(state.app)
      .get(`/api/v1/platform/schools/${school.id}/subscriptions`)
      .set("Cookie", state.cookie);
    expect(history.body.data[0]).toMatchObject({
      planName: "Standard",
      entitlements: { max_staff: 20 },
    });

    const activate = await request(state.app)
      .patch(`/api/v1/platform/schools/${school.id}/status`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ status: "ACTIVE" });
    expect(activate.status).toBe(200);
    const close = await request(state.app)
      .patch(`/api/v1/platform/schools/${school.id}/status`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ status: "CLOSED" });
    expect(close.status).toBe(200);
    const invalidTransition = await request(state.app)
      .patch(`/api/v1/platform/schools/${school.id}/status`)
      .set("Cookie", state.cookie)
      .set("X-CSRF-Token", state.session.csrfToken)
      .send({ status: "SUSPENDED" });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe("INVALID_TRANSITION");

    const audit = await request(state.app)
      .get("/api/v1/platform/audit-events")
      .set("Cookie", state.cookie);
    expect(audit.status).toBe(200);
    expect(
      audit.body.data.some(
        (event: { eventType: string }) => event.eventType === "PLATFORM_SCHOOL_CREATED",
      ),
    ).toBe(true);
    expect(
      audit.body.data.find(
        (event: { eventType: string }) => event.eventType === "PLATFORM_SCHOOL_UPDATED",
      )?.metadata.changedFields,
    ).toEqual(["name", "contactEmail"]);
    expect(JSON.stringify(audit.body)).not.toContain("office@example.test");
    expect(JSON.stringify(audit.body)).not.toContain("student");
    expect(JSON.stringify(audit.body)).not.toContain("financial");
  });
});
