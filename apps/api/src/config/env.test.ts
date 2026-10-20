import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./env.js";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  DIRECT_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
};

describe("parseEnvironment", () => {
  it("parses safe defaults and an explicit CORS allowlist", () => {
    expect(
      parseEnvironment({
        ...validEnvironment,
        CORS_ORIGINS: "http://localhost:5173,https://school.example",
      }),
    ).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      CORS_ORIGINS: ["http://localhost:5173", "https://school.example"],
    });
  });

  it("rejects missing database configuration", () => {
    expect(() => parseEnvironment({})).toThrow();
  });

  it("does not require migration credentials at runtime", () => {
    expect(
      parseEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        RATE_LIMIT_HMAC_KEY: validEnvironment.RATE_LIMIT_HMAC_KEY,
        PLATFORM_MFA_ENCRYPTION_KEY: validEnvironment.PLATFORM_MFA_ENCRYPTION_KEY,
      }).DIRECT_URL,
    ).toBeUndefined();
  });

  it("rejects non-PostgreSQL URLs", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: "https://example.com",
      }),
    ).toThrow();
  });

  it("rejects CORS URLs that include a path", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        CORS_ORIGINS: "https://school.example/path",
      }),
    ).toThrow();
  });
});
