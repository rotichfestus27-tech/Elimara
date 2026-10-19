import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../config/env.js";
import type { ApiError } from "../../http/errors/api-error.js";
import { AuthService, digest } from "./auth-service.js";
import { assertCanGrantPermissions, assertPermission } from "../authorization/permission-policy.js";
import type { PasswordHasher } from "./identity-store.js";
import { FakeIdentityStore } from "./test-support/fake-identity-store.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});

const fakeHasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function activeUser(
  store: FakeIdentityStore,
  overrides: Partial<{
    id: string;
    email: string;
    status: "PENDING" | "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
    passwordHash: string | null;
  }> = {},
) {
  const user = {
    id: "user-1",
    email: "person@example.test",
    status: "ACTIVE" as const,
    passwordHash: "hash:Correct Horse Battery Staple",
    ...overrides,
  };
  store.users.set(user.id, user);
  return user;
}

describe("authentication and authorization foundation", () => {
  it("rejects incorrect credentials with a generic error", async () => {
    const store = new FakeIdentityStore();
    activeUser(store);
    const service = new AuthService(store, fakeHasher, config);

    await expect(
      service.login("person@example.test", "Wrong Password 123", "127.0.0.1", "request-1"),
    ).rejects.toMatchObject<ApiError>({
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  });

  it.each(["PENDING", "DEACTIVATED", "SUSPENDED"] as const)(
    "does not authenticate a %s account",
    async (status) => {
      const store = new FakeIdentityStore();
      activeUser(store, { status });
      const service = new AuthService(store, fakeHasher, config);

      await expect(
        service.login("person@example.test", "Correct Horse Battery Staple", "127.0.0.1", "r"),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
      expect(store.sessions.size).toBe(0);
    },
  );

  it("stores only token hashes and refuses revoked sessions", async () => {
    const store = new FakeIdentityStore();
    const user = activeUser(store);
    const service = new AuthService(store, fakeHasher, config);
    const created = await service.login(
      user.email,
      "Correct Horse Battery Staple",
      "127.0.0.1",
      "request-1",
    );

    expect(store.sessions.has(created.sessionToken)).toBe(false);
    expect(store.sessions.has(digest(created.sessionToken))).toBe(true);
    expect(await service.authenticate(created.sessionToken)).not.toBeNull();

    user.status = "SUSPENDED";
    expect(await service.authenticate(created.sessionToken)).toBeNull();
  });

  it("revokes the session on logout", async () => {
    const store = new FakeIdentityStore();
    const user = activeUser(store);
    const service = new AuthService(store, fakeHasher, config);
    const created = await service.login(
      user.email,
      "Correct Horse Battery Staple",
      "127.0.0.1",
      "request-1",
    );

    await service.logout(created.sessionToken, user.id, "request-2");

    expect(await service.authenticate(created.sessionToken)).toBeNull();
  });

  it("limits repeated login failures and audits the throttle", async () => {
    const store = new FakeIdentityStore();
    const service = new AuthService(store, fakeHasher, config);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        service.login("missing@example.test", "Incorrect Password", "127.0.0.1", "r"),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    await expect(
      service.login("missing@example.test", "Incorrect Password", "127.0.0.1", "r"),
    ).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(store.auditEvents.some((event) => event.eventType === "AUTH_LOGIN_THROTTLED")).toBe(
      true,
    );
  });

  it("returns no access to another school's records", async () => {
    const store = new FakeIdentityStore();
    const user = activeUser(store);
    const schoolA = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
    const schoolB = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";
    store.schools.set(schoolA, {
      userId: user.id,
      access: { id: schoolA, name: "School A", permissions: [] },
    });
    const service = new AuthService(store, fakeHasher, config);

    await expect(service.getSchoolAccess(user.id, schoolB)).rejects.toMatchObject({
      statusCode: 404,
      code: "SCHOOL_NOT_FOUND",
    });
  });

  it("does not treat a school user as a platform administrator", async () => {
    const store = new FakeIdentityStore();
    activeUser(store);
    const service = new AuthService(store, fakeHasher, config);

    await expect(service.requirePlatformAdmin("user-1", null)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("requires recent MFA even for separately assigned platform administrators", async () => {
    const store = new FakeIdentityStore();
    activeUser(store);
    store.platformAdmins.add("user-1");
    const service = new AuthService(store, fakeHasher, config);

    await expect(service.requirePlatformAdmin("user-1", null)).rejects.toMatchObject({
      statusCode: 403,
      code: "PLATFORM_MFA_REQUIRED",
    });
    await expect(service.requirePlatformAdmin("user-1", new Date())).resolves.toBeUndefined();
  });

  it("prevents self-grants and grants beyond the actor's permissions", () => {
    expect(() =>
      assertCanGrantPermissions("user-a", "user-a", new Set(["student.read"]), ["student.read"]),
    ).toThrowError("You cannot change your own access.");
    expect(() =>
      assertCanGrantPermissions("user-a", "user-b", new Set(["student.read"]), ["platform.admin"]),
    ).toThrowError("You cannot grant permissions you do not hold.");
  });

  it("denies access when a school permission is missing", () => {
    expect(() => assertPermission(["student.read"], "sensitive.operation")).toThrowError(
      "You are not authorized to perform this action.",
    );
  });

  it("requires a configured recovery delivery adapter", async () => {
    const store = new FakeIdentityStore();
    const service = new AuthService(store, fakeHasher, config);

    await expect(
      service.requestPasswordReset("person@example.test", "127.0.0.1", "request-1"),
    ).rejects.toMatchObject({ statusCode: 503, code: "RECOVERY_UNAVAILABLE" });
  });

  it("uses one-time reset tokens and revokes existing sessions after reset", async () => {
    const store = new FakeIdentityStore();
    const user = activeUser(store);
    let deliveredToken = "";
    const service = new AuthService(store, fakeHasher, config, {
      sendPasswordReset: async (_email, token) => {
        deliveredToken = token;
      },
    });
    const session = await service.login(
      user.email,
      "Correct Horse Battery Staple",
      "127.0.0.1",
      "login",
    );

    await service.requestPasswordReset(user.email, "127.0.0.1", "reset-request");
    expect(deliveredToken).not.toBe("");
    expect(store.accountTokens.has(deliveredToken)).toBe(false);
    expect(store.accountTokens.has(digest(deliveredToken))).toBe(true);

    await service.completePasswordReset(deliveredToken, "A New Correct Password", "reset-complete");
    expect(user.passwordHash).toBe("hash:A New Correct Password");
    expect(await service.authenticate(session.sessionToken)).toBeNull();
    await expect(
      service.completePasswordReset(deliveredToken, "Another New Password", "replay"),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
  });

  it("invalidates a reset token if the delivery adapter fails", async () => {
    const store = new FakeIdentityStore();
    const user = activeUser(store);
    const service = new AuthService(store, fakeHasher, config, {
      sendPasswordReset: async () => {
        throw new Error("provider detail");
      },
    });

    await expect(
      service.requestPasswordReset(user.email, "127.0.0.1", "reset-request"),
    ).rejects.toMatchObject({ statusCode: 503, code: "RECOVERY_UNAVAILABLE" });
    expect([...store.accountTokens.values()].every((token) => token.used)).toBe(true);
    expect(JSON.stringify(store.auditEvents)).not.toContain("provider detail");
  });
});
