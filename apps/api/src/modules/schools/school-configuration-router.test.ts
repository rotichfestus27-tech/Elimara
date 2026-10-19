import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type {
  ConfigurationListQuery,
  ConfigurationPage,
  ConfigurationRecord,
  ConfigurationResource,
  CreateConfigurationInput,
  DeactivateConfigurationInput,
  DeactivationOutcome,
  SchoolConfigurationStore,
  SchoolProfileRecord,
  UpdateConfigurationInput,
} from "@elimara/database";
import { SchoolConfigurationStoreError } from "@elimara/database";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import { AuthService } from "../identity/auth-service.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { SchoolConfigurationService } from "./school-configuration-service.js";

const config = parseEnvironment({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://user:password@localhost:5432/elimara",
  RATE_LIMIT_HMAC_KEY: "replace-with-at-least-32-random-characters",
  PLATFORM_MFA_ENCRYPTION_KEY: "a1".repeat(32),
});
const schoolAId = "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5";
const schoolBId = "a0abdb4a-0b26-47a8-9bd7-0dc77b34e300";
const configurationPermissions = [
  "school.profile.read",
  "school.profile.update",
  "academics.configuration.read",
  "academics.configuration.manage",
];
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};

type StoredRecord = {
  schoolId: string;
  resource: ConfigurationResource;
  record: ConfigurationRecord;
};

