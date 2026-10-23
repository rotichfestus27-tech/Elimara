import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { AppConfig } from "./config/env.js";
import { ApiError } from "./http/errors/api-error.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  LOG_LEVEL: "silent",
  CORS_ORIGINS: ["http://localhost:5173"],
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  DIRECT_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
  TRUST_PROXY_HOPS: 0,
  DATABASE_READY_TIMEOUT_MS: 2000,
  SESSION_COOKIE_NAME: "elimara_session",
  CSRF_COOKIE_NAME: "elimara_csrf",
  SESSION_TTL_HOURS: 12,
  COOKIE_SAME_SITE: "lax",
};

describe("API foundation", () => {
  it("serves liveness without checking dependencies", async () => {
    const checkDatabase = vi.fn<() => Promise<void>>();
    const app = createApp(config, { checkDatabase });

    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "live" } });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("reports ready when the database check succeeds", async () => {
    const app = createApp(config, {
      checkDatabase: async () => {},
    });

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ready" } });
  });

  it("reports not ready when the database check fails", async () => {
    const app = createApp(config, {
      checkDatabase: async () => {
        throw new Error("private database detail: postgresql://admin:secret@db:5432/elimara");
      },
    });

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: "SERVICE_NOT_READY",
      message: "Service is not ready.",
    });
    expect(JSON.stringify(response.body)).not.toContain("private database detail");
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  it("reports not ready when the database check exceeds the configured timeout", async () => {
    const timeoutConfig: AppConfig = {
      ...config,
      DATABASE_READY_TIMEOUT_MS: 50,
    };
    const app = createApp(timeoutConfig, {
      checkDatabase: () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 300);
        }),
    });

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: "SERVICE_NOT_READY",
      message: "Database readiness check timed out.",
    });
  });

  it("handles late rejection after timeout without unhandled promise rejection", async () => {
    const timeoutConfig: AppConfig = {
      ...config,
      DATABASE_READY_TIMEOUT_MS: 30,
    };
    let unhandledTriggered = false;
    const originalListener = () => {
      unhandledTriggered = true;
    };
    process.on("unhandledRejection", originalListener);

    try {
      const app = createApp(timeoutConfig, {
        checkDatabase: () =>
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("late socket failure")), 60);
          }),
      });

      const response = await request(app).get("/health/ready");
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("SERVICE_NOT_READY");

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandledTriggered).toBe(false);
    } finally {
      process.off("unhandledRejection", originalListener);
    }
  });

  it("returns a consistent error for unknown routes", async () => {
    const app = createApp(config, {
      checkDatabase: async () => {},
    });

    const response = await request(app).get("/api/v1/not-implemented");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      requestId: response.headers["x-request-id"],
    });
  });

  it("rejects request bodies larger than the configured limit", async () => {
    const app = createApp(config, { checkDatabase: async () => {} });

    const response = await request(app)
      .post("/api/v1/not-implemented")
      .send({ content: "x".repeat(1_100_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns a structured error for malformed JSON", async () => {
    const app = createApp(config, { checkDatabase: async () => {} });

    const response = await request(app)
      .post("/api/v1/not-implemented")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("applies security headers and the configured CORS allowlist", async () => {
    const app = createApp(config, {
      checkDatabase: async () => {},
    });

    const allowed = await request(app).get("/health/live").set("Origin", "http://localhost:5173");
    const denied = await request(app).get("/health/live").set("Origin", "https://unlisted.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();
  });

  it("maps explicit API errors without leaking implementation details", async () => {
    const app = createApp(config, {
      checkDatabase: async () => {
        throw new ApiError(409, "CONFLICT", "Request conflicts with current state.");
      },
    });

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });
});
