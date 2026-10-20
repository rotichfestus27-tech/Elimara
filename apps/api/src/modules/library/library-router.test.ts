import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import { AuthService } from "../identity/auth-service.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { LibraryService } from "./library-service.js";
import { FakeLibraryStore } from "./test-support/fake-library-store.js";

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
const studentAId = randomUUID();
const studentBId = randomUUID();
const studentCId = randomUUID();
const staffAId = randomUUID();
const permissions = [
  "library.catalog.read",
  "library.catalog.manage",
  "library.loans.read",
  "library.loans.manage",
  "library.reservations.read",
  "library.reservations.manage",
  "library.policy.manage",
  "library.reports.read",
];
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(grants: string[] = permissions) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set(userId, {
    id: userId,
    email: "librarian@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId,
    access: { id: schoolAId, name: "Elimara Academy", permissions: grants },
  });
  const store = new FakeLibraryStore();
  store.seedStudent(schoolAId, studentAId);
  store.seedStudent(schoolAId, studentBId);
  store.seedStudent(schoolAId, studentCId);
  store.seedStaff(schoolAId, staffAId);
  const authService = new AuthService(identityStore, hasher, config);
  const app = createApp(config, {
    authService,
    libraryService: new LibraryService(store),
    checkDatabase: async () => {},
  });
  return { app, store };
}

