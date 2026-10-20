import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { parseEnvironment } from "../../config/env.js";
import type { PasswordHasher } from "../identity/identity-store.js";
import { AuthService } from "../identity/auth-service.js";
import { FakeIdentityStore } from "../identity/test-support/fake-identity-store.js";
import { ReportsService, type ReportsSources } from "./reports-service.js";

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
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
};
const studentRecord = {
  id: "student-a",
  admissionNumber: "2026/001",
  admissionYearId: "5ba43b9e-c291-4033-9501-e15e31c63852",
  admissionApplicationId: "3a1e5c63-1195-4eb2-bf5e-503623fe0598",
  givenName: "=1+1",
  middleName: null,
  familyName: "Kamau",
  dateOfBirth: null,
  status: "ACTIVE" as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function sources(overrides: Partial<ReportsSources> = {}) {
  const initial: ReportsSources = {
    admissions: {
      listStudents: vi.fn(async () => ({ items: [studentRecord], total: 1 })),
    },
    attendance: {
      summary: vi.fn(async () => [
        { date: "2026-10-19", status: "PRESENT" as const, total: 18 },
        { date: "2026-10-19", status: "ABSENT" as const, total: 2 },
      ]),
    },
    assessments: {
      academicSummary: vi.fn(async () => ({
        assessmentCount: 4,
        eligibleCount: 80,
        enteredCount: 72,
        missingCount: 8,
        publishedCount: 2,
      })),
    },
    finance: {
      getReport: vi.fn(async (_schoolId, from, to) => ({
        from,
        to,
        paymentsReceived: "1200.00",
        paymentCount: 3,
        chargeCount: 5,
        outstandingCharges: "800.00",
        unappliedCredit: "100.00",
        reconciliationExceptionCount: 1,
      })),
    },
    staff: {
      listStaff: vi.fn(async () => ({
        items: [
          {
            id: "staff-a",
            staffNumber: "EMP-01",
            givenName: "Amina",
            middleName: null,
            familyName: "Njeri",
            contactEmail: "private@example.test",
            contactPhone: "+254700000000",
            positionTitle: "Teacher",
            departmentId: null,
            department: null,
            userId: null,
            status: "ACTIVE" as const,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
        total: 1,
      })),
    },
  };
  return { ...initial, ...overrides };
}

function setup(permissions: string[], reportSources = sources()) {
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
  const reportsService = new ReportsService(reportSources);
  const app = createApp(config, {
    authService,
    reportsService,
    checkDatabase: async () => {},
  });
  return { app, identityStore, reportSources };
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
  if (!csrfToken) throw new Error("Login response did not set a CSRF token.");
  return { agent, csrfToken };
}

describe("reports API", () => {
  it("requires authentication, report/source permissions, and authorized school context", async () => {
    const reportPermissions = ["reports.students.read", "students.profile.read"];
    const noAccess = setup([]);
    const base = `/api/v1/schools/${schoolAId}/reports/students`;
    expect((await request(noAccess.app).get(base)).status).toBe(401);

    const noSourcePermission = setup(["reports.students.read"]);
    const denied = await login(noSourcePermission.app);
    expect((await denied.agent.get(base)).status).toBe(403);

    const authorized = setup(reportPermissions);
    const signedIn = await login(authorized.app);
    const crossSchool = await signedIn.agent.get(`/api/v1/schools/${schoolBId}/reports/students`);
    expect(crossSchool.status).toBe(404);
    expect(crossSchool.body.error.code).toBe("SCHOOL_NOT_FOUND");
  });

  it("returns tenant-scoped student pages with only approved report fields and audits access", async () => {
    const { app, identityStore, reportSources } = setup([
      "reports.students.read",
      "students.profile.read",
    ]);
    const { agent } = await login(app);

    const response = await agent.get(`/api/v1/schools/${schoolAId}/reports/students?limit=10`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: studentRecord.id,
        admissionNumber: studentRecord.admissionNumber,
        givenName: studentRecord.givenName,
        familyName: studentRecord.familyName,
        status: "ACTIVE",
        createdAt: studentRecord.createdAt.toISOString(),
      },
    ]);
    expect(reportSources.admissions.listStudents).toHaveBeenCalledWith(
      schoolAId,
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
    expect(identityStore.auditEvents.at(-1)).toMatchObject({
      eventType: "REPORT_VIEWED_STUDENTS",
      outcome: "SUCCESS",
    });
  });

  it("combines source-of-truth summaries for a dashboard and rejects invalid dates", async () => {
    const reportSources = sources();
    const { app } = setup(
      [
        "reports.dashboard.read",
        "reports.attendance.read",
        "attendance.register.read",
        "assessments.read",
        "finance.reports.read",
      ],
      reportSources,
    );
    const { agent } = await login(app);
    const dashboard = await agent.get(
      `/api/v1/schools/${schoolAId}/reports/dashboard?from=2026-10-01&to=2026-10-31&academicYearId=5ba43b9e-c291-4033-9501-e15e31c63852&termId=4b8900ae-9e2a-41aa-8a5e-54a9f6e71af3`,
    );

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data).toMatchObject({
      attendance: [
        { status: "PRESENT", total: 18 },
        { status: "ABSENT", total: 2 },
      ],
      academics: { eligibleCount: 80, enteredCount: 72, missingCount: 8 },
      finance: { paymentsReceived: "1200.00", outstandingCharges: "800.00" },
    });
    expect(reportSources.attendance.summary).toHaveBeenCalledWith(
      schoolAId,
      expect.objectContaining({ from: "2026-10-01", to: "2026-10-31" }),
    );
    const singleDay = await agent.get(
      `/api/v1/schools/${schoolAId}/reports/attendance?from=2026-10-19&to=2026-10-19`,
    );
    expect(singleDay.status).toBe(200);
    expect(reportSources.attendance.summary).toHaveBeenCalledWith(
      schoolAId,
      expect.objectContaining({ from: "2026-10-19", to: "2026-10-19" }),
    );

    const invalidRange = await agent.get(
      `/api/v1/schools/${schoolAId}/reports/finance?from=2026-10-31&to=2026-10-01`,
    );
    expect(invalidRange.status).toBe(400);
    expect(invalidRange.body.error.code).toBe("VALIDATION_FAILED");

    const oversizedRange = await agent.get(
      `/api/v1/schools/${schoolAId}/reports/finance?from=2026-01-01&to=2027-01-02`,
    );
    expect(oversizedRange.status).toBe(400);
    expect(oversizedRange.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("requires export permission and returns a private CSV with formula-safe values", async () => {
    const permissions = [
      "reports.exports.generate",
      "reports.students.read",
      "students.profile.read",
    ];
    const { app, identityStore } = setup(permissions);
    const { agent } = await login(app);
    const response = await agent.get(`/api/v1/schools/${schoolAId}/reports/students/export.csv`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.text).toContain(`"'=1+1"`);
    expect(identityStore.auditEvents.at(-1)).toMatchObject({
      eventType: "REPORT_EXPORTED_STUDENTS",
      outcome: "SUCCESS",
    });

    const noExport = setup(["reports.students.read", "students.profile.read"]);
    const noExportSession = await login(noExport.app);
    expect(
      (await noExportSession.agent.get(`/api/v1/schools/${schoolAId}/reports/students/export.csv`))
        .status,
    ).toBe(403);
  });

  it("rejects exports above the synchronous row limit without returning partial data", async () => {
    const reportSources = sources({
      admissions: {
        listStudents: vi.fn(async () => ({ items: [studentRecord], total: 5_001 })),
      },
    });
    const { app } = setup(
      ["reports.exports.generate", "reports.students.read", "students.profile.read"],
      reportSources,
    );
    const { agent } = await login(app);
    const response = await agent.get(`/api/v1/schools/${schoolAId}/reports/students/export.csv`);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("REPORT_EXPORT_TOO_LARGE");
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("returns empty report pages and summaries without manufacturing rows", async () => {
    const reportSources = sources({
      admissions: {
        listStudents: vi.fn(async () => ({ items: [], total: 0 })),
      },
      attendance: {
        summary: vi.fn(async () => []),
      },
    });
    const { app } = setup(
      [
        "reports.students.read",
        "students.profile.read",
        "reports.attendance.read",
        "attendance.register.read",
      ],
      reportSources,
    );
    const { agent } = await login(app);

    const students = await agent.get(`/api/v1/schools/${schoolAId}/reports/students`);
    const attendance = await agent.get(
      `/api/v1/schools/${schoolAId}/reports/attendance?from=2026-10-19&to=2026-10-19`,
    );

    expect(students.status).toBe(200);
    expect(students.body.data).toEqual([]);
    expect(students.body.meta.total).toBe(0);
    expect(attendance.status).toBe(200);
    expect(attendance.body.data).toEqual([]);
  });
});
