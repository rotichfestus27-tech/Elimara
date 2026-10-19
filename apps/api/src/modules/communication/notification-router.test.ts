import request from "supertest";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { NotificationService } from "./notification-service.js";
import { NotificationTemplateRegistry } from "./notification-templates.js";
import { FakeNotificationStore } from "./test-support/fake-notification-store.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});
const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";
const userId = "user-a";
const otherUserId = "user-b";
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(permissions = ["communication.notifications.read"]) {
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
  const notificationStore = new FakeNotificationStore();
  notificationStore.eligibleRecipients.add(`${schoolAId}:${userId}`);
  notificationStore.eligibleRecipients.add(`${schoolAId}:${otherUserId}`);
  const templates = new NotificationTemplateRegistry();
  templates.register({
    key: "test.notice",
    channel: "IN_APP",
    input: z.object({ message: z.string() }),
    render: ({ message }) => ({ title: "Notice", body: message }),
  });
  const notificationService = new NotificationService(notificationStore, templates);
  const app = createApp(config, {
    authService,
    notificationService,
    checkDatabase: async () => {},
  });
  return { app, notificationStore, notificationService };
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

describe("notifications API", () => {
  it("requires authentication, school membership, and the inbox permission", async () => {
    const { app } = setup();
    const path = `/api/v1/schools/${schoolAId}/notifications`;
    expect((await request(app).get(path)).status).toBe(401);

    const noPermission = setup([]);
    const denied = await login(noPermission.app);
    expect((await denied.agent.get(path)).status).toBe(403);

    const authorized = setup();
    const signedIn = await login(authorized.app);
    const crossSchool = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/notifications`);
    expect(crossSchool.status).toBe(404);
    expect(crossSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });

  it("returns only the authenticated recipient's in-app notifications and protects read state", async () => {
    const { app, notificationService, notificationStore } = setup();
    const own = await notificationService.enqueue({
      schoolId: schoolAId,
      recipientUserId: userId,
      eventKey: "own-event",
      templateKey: "test.notice",
      templateData: { message: "Own notice" },
    });
    const other = await notificationService.enqueue({
      schoolId: schoolAId,
      recipientUserId: otherUserId,
      eventKey: "other-event",
      templateKey: "test.notice",
      templateData: { message: "Other user's notice" },
    });
    const ownRecord = notificationStore.notifications.get(own.id);
    const otherRecord = notificationStore.notifications.get(other.id);
    if (!ownRecord || !otherRecord)
      throw new Error("Expected notification records to be enqueued.");
    ownRecord.status = "DELIVERED";
    otherRecord.status = "DELIVERED";

    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}/notifications`;
    const inbox = await agent.get(base);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0].body).toBe("Own notice");
    expect(Object.keys(inbox.body.data[0]).sort()).toEqual(
      ["id", "title", "body", "status", "createdAt", "sentAt", "deliveredAt", "readAt"].sort(),
    );

    const foreignRead = await agent.post(`${base}/${other.id}/read`).set("X-CSRF-Token", csrfToken);
    expect(foreignRead.status).toBe(404);
    expect(notificationStore.notifications.get(other.id)?.readAt).toBeNull();

    const read = await agent.post(`${base}/${own.id}/read`).set("X-CSRF-Token", csrfToken);
    expect(read.status).toBe(204);
    expect(notificationStore.notifications.get(own.id)?.readAt).toBeInstanceOf(Date);
  });

  it("validates bounded inbox pagination", async () => {
    const { app } = setup();
    const { agent } = await login(app);
    const response = await agent.get(`/api/v1/schools/${schoolAId}/notifications?limit=101`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });
});