async function login(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({
    email: "librarian@school-a.test",
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

async function createItem(
  agent: request.SuperAgentTest,
  csrfToken: string,
  title = "The River Between",
) {
  const response = await agent
    .post(`/api/v1/schools/${schoolAId}/library/catalog/items`)
    .set("X-CSRF-Token", csrfToken)
    .send({ title });
  return response.body.data as { id: string };
}

async function configurePolicy(agent: request.SuperAgentTest, csrfToken: string) {
  return agent
    .put(`/api/v1/schools/${schoolAId}/library/policy`)
    .set("X-CSRF-Token", csrfToken)
    .send({
      loanPeriodDays: 14,
      maxActiveLoans: 2,
      maxRenewals: 1,
      reservationHoldDays: 2,
    });
}

describe("library API", () => {
  it("requires authentication, an exact permission, and membership in the selected school", async () => {
    const anonymous = setup();
    expect(
      (await request(anonymous.app).get(`/api/v1/schools/${schoolAId}/library/catalog/items`))
        .status,
    ).toBe(401);

    const denied = setup(["library.loans.read"]);
    const deniedLogin = await login(denied.app);
    expect(
      (await deniedLogin.agent.get(`/api/v1/schools/${schoolAId}/library/catalog/items`)).status,
    ).toBe(403);

    const authorized = setup();
    const signedIn = await login(authorized.app);
    const foreign = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/library/catalog/items`);
    expect(foreign.status).toBe(404);
  });

  it("validates borrowers and requires a policy before checkout", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const item = await createItem(agent, csrfToken);
    const copy = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/copies`)
      .set("X-CSRF-Token", csrfToken);

    const missingBorrower = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id });
    expect(missingBorrower.status).toBe(400);

    const noPolicy = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id, studentId: studentAId });
    expect(noPolicy.status).toBe(409);
    expect(noPolicy.body.error.code).toBe("POLICY_NOT_CONFIGURED");
  });

  it("enforces the configured active-loan limit and same-school borrower references", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const item = await createItem(agent, csrfToken);
    const copies = await Promise.all([
      agent
        .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/copies`)
        .set("X-CSRF-Token", csrfToken),
      agent
        .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/copies`)
        .set("X-CSRF-Token", csrfToken),
    ]);
    await agent
      .put(`/api/v1/schools/${schoolAId}/library/policy`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        loanPeriodDays: 14,
        maxActiveLoans: 1,
        maxRenewals: 0,
        reservationHoldDays: 2,
      });

    const first = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copies[0]?.body.data.id, studentId: studentAId });
    expect(first.status).toBe(201);
    const overLimit = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copies[1]?.body.data.id, studentId: studentAId });
    expect(overLimit.status).toBe(409);
    expect(overLimit.body.error.code).toBe("MAX_ACTIVE_LOANS");

    const foreignBorrower = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copies[1]?.body.data.id, studentId: randomUUID() });
    expect(foreignBorrower.status).toBe(404);
  });

  it("creates catalog records and safely checks out, renews, returns, and audits loans", async () => {
    const { app, store } = setup();
    const { agent, csrfToken } = await login(app);
    const category = await agent
      .post(`/api/v1/schools/${schoolAId}/library/categories`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Fiction" });
    expect(category.status).toBe(201);

    const item = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        title: "The River Between",
        author: "Ngugi wa Thiong'o",
        categoryId: category.body.data.id,
      });
    expect(item.status).toBe(201);

    const copy = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.body.data.id}/copies`)
      .set("X-CSRF-Token", csrfToken);
    expect(copy.status).toBe(201);
    expect((await configurePolicy(agent, csrfToken)).status).toBe(200);

    const checkout = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id, studentId: studentAId });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.studentId).toBe(studentAId);
    expect(checkout.body.data.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const renewed = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans/${checkout.body.data.id}/renew`)
      .set("X-CSRF-Token", csrfToken);
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.renewalCount).toBe(1);

    const returned = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans/${checkout.body.data.id}/return`)
      .set("X-CSRF-Token", csrfToken);
    expect(returned.status).toBe(200);
    expect(returned.body.data.returnedAt).toBeTruthy();
    expect(store.auditEvents).toContain("LIBRARY_LOAN_CHECKED_OUT");
    expect(store.auditEvents).toContain("LIBRARY_LOAN_RENEWED");
    expect(store.auditEvents).toContain("LIBRARY_LOAN_RETURNED");
  });

  it("enforces FIFO reservations and prevents another borrower taking a held copy", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const item = await createItem(agent, csrfToken);
    const copy = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/copies`)
      .set("X-CSRF-Token", csrfToken);
    await configurePolicy(agent, csrfToken);

    const firstLoan = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id, studentId: studentAId });
    expect(firstLoan.status).toBe(201);
    const firstWait = await agent
      .post(`/api/v1/schools/${schoolAId}/library/reservations`)
      .set("X-CSRF-Token", csrfToken)
      .send({ itemId: item.id, studentId: studentBId });
    expect(firstWait.status).toBe(201);
    expect(firstWait.body.data.status).toBe("QUEUED");
    const secondWait = await agent
      .post(`/api/v1/schools/${schoolAId}/library/reservations`)
      .set("X-CSRF-Token", csrfToken)
      .send({ itemId: item.id, studentId: studentCId });
    expect(secondWait.status).toBe(201);

    await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans/${firstLoan.body.data.id}/return`)
      .set("X-CSRF-Token", csrfToken);
    const list = await agent.get(
      `/api/v1/schools/${schoolAId}/library/reservations?itemId=${item.id}`,
    );
    expect(list.body.data[0].status).toBe("READY");
    expect(list.body.data[1].status).toBe("QUEUED");

    const blocked = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id, studentId: studentCId });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("COPY_RESERVED");

    const reservedCheckout = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id, studentId: studentBId });
    expect(reservedCheckout.status).toBe(201);
    const fulfilled = await agent.get(
      `/api/v1/schools/${schoolAId}/library/reservations?status=FULFILLED`,
    );
    expect(fulfilled.body.data).toHaveLength(1);
  });

  it("exposes expired holds and promotes the queue on the next circulation mutation", async () => {
    const { app, store } = setup();
    const { agent, csrfToken } = await login(app);
    const item = await createItem(agent, csrfToken);
    await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/copies`)
      .set("X-CSRF-Token", csrfToken);
    await configurePolicy(agent, csrfToken);

    const first = await agent
      .post(`/api/v1/schools/${schoolAId}/library/reservations`)
      .set("X-CSRF-Token", csrfToken)
      .send({ itemId: item.id, studentId: studentBId });
    expect(first.status).toBe(201);
    const firstReservation = store.reservations.get(first.body.data.id);
    if (!firstReservation) throw new Error("Expected the first reservation in the fake store.");
    store.reservations.set(firstReservation.id, {
      ...firstReservation,
      expiresAt: new Date(Date.now() - 1),
    });

    const expired = await agent.get(
      `/api/v1/schools/${schoolAId}/library/reservations?status=EXPIRED`,
    );
    expect(expired.body.data[0].status).toBe("READY");
    expect(expired.body.data[0].effectiveStatus).toBe("EXPIRED");

    const next = await agent
      .post(`/api/v1/schools/${schoolAId}/library/reservations`)
      .set("X-CSRF-Token", csrfToken)
      .send({ itemId: item.id, studentId: studentCId });
    expect(next.status).toBe(201);
    expect(next.body.data.status).toBe("READY");
    expect(store.reservations.get(first.body.data.id)?.status).toBe("EXPIRED");
  });

  it("rejects malformed policy values and filters report requests to valid dates", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const invalidPolicy = await agent
      .put(`/api/v1/schools/${schoolAId}/library/policy`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        loanPeriodDays: 0,
        maxActiveLoans: 2,
        maxRenewals: 0,
        reservationHoldDays: 2,
      });
    expect(invalidPolicy.status).toBe(400);

    const invalidReport = await agent.get(
      `/api/v1/schools/${schoolAId}/library/reports/loans?from=2026-10-20&to=2026-10-19`,
    );
    expect(invalidReport.status).toBe(400);
  });

  it("archives catalog history only after active loans and reservations end", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const item = await createItem(agent, csrfToken);
    const copy = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/copies`)
      .set("X-CSRF-Token", csrfToken);
    await configurePolicy(agent, csrfToken);

    const loan = await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans`)
      .set("X-CSRF-Token", csrfToken)
      .send({ copyId: copy.body.data.id, studentId: studentAId });
    const blocked = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/archive`)
      .set("X-CSRF-Token", csrfToken);
    expect(blocked.status).toBe(409);

    await agent
      .post(`/api/v1/schools/${schoolAId}/library/loans/${loan.body.data.id}/return`)
      .set("X-CSRF-Token", csrfToken);
    const archived = await agent
      .post(`/api/v1/schools/${schoolAId}/library/catalog/items/${item.id}/archive`)
      .set("X-CSRF-Token", csrfToken);
    expect(archived.status).toBe(204);
    const historical = await agent.get(
      `/api/v1/schools/${schoolAId}/library/catalog/items?includeArchived=true`,
    );
    expect(historical.body.data).toHaveLength(1);
    expect(historical.body.data[0].archivedAt).toBeTruthy();
  });
});