class FakeSchoolConfigurationStore implements SchoolConfigurationStore {
  readonly records: StoredRecord[] = [];
  readonly auditEvents: Array<{ eventType: string; schoolId: string }> = [];
  readonly schools = new Map<string, SchoolProfileRecord>([
    [
      schoolAId,
      {
        id: schoolAId,
        name: "Elimara Academy",
        contactEmail: null,
        contactPhone: null,
        status: "ACTIVE",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    [
      schoolBId,
      {
        id: schoolBId,
        name: "Other Academy",
        contactEmail: null,
        contactPhone: null,
        status: "ACTIVE",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  ]);

  async getSchoolProfile(schoolId: string): Promise<SchoolProfileRecord | null> {
    const school = this.schools.get(schoolId);
    return school?.status === "ACTIVE" ? school : null;
  }

  async updateSchoolProfile(input: {
    schoolId: string;
    actorUserId: string;
    requestId: string;
    data: { name?: string; contactEmail?: string | null; contactPhone?: string | null };
  }): Promise<SchoolProfileRecord | null> {
    const school = await this.getSchoolProfile(input.schoolId);
    if (!school) return null;
    const updated = { ...school, ...input.data, updatedAt: new Date() };
    this.schools.set(input.schoolId, updated);
    this.auditEvents.push({ eventType: "SCHOOL_PROFILE_UPDATED", schoolId: input.schoolId });
    return updated;
  }

  async listConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage> {
    const filtered = this.records
      .filter((entry) => entry.schoolId === schoolId && entry.resource === resource)
      .map((entry) => entry.record)
      .filter((record) => !query.status || record.status === query.status)
      .filter((record) => {
        if (!query.parentId) return true;
        return (
          ("academicYearId" in record && record.academicYearId === query.parentId) ||
          ("classId" in record && record.classId === query.parentId)
        );
      })
      .filter((record) => {
        if (!query.search || !("name" in record)) return true;
        return record.name.toLowerCase().includes(query.search.toLowerCase());
      });
    if (query.sortBy === "name") {
      filtered.sort((left, right) => {
        const leftName = "name" in left ? left.name.toLowerCase() : "";
        const rightName = "name" in right ? right.name.toLowerCase() : "";
        return query.sortOrder === "asc"
          ? leftName.localeCompare(rightName)
          : rightName.localeCompare(leftName);
      });
    }
    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  }

  async getConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    id: string,
  ): Promise<ConfigurationRecord | null> {
    return (
      this.records.find(
        (entry) =>
          entry.schoolId === schoolId && entry.resource === resource && entry.record.id === id,
      )?.record ?? null
    );
  }

  async createConfiguration(input: CreateConfigurationInput): Promise<ConfigurationRecord> {
    const now = new Date();
    const shared = {
      id: randomUUID(),
      status: "ACTIVE" as const,
      createdAt: now,
      updatedAt: now,
    };
    let record: ConfigurationRecord;
    switch (input.resource) {
      case "academicYears": {
        const startsOn = asDate(input.data.startsOn);
        const endsOn = asDate(input.data.endsOn);
        validatePeriod(startsOn, endsOn);
        this.assertNoName(input.schoolId, input.resource, input.data.name);
        this.assertNoOverlap(input.schoolId, startsOn, endsOn);
        record = { ...shared, ...input.data, startsOn, endsOn };
        break;
      }
      case "terms": {
        const parent = this.requireActive(
          input.schoolId,
          "academicYears",
          input.data.academicYearId,
        );
        const startsOn = asDate(input.data.startsOn);
        const endsOn = asDate(input.data.endsOn);
        validateWithinPeriod(startsOn, endsOn, parent.startsOn, parent.endsOn);
        this.assertNoName(
          input.schoolId,
          input.resource,
          input.data.name,
          input.data.academicYearId,
        );
        this.assertNoOverlap(input.schoolId, startsOn, endsOn, input.data.academicYearId);
        record = { ...shared, ...input.data, startsOn, endsOn };
        break;
      }
      case "classes": {
        this.requireActive(input.schoolId, "academicYears", input.data.academicYearId);
        this.assertNoName(
          input.schoolId,
          input.resource,
          input.data.name,
          input.data.academicYearId,
        );
        record = { ...shared, ...input.data };
        break;
      }
      case "streams": {
        this.requireActive(input.schoolId, "classes", input.data.classId);
        this.assertNoName(input.schoolId, input.resource, input.data.name, input.data.classId);
        record = { ...shared, ...input.data };
        break;
      }
      case "subjects": {
        this.assertNoName(input.schoolId, input.resource, input.data.name);
        record = { ...shared, ...input.data };
        break;
      }
      case "classSubjects": {
        this.requireActive(input.schoolId, "classes", input.data.classId);
        this.requireActive(input.schoolId, "subjects", input.data.subjectId);
        if (
          this.records.some(
            (entry) =>
              entry.schoolId === input.schoolId &&
              entry.resource === input.resource &&
              "classId" in entry.record &&
              "subjectId" in entry.record &&
              entry.record.classId === input.data.classId &&
              entry.record.subjectId === input.data.subjectId,
          )
        ) {
          throw conflict();
        }
        record = { ...shared, ...input.data };
        break;
      }
    }
    this.records.push({ schoolId: input.schoolId, resource: input.resource, record });
    this.auditEvents.push({
      eventType: `${input.resource.toUpperCase()}_CREATED`,
      schoolId: input.schoolId,
    });
    return record;
  }

  async updateConfiguration(input: UpdateConfigurationInput): Promise<ConfigurationRecord | null> {
    const entry = this.records.find(
      (candidate) =>
        candidate.schoolId === input.schoolId &&
        candidate.resource === input.resource &&
        candidate.record.id === input.id,
    );
    if (!entry) return null;
    if (entry.record.status !== "ACTIVE")
      throw new SchoolConfigurationStoreError("CONFIGURATION_INACTIVE", "Inactive.");
    if ("name" in input.data && input.data.name !== undefined) {
      this.assertNoName(
        input.schoolId,
        input.resource,
        input.data.name,
        parentId(entry.record),
        input.id,
      );
    }
    const data = input.data;
    const updated = { ...entry.record, ...data, updatedAt: new Date() } as ConfigurationRecord;
    if ("startsOn" in data || "endsOn" in data) {
      if (!("startsOn" in entry.record) || !("endsOn" in entry.record)) {
        throw new Error("Unexpected period update.");
      }
      const startsOn =
        "startsOn" in data && data.startsOn ? asDate(data.startsOn) : entry.record.startsOn;
      const endsOn = "endsOn" in data && data.endsOn ? asDate(data.endsOn) : entry.record.endsOn;
      validatePeriod(startsOn, endsOn);
      if (entry.resource === "academicYears") {
        this.assertNoOverlap(input.schoolId, startsOn, endsOn, undefined, input.id);
      }
      Object.assign(updated, { startsOn, endsOn });
    }
    entry.record = updated;
    this.auditEvents.push({
      eventType: `${input.resource.toUpperCase()}_UPDATED`,
      schoolId: input.schoolId,
    });
    return updated;
  }

  async deactivateConfiguration(input: DeactivateConfigurationInput): Promise<DeactivationOutcome> {
    const entry = this.records.find(
      (candidate) =>
        candidate.schoolId === input.schoolId &&
        candidate.resource === input.resource &&
        candidate.record.id === input.id,
    );
    if (!entry) return "NOT_FOUND";
    if (entry.record.status === "INACTIVE") return "ALREADY_INACTIVE";
    const hasActiveChildren = this.records.some(
      (child) =>
        child.schoolId === input.schoolId &&
        child.record.status === "ACTIVE" &&
        ((input.resource === "academicYears" &&
          "academicYearId" in child.record &&
          child.record.academicYearId === input.id) ||
          (input.resource === "classes" &&
            (("classId" in child.record && child.record.classId === input.id) ||
              ("academicYearId" in child.record && child.record.academicYearId === input.id))) ||
          (input.resource === "subjects" &&
            "subjectId" in child.record &&
            child.record.subjectId === input.id)),
    );
    if (hasActiveChildren) throw conflict();
    entry.record = { ...entry.record, status: "INACTIVE", updatedAt: new Date() };
    this.auditEvents.push({
      eventType: `${input.resource.toUpperCase()}_DEACTIVATED`,
      schoolId: input.schoolId,
    });
    return "DEACTIVATED";
  }

  private requireActive<T extends ConfigurationResource>(
    schoolId: string,
    resource: T,
    id: string,
  ): Extract<ConfigurationRecord, { id: string }> {
    const record = this.records.find(
      (entry) =>
        entry.schoolId === schoolId &&
        entry.resource === resource &&
        entry.record.id === id &&
        entry.record.status === "ACTIVE",
    )?.record;
    if (!record) {
      throw new SchoolConfigurationStoreError("PARENT_NOT_FOUND", "Parent record was not found.");
    }
    return record;
  }

  private assertNoName(
    schoolId: string,
    resource: ConfigurationResource,
    name: string,
    parent?: string,
    excludeId?: string,
  ): void {
    const duplicate = this.records.some((entry) => {
      if (
        entry.schoolId !== schoolId ||
        entry.resource !== resource ||
        entry.record.id === excludeId ||
        !("name" in entry.record) ||
        entry.record.name.toLowerCase() !== name.toLowerCase()
      ) {
        return false;
      }
      return parent === undefined || parentId(entry.record) === parent;
    });
    if (duplicate) throw conflict();
  }

  private assertNoOverlap(
    schoolId: string,
    startsOn: Date,
    endsOn: Date,
    parent?: string,
    excludeId?: string,
  ): void {
    const resource = parent ? "terms" : "academicYears";
    const overlap = this.records.some((entry) => {
      if (
        entry.schoolId !== schoolId ||
        entry.resource !== resource ||
        entry.record.id === excludeId ||
        !("startsOn" in entry.record) ||
        !("endsOn" in entry.record) ||
        ("academicYearId" in entry.record && entry.record.academicYearId !== parent)
      ) {
        return false;
      }
      return entry.record.startsOn <= endsOn && entry.record.endsOn >= startsOn;
    });
    if (overlap) throw conflict();
  }
}

function setup(permissions = configurationPermissions) {
  const identityStore = new FakeIdentityStore();
  identityStore.users.set("user-a", {
    id: "user-a",
    email: "admin@school-a.test",
    passwordHash: "hash:Correct Horse Battery Staple",
    status: "ACTIVE",
  });
  identityStore.schools.set(schoolAId, {
    userId: "user-a",
    access: { id: schoolAId, name: "Elimara Academy", permissions },
  });
  const authService = new AuthService(identityStore, hasher, config);
  const store = new FakeSchoolConfigurationStore();
  const app = createApp(config, {
    authService,
    schoolConfigurationService: new SchoolConfigurationService(store),
    checkDatabase: async () => {},
  });
  return { app, store };
}

async function login(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({
    email: "admin@school-a.test",
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

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function validatePeriod(startsOn: Date, endsOn: Date): void {
  if (startsOn > endsOn) {
    throw new SchoolConfigurationStoreError("INVALID_PERIOD", "Invalid period.");
  }
}

function validateWithinPeriod(
  startsOn: Date,
  endsOn: Date,
  parentStart: Date,
  parentEnd: Date,
): void {
  if (startsOn > endsOn || startsOn < parentStart || endsOn > parentEnd) {
    throw new SchoolConfigurationStoreError("INVALID_PERIOD", "Term is outside academic year.");
  }
}

function parentId(record: ConfigurationRecord): string | undefined {
  if ("academicYearId" in record) return record.academicYearId;
  if ("classId" in record) return record.classId;
  return undefined;
}

function conflict(): SchoolConfigurationStoreError {
  return new SchoolConfigurationStoreError("CONFIGURATION_CONFLICT", "Conflicting configuration.");
}

describe("school configuration API", () => {
  it("requires an authenticated user with the exact school permission", async () => {
    const { app } = setup();

    const anonymous = await request(app).get(`/api/v1/schools/${schoolAId}`);
    expect(anonymous.status).toBe(401);

    const noPermission = setup([]);
    const { agent } = await login(noPermission.app);
    const denied = await agent.get(`/api/v1/schools/${schoolAId}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("denies cross-school requests without disclosing the other school's records", async () => {
    const { app, store } = setup();
    const { agent } = await login(app);
    await store.createConfiguration({
      schoolId: schoolBId,
      actorUserId: "other-user",
      requestId: "seed",
      resource: "subjects",
      data: { name: "Secret subject" },
    });

    const response = await agent.get(`/api/v1/schools/${schoolBId}/subjects`);
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain("Secret subject");
  });

  it("updates the school profile only with CSRF and records an audit event", async () => {
    const { app, store } = setup();
    const { agent, csrfToken } = await login(app);

    const denied = await agent.patch(`/api/v1/schools/${schoolAId}`).send({ name: "New Name" });
    expect(denied.status).toBe(403);

    const updated = await agent
      .patch(`/api/v1/schools/${schoolAId}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Elimara North" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Elimara North");
    expect(store.auditEvents).toContainEqual({
      eventType: "SCHOOL_PROFILE_UPDATED",
      schoolId: schoolAId,
    });
  });

  it("creates, lists, reads, updates, and deactivates academic records", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const years = `/api/v1/schools/${schoolAId}/academic-years`;

    const created = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" });
    expect(created.status).toBe(201);
    const yearId = created.body.data.id as string;
    expect(created.body.data.startsOn).toBe("2026-01-01");

    const listed = await agent.get(`${years}?limit=1&offset=0&sortBy=name&sortOrder=asc`);
    expect(listed.status).toBe(200);
    expect(listed.body.meta).toEqual({ limit: 1, offset: 0, total: 1 });

    const retrieved = await agent.get(`${years}/${yearId}`);
    expect(retrieved.status).toBe(200);

    const updated = await agent
      .patch(`${years}/${yearId}`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "2026 Academic Year" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("2026 Academic Year");

    const deactivated = await agent
      .post(`${years}/${yearId}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(deactivated.status).toBe(204);
    const repeated = await agent
      .post(`${years}/${yearId}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(repeated.status).toBe(204);
    expect((await agent.get(`${years}/${yearId}`)).body.data.status).toBe("INACTIVE");
  });

  it("supports term, class, stream, subject, and assignment lifecycle operations", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const base = `/api/v1/schools/${schoolAId}`;
    const write = (path: string, body: object) =>
      agent.post(path).set("X-CSRF-Token", csrfToken).send(body);

    const year = await write(`${base}/academic-years`, {
      name: "2027",
      startsOn: "2027-01-01",
      endsOn: "2027-12-31",
    });
    const yearId = year.body.data.id as string;
    const term = await write(`${base}/terms`, {
      name: "Term One",
      academicYearId: yearId,
      startsOn: "2027-01-01",
      endsOn: "2027-04-30",
    });
    const termId = term.body.data.id as string;
    expect(term.status).toBe(201);
    expect((await agent.get(`${base}/terms/${termId}`)).status).toBe(200);
    expect(
      (
        await agent
          .patch(`${base}/terms/${termId}`)
          .set("X-CSRF-Token", csrfToken)
          .send({ name: "Term One Updated" })
      ).status,
    ).toBe(200);

    const classRecord = await write(`${base}/classes`, {
      name: "Grade 2",
      academicYearId: yearId,
    });
    const classId = classRecord.body.data.id as string;
    expect(classRecord.status).toBe(201);
    expect(
      (
        await agent
          .patch(`${base}/classes/${classId}`)
          .set("X-CSRF-Token", csrfToken)
          .send({ name: "Grade Two" })
      ).status,
    ).toBe(200);
    const stream = await write(`${base}/streams`, { classId, name: "East" });
    const streamId = stream.body.data.id as string;
    expect(stream.status).toBe(201);
    expect((await agent.get(`${base}/streams/${streamId}`)).status).toBe(200);
    expect(
      (
        await agent
          .patch(`${base}/streams/${streamId}`)
          .set("X-CSRF-Token", csrfToken)
          .send({ name: "East Campus" })
      ).status,
    ).toBe(200);

    const subject = await write(`${base}/subjects`, { name: "Science" });
    const subjectId = subject.body.data.id as string;
    expect(subject.status).toBe(201);
    expect((await agent.get(`${base}/subjects/${subjectId}`)).status).toBe(200);
    expect(
      (
        await agent
          .patch(`${base}/subjects/${subjectId}`)
          .set("X-CSRF-Token", csrfToken)
          .send({ name: "General Science" })
      ).status,
    ).toBe(200);
    const assignment = await write(`${base}/class-subjects`, { classId, subjectId });
    const assignmentId = assignment.body.data.id as string;
    expect(assignment.status).toBe(201);
    expect((await agent.get(`${base}/class-subjects/${assignmentId}`)).status).toBe(200);

    for (const path of [
      `${base}/terms/${termId}/deactivate`,
      `${base}/streams/${streamId}/deactivate`,
      `${base}/class-subjects/${assignmentId}/deactivate`,
      `${base}/subjects/${subjectId}/deactivate`,
      `${base}/classes/${classId}/deactivate`,
      `${base}/academic-years/${yearId}/deactivate`,
    ]) {
      expect((await write(path, {})).status).toBe(204);
    }
  });

  it("rejects invalid dates, overlaps, duplicate names, and invalid parent relationships", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const years = `/api/v1/schools/${schoolAId}/academic-years`;
    const invalidRange = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Bad year", startsOn: "2026-12-31", endsOn: "2026-01-01" });
    expect(invalidRange.status).toBe(400);

    const year = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" });
    const yearId = year.body.data.id as string;
    const duplicate = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "2026", startsOn: "2027-01-01", endsOn: "2027-12-31" });
    expect(duplicate.status).toBe(409);

    const caseName = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Spring Term", startsOn: "2028-01-01", endsOn: "2028-12-31" });
    expect(caseName.status).toBe(201);
    const duplicateCase = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "spring term", startsOn: "2029-01-01", endsOn: "2029-12-31" });
    expect(duplicateCase.status).toBe(409);

    const overlap = await agent
      .post(years)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Overlap", startsOn: "2026-12-31", endsOn: "2027-12-31" });
    expect(overlap.status).toBe(409);

    const term = await agent
      .post(`/api/v1/schools/${schoolAId}/terms`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Term 1",
        academicYearId: yearId,
        startsOn: "2025-12-01",
        endsOn: "2026-03-31",
      });
    expect(term.status).toBe(400);
  });

  it("rejects cross-school parent IDs even when supplied in a valid request", async () => {
    const { app, store } = setup();
    const { agent, csrfToken } = await login(app);
    const otherYear = await store.createConfiguration({
      schoolId: schoolBId,
      actorUserId: "other-user",
      requestId: "seed",
      resource: "academicYears",
      data: { name: "Other year", startsOn: "2026-01-01", endsOn: "2026-12-31" },
    });

    const response = await agent
      .post(`/api/v1/schools/${schoolAId}/terms`)
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Term One",
        academicYearId: otherYear.id,
        startsOn: "2026-01-01",
        endsOn: "2026-03-31",
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PARENT_NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("Other year");
  });

  it("keeps parent records active until active children have been deactivated", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const yearResponse = await agent
      .post(`/api/v1/schools/${schoolAId}/academic-years`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" });
    const yearId = yearResponse.body.data.id as string;
    const classResponse = await agent
      .post(`/api/v1/schools/${schoolAId}/classes`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Grade 1", academicYearId: yearId });
    const classId = classResponse.body.data.id as string;
    const yearDeactivate = await agent
      .post(`/api/v1/schools/${schoolAId}/academic-years/${yearId}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(yearDeactivate.status).toBe(409);

    const classDeactivate = await agent
      .post(`/api/v1/schools/${schoolAId}/classes/${classId}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(classDeactivate.status).toBe(204);
    const yearDeactivateAfterChild = await agent
      .post(`/api/v1/schools/${schoolAId}/academic-years/${yearId}/deactivate`)
      .set("X-CSRF-Token", csrfToken);
    expect(yearDeactivateAfterChild.status).toBe(204);
  });

  it("prevents duplicate class-subject assignments", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const year = await agent
      .post(`/api/v1/schools/${schoolAId}/academic-years`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" });
    const classResponse = await agent
      .post(`/api/v1/schools/${schoolAId}/classes`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Grade 1", academicYearId: year.body.data.id });
    const subjectResponse = await agent
      .post(`/api/v1/schools/${schoolAId}/subjects`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Mathematics" });
    const assignmentPath = `/api/v1/schools/${schoolAId}/class-subjects`;
    const payload = {
      classId: classResponse.body.data.id,
      subjectId: subjectResponse.body.data.id,
    };
    const first = await agent.post(assignmentPath).set("X-CSRF-Token", csrfToken).send(payload);
    const second = await agent.post(assignmentPath).set("X-CSRF-Token", csrfToken).send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("rejects invalid pagination and unknown fields", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const invalidQuery = await agent.get(`/api/v1/schools/${schoolAId}/academic-years?limit=1000`);
    expect(invalidQuery.status).toBe(400);

    const invalidBody = await agent
      .post(`/api/v1/schools/${schoolAId}/subjects`)
      .set("X-CSRF-Token", csrfToken)
      .send({ name: "Biology", schoolId: schoolBId });
    expect(invalidBody.status).toBe(400);
  });

  it("supports filtered, sorted, and paginated collection responses", async () => {
    const { app } = setup();
    const { agent, csrfToken } = await login(app);
    const subjects = `/api/v1/schools/${schoolAId}/subjects`;
    for (const name of ["Maths", "Art", "Music"]) {
      expect(
        (await agent.post(subjects).set("X-CSRF-Token", csrfToken).send({ name })).status,
      ).toBe(201);
    }

    const response = await agent.get(
      `${subjects}?q=art&status=ACTIVE&limit=1&offset=0&sortBy=name&sortOrder=asc`,
    );
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ limit: 1, offset: 0, total: 1 });
    expect(response.body.data.map((item: { name: string }) => item.name)).toEqual(["Art"]);
  });
});
