import { randomUUID } from "node:crypto";
import {
  type FinanceStore,
  FinanceStoreError,
  type FinancialPaymentRecord,
} from "@elimara/database";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import { AuthService } from "../identity/auth-service.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { FinanceService } from "./finance-service.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://elimara:local-placeholder@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});
const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";
const userId = "user-a";
const studentId = "bb6500e4-a341-4c79-a69b-55a6ca990001";
const paymentPermission = "finance.payments.record";
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(permissions: string[] = [paymentPermission]) {
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
  const paymentRequests = new Map<
    string,
    { fingerprint: string; record: FinancialPaymentRecord }
  >();
  let paymentWriteCount = 0;
  const emptyPage = async () => ({ items: [], total: 0 });
  const store: FinanceStore = {
    listFeeStructures: emptyPage,
    createFeeStructure: async () => {
      throw new Error("Not used in this test.");
    },
    deactivateFeeStructure: async () => false,
    getAccountSummary: async () => null,
    listAccounts: emptyPage,
    listCharges: async () => null,
    postCharge: async () => null,
    listPayments: async () => null,
    recordPayment: async (input) => {
      const prior = paymentRequests.get(input.idempotencyKey);
      if (prior) {
        if (prior.fingerprint !== input.requestFingerprint) {
          throw new FinanceStoreError(
            "IDEMPOTENCY_CONFLICT",
            "This idempotency key was used for different payment data.",
          );
        }
        return prior.record;
      }
      paymentWriteCount += 1;
      const record: FinancialPaymentRecord = {
        id: randomUUID(),
        studentId: input.studentId,
        amount: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        receivedAt: new Date("2026-10-19T12:00:00.000Z"),
        receiptId: randomUUID(),
        allocatedAmount: "0.00",
        allocationReversedAmount: "0.00",
        refundedAmount: "0.00",
        unappliedAmount: input.amount,
      };
      paymentRequests.set(input.idempotencyKey, {
        fingerprint: input.requestFingerprint,
        record,
      });
      return record;
    },
    allocatePayment: async () => null,
    reverseAllocation: async () => null,
    reverseCharge: async () => null,
    createAdjustment: async () => null,
    refundPayment: async () => null,
    reconcilePayment: async () => null,
    listReconciliationExceptions: emptyPage,
    getReceipt: async () => null,
    getReport: async () => ({
      from: "2026-10-19",
      to: "2026-10-19",
      paymentsReceived: "0.00",
      paymentCount: 0,
      chargeCount: 0,
      outstandingCharges: "0.00",
      unappliedCredit: "0.00",
      reconciliationExceptionCount: 0,
    }),
  };
  const authService = new AuthService(identityStore, hasher, config);
  const app = createApp(config, {
    authService,
    financeService: new FinanceService(store),
    checkDatabase: async () => {},
  });
  return {
    app,
    identityStore,
    get paymentWriteCount() {
      return paymentWriteCount;
    },
  };
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

describe("finance API", () => {
  it("requires authentication, a specific permission, and authorized school context", async () => {
    const anonymous = setup();
    expect(
      (await request(anonymous.app).get(`/api/v1/schools/${schoolAId}/finance/fee-structures`))
        .status,
    ).toBe(401);

    const denied = setup(["finance.accounts.read"]);
    const deniedLogin = await login(denied.app);
    const deniedResponse = await deniedLogin.agent
      .post(`/api/v1/schools/${schoolAId}/students/${studentId}/finance/payments`)
      .set("X-CSRF-Token", deniedLogin.csrfToken)
      .set("Idempotency-Key", "payment-1")
      .send({ amount: "10.00", method: "CASH" });
    expect(deniedResponse.status).toBe(403);

    const authorized = setup();
    const authorizedLogin = await login(authorized.app);
    const foreignSchool = await authorizedLogin.agent
      .post(`/api/v1/schools/${schoolBId}/students/${studentId}/finance/payments`)
      .set("X-CSRF-Token", authorizedLogin.csrfToken)
      .set("Idempotency-Key", "payment-1")
      .send({ amount: "10.00", method: "CASH" });
    expect(foreignSchool.status).toBe(404);
    expect(foreignSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });

  it("requires an idempotency key and rejects client-supplied tenant fields", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const path = `/api/v1/schools/${schoolAId}/students/${studentId}/finance/payments`;

    const missingKey = await agent
      .post(path)
      .set("X-CSRF-Token", csrfToken)
      .send({ amount: "10.00", method: "CASH" });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const forgedSchool = await agent
      .post(path)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", "payment-1")
      .send({ amount: "10.00", method: "CASH", schoolId: schoolBId });
    expect(forgedSchool.status).toBe(400);
    expect(forgedSchool.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("replays identical payment requests and rejects reuse with a different payload", async () => {
    const fixture = setup();
    const { app } = fixture;
    const { agent, csrfToken } = await login(app);
    const path = `/api/v1/schools/${schoolAId}/students/${studentId}/finance/payments`;
    const postPayment = (amount: string) =>
      agent
        .post(path)
        .set("X-CSRF-Token", csrfToken)
        .set("Idempotency-Key", "payment-retry-1")
        .send({ amount, method: "CASH" });

    const [first, replay] = await Promise.all([postPayment("10.00"), postPayment("10.00")]);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(fixture.paymentWriteCount).toBe(1);

    const conflict = await postPayment("12.00");
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(fixture.paymentWriteCount).toBe(1);
  });
});
