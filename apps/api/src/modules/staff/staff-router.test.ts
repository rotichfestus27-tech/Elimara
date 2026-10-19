import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { StaffService } from "./staff-service.js";
import { FakeStaffStore } from "./test-support/fake-staff-store.js";

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
const linkedUserId = "f3c35513-dacc-4677-978a-7df38d89276d";
const permissions = [
  "staff.profile.read",
  "staff.profile.manage",
  "staff.employment.read",
  "staff.employment.manage",
  "staff.assignment.read",
  "staff.assignment.manage",
];
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

function setup(grantedPermissions = permissions) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set(userId, {
    id: userId,
    email: "staff@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId,
    access: { id: schoolAId, name: "Elimara Academy", permissions: grantedPermissions },
  });
  const authService = new AuthService(identityStore, hasher, config);
  const staffStore = new FakeStaffStore();
  const app = createApp(config, {
    authService,
    staffService: new StaffService(staffStore),
    checkDatabase: async () => {},
  });
  return { app, staffStore };
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

function staffPayload(staffNumber = "EMP-001") {
  return {
    staffNumber,
    givenName: "Njeri",
    middleName: null,
    familyName: "Kamau",
    contactEmail: "njeri@example.test",
    contactPhone: "+254700000001",
    positionTitle: "Teacher",
  };
}

