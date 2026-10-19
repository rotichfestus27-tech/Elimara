import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import { AuthService } from "./auth-service.js";
import type { PasswordHasher } from "./identity-store.js";
import { FakeIdentityStore } from "./test-support/fake-identity-store.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});

const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";

function setup(appConfig = config) {
  const store = new FakeIdentityStore();
  store.users.set("user-a", {
    id: "user-a",
    email: "admin@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  store.schools.set(schoolAId, {
    userId: "user-a",
    access: { id: schoolAId, name: "School A", permissions: [] },
  });
  const authService = new AuthService(store, hasher, appConfig);
  const app = createApp(appConfig, {
    authService,
    checkDatabase: async () => {},
  });
  return { app, store };
}

describe("authentication HTTP routes", () => {
  it("denies anonymous requests to protected identity routes", async () => {
    const { app } = setup();

    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects incorrect credentials without disclosing the submitted password", async () => {
    const { app } = setup();

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "admin@school-a.test",
      password: "Incorrect Password 123",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(JSON.stringify(response.body)).not.toContain("Incorrect Password 123");
  });

  it("rejects cross-origin login forms without creating a session", async () => {
    const { app, store } = setup();

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .type("form")
      .send({
        email: "admin@school-a.test",
        password: "Correct Horse Battery Staple",
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(store.sessions.size).toBe(0);
  });

  it("rejects cross-site metadata and non-JSON requests", async () => {
    const { app, store } = setup();

    const crossSiteJson = await request(app)
      .post("/api/v1/auth/login")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ email: "admin@school-a.test", password: "Correct Horse Battery Staple" });
    const formWithoutOrigin = await request(app)
      .post("/api/v1/auth/login")
      .type("form")
      .send({ email: "admin@school-a.test", password: "Correct Horse Battery Staple" });

    expect(crossSiteJson.status).toBe(403);
    expect(crossSiteJson.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(formWithoutOrigin.status).toBe(415);
    expect(formWithoutOrigin.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(store.sessions.size).toBe(0);
  });

  it("allows JSON login from an explicitly configured frontend origin", async () => {
    const frontendOrigin = "https://app.example.test";
    const frontendConfig = parseEnvironment({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgresql://localhost:5432/elimara",
      RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
      PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
      CORS_ORIGINS: frontendOrigin,
    });
    const { app } = setup(frontendConfig);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", frontendOrigin)
      .send({ email: "admin@school-a.test", password: "Correct Horse Battery Staple" });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("rejects deactivated users even when the submitted password is correct", async () => {
    const { app, store } = setup();
    const user = store.users.get("user-a");
    if (user) user.status = "DEACTIVATED";

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "admin@school-a.test",
      password: "Correct Horse Battery Staple",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(store.sessions.size).toBe(0);
  });

  it("sets HttpOnly session cookies and authenticates the user", async () => {
    const { app } = setup();
    const agent = request.agent(app);

    const login = await agent.post("/api/v1/auth/login").send({
      email: "ADMIN@SCHOOL-A.TEST",
      password: "Correct Horse Battery Staple",
    });
    const sessionCookie = login.headers["set-cookie"].find((cookie: string) =>
      cookie.startsWith(`${config.SESSION_COOKIE_NAME}=`),
    );
    const csrfCookie = login.headers["set-cookie"].find((cookie: string) =>
      cookie.startsWith(`${config.CSRF_COOKIE_NAME}=`),
    );

    expect(login.status).toBe(200);
    expect(sessionCookie).toContain("HttpOnly");
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(login.body.data.user).toEqual({
      id: "user-a",
      email: "admin@school-a.test",
    });
    await expect(agent.get("/api/v1/auth/me")).resolves.toMatchObject({
      status: 200,
      body: { data: { user: { id: "user-a" } } },
    });
  });

  it("sets Secure on production authentication cookies", async () => {
    const store = new FakeIdentityStore();
    store.users.set("user-a", {
      id: "user-a",
      email: "admin@school-a.test",
      passwordHash: "hash:Correct Horse Battery Staple",
      status: "ACTIVE",
    });
    const productionConfig = parseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
      RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
      PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
    });
    const app = createApp(productionConfig, {
      authService: new AuthService(store, hasher, productionConfig),
      checkDatabase: async () => {},
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "admin@school-a.test",
      password: "Correct Horse Battery Staple",
    });

    expect(response.status).toBe(200);
    expect(
      response.headers["set-cookie"].every((cookie: string) => cookie.includes("Secure")),
    ).toBe(true);
  });

  it("requires CSRF verification for logout and revokes the session", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    const login = await agent.post("/api/v1/auth/login").send({
      email: "admin@school-a.test",
      password: "Correct Horse Battery Staple",
    });
    const csrfCookie = login.headers["set-cookie"].find((cookie: string) =>
      cookie.startsWith(`${config.CSRF_COOKIE_NAME}=`),
    );
    const csrfToken = csrfCookie.split(";")[0].split("=")[1];

    const denied = await agent.post("/api/v1/auth/logout");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("CSRF_VALIDATION_FAILED");

    const logout = await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrfToken);
    expect(logout.status).toBe(204);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("prevents school A users from resolving school B context", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({
      email: "admin@school-a.test",
      password: "Correct Horse Battery Staple",
    });

    const response = await agent.get(`/api/v1/schools/${schoolBId}/access`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SCHOOL_NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("School B");
  });

  it("does not allow school administrators to enter the platform control plane", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({
      email: "admin@school-a.test",
      password: "Correct Horse Battery Staple",
    });

    const response = await agent.get("/api/v1/platform/access");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("does not imply recovery is available before a delivery adapter is configured", async () => {
    const { app } = setup();

    const response = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "admin@school-a.test" });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("RECOVERY_UNAVAILABLE");
  });
});