describe("staff management API", () => {
  it("requires authentication, school access, and the exact staff permission", async () => {
    const { app } = setup();
    const path = `/api/v1/schools/${schoolAId}/staff`;
    expect((await request(app).get(path)).status).toBe(401);

    const noPermission = setup(["staff.employment.read"]);
    const { agent } = await login(noPermission.app);
    expect((await agent.get(path)).status).toBe(403);

    const authorized = setup();
    const signedIn = await login(authorized.app);
    const crossSchool = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/staff`);
    expect(crossSchool.status).toBe(404);
    expect(crossSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });

  it("creates profiles, departments and optional account links only within the school", async () => {
    const { app, staffStore } = setup();
    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}`;
    const department = await agent
      .post(`${base}/departments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Academics" });
    expect(department.status).toBe(201);

    const invalidLink = await agent
      .post(`${base}/staff`)
      .set("X-CSRF-Token", csrfToken)
      .send({ ...staffPayload(), userId: randomUUID() });
    expect(invalidLink.status).toBe(400);
    expect(invalidLink.body.error.code).toBe("INVALID_RELATIONSHIP");

    staffStore.seedMembership(schoolAId, linkedUserId);
    const created = await agent
      .post(`${base}/staff`)
      .set("X-CSRF-Token", csrfToken)
      .send({ ...staffPayload(), departmentId: department.body.data.id, userId: linkedUserId });
    expect(created.status).toBe(201);
    expect(created.body.data.department.name).toBe("Academics");
    expect(created.body.data.userId).toBe(linkedUserId);
    expect(JSON.stringify(created.body)).not.toMatch(/password|token/i);

    const departmentBlocked = await agent
      .post(`${base}/departments/${department.body.data.id}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(departmentBlocked.status).toBe(409);
    expect(departmentBlocked.body.error.code).toBe("ACTIVE_STAFF_REMAINS");

    const duplicate = await agent
      .post(`${base}/staff`)
      .set("X-CSRF-Token", csrfToken)
      .send(staffPayload("emp-001"));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE");

    const hiddenFromOtherSchool = await agent.get(
      `/api/v1/schools/${schoolAId}/staff/${randomUUID()}`,
    );
    expect(hiddenFromOtherSchool.status).toBe(404);

    const inactive = await agent
      .patch(`${base}/staff/${created.body.data.id}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "INACTIVE" });
    expect(inactive.status).toBe(200);
    const departmentDeactivated = await agent
      .post(`${base}/departments/${department.body.data.id}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(departmentDeactivated.status).toBe(204);

    const reactivateWithInactiveDepartment = await agent
      .patch(`${base}/staff/${created.body.data.id}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "ACTIVE" });
    expect(reactivateWithInactiveDepartment.status).toBe(409);
    expect(reactivateWithInactiveDepartment.body.error.code).toBe("RECORD_INACTIVE");

    const unassigned = await agent
      .patch(`${base}/staff/${created.body.data.id}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ departmentId: null });
    expect(unassigned.status).toBe(200);
    const reactivated = await agent
      .patch(`${base}/staff/${created.body.data.id}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "ACTIVE" });
    expect(reactivated.status).toBe(200);
  });

  it("retains employment history and requires current records to end before staff deactivation", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}`;
    const created = await agent
      .post(`${base}/staff`)
      .set("X-CSRF-Token", csrfToken)
      .send(staffPayload());
    const staffId = created.body.data.id as string;

    const employment = await agent
      .post(`${base}/staff/${staffId}/employments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ positionTitle: "Teacher", startsOn: "2024-01-01" });
    expect(employment.status).toBe(201);

    const prematureDeactivation = await agent
      .patch(`${base}/staff/${staffId}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "INACTIVE" });
    expect(prematureDeactivation.status).toBe(409);
    expect(prematureDeactivation.body.error.code).toBe("ACTIVE_EMPLOYMENT_REMAINS");

    const ended = await agent
      .post(`${base}/staff/${staffId}/employments/${employment.body.data.id}/end`)
      .set("X-CSRF-Token", csrfToken)
      .send({ endsOn: "2025-12-31" });
    expect(ended.status).toBe(200);
    expect(ended.body.data.endsOn).toBe("2025-12-31");

    const inactive = await agent
      .patch(`${base}/staff/${staffId}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "INACTIVE" });
    expect(inactive.status).toBe(200);
    expect(inactive.body.data.status).toBe("INACTIVE");

    const history = await agent.get(`${base}/staff/${staffId}/employments`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].endsOn).toBe("2025-12-31");
  });

  it("prevents duplicate or invalid assignments and retains ended assignments", async () => {
    const { app, staffStore } = setup();
    const classId = randomUUID();
    const streamId = randomUUID();
    const classSubjectAssignmentId = randomUUID();
    staffStore.seedClass(schoolAId, classId);
    staffStore.seedStream(schoolAId, classId, streamId);
    staffStore.seedClassSubject(schoolAId, classSubjectAssignmentId);
    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}`;
    const staff = await agent
      .post(`${base}/staff`)
      .set("X-CSRF-Token", csrfToken)
      .send(staffPayload());
    const staffId = staff.body.data.id as string;

    const created = await agent
      .post(`${base}/staff/${staffId}/class-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classId, streamId });
    expect(created.status).toBe(201);

    const deactivationBlocked = await agent
      .patch(`${base}/staff/${staffId}/status`)
      .set("X-CSRF-Token", csrfToken)
      .send({ status: "INACTIVE" });
    expect(deactivationBlocked.status).toBe(409);
    expect(deactivationBlocked.body.error.code).toBe("ACTIVE_ASSIGNMENTS_REMAIN");

    const duplicate = await agent
      .post(`${base}/staff/${staffId}/class-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classId, streamId });
    expect(duplicate.status).toBe(409);

    const wrongStream = await agent
      .post(`${base}/staff/${staffId}/class-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classId, streamId: randomUUID() });
    expect(wrongStream.status).toBe(400);

    const ended = await agent
      .post(`${base}/staff/${staffId}/class-assignments/${created.body.data.id}/end`)
      .set("X-CSRF-Token", csrfToken);
    expect(ended.status).toBe(200);
    expect(ended.body.data.endedAt).toEqual(expect.any(String));

    const secondEpisode = await agent
      .post(`${base}/staff/${staffId}/class-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classId, streamId });
    expect(secondEpisode.status).toBe(201);

    const subjectAssignment = await agent
      .post(`${base}/staff/${staffId}/subject-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classSubjectAssignmentId });
    expect(subjectAssignment.status).toBe(201);
    const duplicateSubjectAssignment = await agent
      .post(`${base}/staff/${staffId}/subject-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classSubjectAssignmentId });
    expect(duplicateSubjectAssignment.status).toBe(409);
    const invalidSubjectAssignment = await agent
      .post(`${base}/staff/${staffId}/subject-assignments`)
      .set("X-CSRF-Token", csrfToken)
      .send({ classSubjectAssignmentId: randomUUID() });
    expect(invalidSubjectAssignment.status).toBe(400);

    staffStore.classSubjectsWithUnpublishedAssessments.add(classSubjectAssignmentId);
    const assignmentEndBlocked = await agent
      .post(`${base}/staff/${staffId}/subject-assignments/${subjectAssignment.body.data.id}/end`)
      .set("X-CSRF-Token", csrfToken);
    expect(assignmentEndBlocked.status).toBe(409);
    expect(assignmentEndBlocked.body.error.code).toBe("ACTIVE_ASSESSMENTS_REMAIN");
    staffStore.classSubjectsWithUnpublishedAssessments.delete(classSubjectAssignmentId);

    const subjectEnded = await agent
      .post(`${base}/staff/${staffId}/subject-assignments/${subjectAssignment.body.data.id}/end`)
      .set("X-CSRF-Token", csrfToken);
    expect(subjectEnded.status).toBe(200);
    const history = await agent.get(`${base}/staff/${staffId}/assignments`);
    expect(history.body.data).toHaveLength(3);
    expect(history.body.meta.total).toBe(3);
    const page = await agent.get(`${base}/staff/${staffId}/assignments?limit=1&offset=1`);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toEqual({ limit: 1, offset: 1, total: 3 });
  });

  it("scopes nested staff resources and assignment authorization", async () => {
    const { app } = setup(["staff.profile.read", "staff.profile.manage"]);
    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}`;
    const staff = await agent
      .post(`${base}/staff`)
      .set("X-CSRF-Token", csrfToken)
      .send(staffPayload());
    const denied = await agent.get(`${base}/staff/${staff.body.data.id}/assignments`);
    expect(denied.status).toBe(403);

    const crossSchool = await agent.get(
      `/api/v1/schools/${schoolBId}/staff/${staff.body.data.id}/employments`,
    );
    expect(crossSchool.status).toBe(404);
    expect(JSON.stringify(crossSchool.body)).not.toContain(staff.body.data.id);
  });
});
