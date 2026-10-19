import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import { requireAuthentication, requireSchoolPermission } from "../identity/auth-middleware.js";
import type { AuthService } from "../identity/auth-service.js";
import { ReportExportTooLargeError, type ReportsService } from "./reports-service.js";

const permissions = {
  dashboard: "reports.dashboard.read",
  students: "reports.students.read",
  attendance: "reports.attendance.read",
  academics: "reports.academics.read",
  finance: "reports.finance.read",
  staff: "reports.staff.read",
  exports: "reports.exports.generate",
  studentSource: "students.profile.read",
  attendanceSource: "attendance.register.read",
  academicSource: "assessments.read",
  financeSource: "finance.reports.read",
  staffSource: "staff.profile.read",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const dateRangeFields = z.object({ from: z.iso.date(), to: z.iso.date() }).strict();
function validateDateRange(query: { from: string; to: string }, context: z.RefinementCtx): void {
  if (query.from > query.to) {
    context.addIssue({
      code: "custom",
      message: "from must be on or before to.",
      path: ["to"],
    });
    return;
  }
  const days =
    (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000;
  if (days > 365) {
    context.addIssue({
      code: "custom",
      message: "Date ranges cannot exceed 366 calendar days.",
      path: ["to"],
    });
  }
}
const dateRange = dateRangeFields.superRefine(validateDateRange);
const academicFilter = z
  .object({
    academicYearId: z.uuid(),
    termId: z.uuid(),
    classId: z.uuid().optional(),
  })
  .strict();
const dashboardQuery = z
  .object({ ...dateRangeFields.shape, ...academicFilter.shape })
  .strict()
  .superRefine(validateDateRange);
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
const studentQuery = page
  .extend({
    status: z.enum(["ACTIVE", "TRANSFERRED", "GRADUATED", "WITHDRAWN"]).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["admissionNumber", "familyName", "createdAt"]).default("familyName"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
const staffQuery = page
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    departmentId: z.uuid().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["staffNumber", "familyName", "createdAt"]).default("familyName"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
const attendanceQuery = z
  .object({
    ...dateRangeFields.shape,
    type: z.enum(["STUDENT_DAILY", "STUDENT_LESSON", "STAFF_DAILY"]).optional(),
    classId: z.uuid().optional(),
  })
  .strict()
  .superRefine(validateDateRange);
const academicQuery = academicFilter;
const exportStudentQuery = studentQuery.omit({ limit: true, offset: true });
const exportStaffQuery = staffQuery.omit({ limit: true, offset: true });

export function createReportsRouter(
  service: ReportsService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);

  router.get(
    "/schools/:schoolId/reports/dashboard",
    authenticate,
    validateRequest({ params: schoolParams, query: dashboardQuery }),
    ...requireAllPermissions(authService, [
      permissions.dashboard,
      permissions.attendanceSource,
      permissions.academicSource,
      permissions.financeSource,
    ]),
    route(async (request, response) => {
      const result = await service.dashboard(
        schoolId(request),
        dashboardQuery.parse(request.query),
      );
      await auditReport(authService, request, response, "DASHBOARD", false);
      response.json({ data: result });
    }),
  );

  router.get(
    "/schools/:schoolId/reports/students",
    authenticate,
    validateRequest({ params: schoolParams, query: studentQuery }),
    ...requireAllPermissions(authService, [permissions.students, permissions.studentSource]),
    route(async (request, response) => {
      const query = studentQuery.parse(request.query);
      const result = await service.students(schoolId(request), query);
      await auditReport(authService, request, response, "STUDENTS", false);
      response.json({
        data: result.items.map(studentDto),
        meta: { ...query, total: result.total },
      });
    }),
  );

  router.get(
    "/schools/:schoolId/reports/attendance",
    authenticate,
    validateRequest({ params: schoolParams, query: attendanceQuery }),
    ...requireAllPermissions(authService, [permissions.attendance, permissions.attendanceSource]),
    route(async (request, response) => {
      const result = await service.attendance(
        schoolId(request),
        attendanceQuery.parse(request.query),
      );
      await auditReport(authService, request, response, "ATTENDANCE", false);
      response.json({ data: result });
    }),
  );

  router.get(
    "/schools/:schoolId/reports/academics",
    authenticate,
    validateRequest({ params: schoolParams, query: academicQuery }),
    ...requireAllPermissions(authService, [permissions.academics, permissions.academicSource]),
    route(async (request, response) => {
      const result = await service.academics(schoolId(request), academicQuery.parse(request.query));
      await auditReport(authService, request, response, "ACADEMICS", false);
      response.json({ data: result });
    }),
  );

  router.get(
    "/schools/:schoolId/reports/finance",
    authenticate,
    validateRequest({ params: schoolParams, query: dateRange }),
    ...requireAllPermissions(authService, [permissions.finance, permissions.financeSource]),
    route(async (request, response) => {
      const result = await service.finance(schoolId(request), dateRange.parse(request.query));
      await auditReport(authService, request, response, "FINANCE", false);
      response.json({ data: result });
    }),
  );

  router.get(
    "/schools/:schoolId/reports/staff",
    authenticate,
    validateRequest({ params: schoolParams, query: staffQuery }),
    ...requireAllPermissions(authService, [permissions.staff, permissions.staffSource]),
    route(async (request, response) => {
      const query = staffQuery.parse(request.query);
      const result = await service.staff(schoolId(request), query);
      await auditReport(authService, request, response, "STAFF", false);
      response.json({ data: result.items.map(staffDto), meta: { ...query, total: result.total } });
    }),
  );

  router.get(
    "/schools/:schoolId/reports/students/export.csv",
    authenticate,
    validateRequest({ params: schoolParams, query: exportStudentQuery }),
    ...requireAllPermissions(authService, [
      permissions.exports,
      permissions.students,
      permissions.studentSource,
    ]),
    route(async (request, response) => {
      const rows = await service.exportStudents(
        schoolId(request),
        exportStudentQuery.parse(request.query),
      );
      await auditReport(authService, request, response, "STUDENTS", true);
      sendCsv(response, "students.csv", [
        ["admissionNumber", "givenName", "familyName", "status"],
        ...rows.map((row) => [row.admissionNumber, row.givenName, row.familyName, row.status]),
      ]);
    }),
  );

  router.get(
    "/schools/:schoolId/reports/attendance/export.csv",
    authenticate,
    validateRequest({ params: schoolParams, query: attendanceQuery }),
    ...requireAllPermissions(authService, [
      permissions.exports,
      permissions.attendance,
      permissions.attendanceSource,
    ]),
    route(async (request, response) => {
      const rows = await service.attendance(
        schoolId(request),
        attendanceQuery.parse(request.query),
      );
      await auditReport(authService, request, response, "ATTENDANCE", true);
      sendCsv(response, "attendance.csv", [
        ["date", "status", "total"],
        ...rows.map((row) => [row.date, row.status, row.total]),
      ]);
    }),
  );

  router.get(
    "/schools/:schoolId/reports/academics/export.csv",
    authenticate,
    validateRequest({ params: schoolParams, query: academicQuery }),
    ...requireAllPermissions(authService, [
      permissions.exports,
      permissions.academics,
      permissions.academicSource,
    ]),
    route(async (request, response) => {
      const result = await service.academics(schoolId(request), academicQuery.parse(request.query));
      await auditReport(authService, request, response, "ACADEMICS", true);
      sendCsv(response, "academics.csv", [
        ["assessmentCount", "eligibleCount", "enteredCount", "missingCount", "publishedCount"],
        [
          result.assessmentCount,
          result.eligibleCount,
          result.enteredCount,
          result.missingCount,
          result.publishedCount,
        ],
      ]);
    }),
  );

  router.get(
    "/schools/:schoolId/reports/finance/export.csv",
    authenticate,
    validateRequest({ params: schoolParams, query: dateRange }),
    ...requireAllPermissions(authService, [
      permissions.exports,
      permissions.finance,
      permissions.financeSource,
    ]),
    route(async (request, response) => {
      const result = await service.finance(schoolId(request), dateRange.parse(request.query));
      await auditReport(authService, request, response, "FINANCE", true);
      sendCsv(response, "finance.csv", [
        [
          "from",
          "to",
          "paymentsReceived",
          "paymentCount",
          "chargeCount",
          "outstandingCharges",
          "unappliedCredit",
          "reconciliationExceptionCount",
        ],
        [
          result.from,
          result.to,
          result.paymentsReceived,
          result.paymentCount,
          result.chargeCount,
          result.outstandingCharges,
          result.unappliedCredit,
          result.reconciliationExceptionCount,
        ],
      ]);
    }),
  );

  router.get(
    "/schools/:schoolId/reports/staff/export.csv",
    authenticate,
    validateRequest({ params: schoolParams, query: exportStaffQuery }),
    ...requireAllPermissions(authService, [
      permissions.exports,
      permissions.staff,
      permissions.staffSource,
    ]),
    route(async (request, response) => {
      const rows = await service.exportStaff(
        schoolId(request),
        exportStaffQuery.parse(request.query),
      );
      await auditReport(authService, request, response, "STAFF", true);
      sendCsv(response, "staff.csv", [
        ["staffNumber", "givenName", "familyName", "positionTitle", "status"],
        ...rows.map((row) => [
          row.staffNumber,
          row.givenName,
          row.familyName,
          row.positionTitle,
          row.status,
        ]),
      ]);
    }),
  );

  return router;
}

function requireAllPermissions(authService: AuthService, required: string[]): RequestHandler[] {
  return required.map((permission) => requireSchoolPermission(authService, permission));
}

function studentDto(student: {
  id: string;
  admissionNumber: string;
  givenName: string;
  familyName: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: student.id,
    admissionNumber: student.admissionNumber,
    givenName: student.givenName,
    familyName: student.familyName,
    status: student.status,
    createdAt: student.createdAt.toISOString(),
  };
}

function staffDto(staff: {
  id: string;
  staffNumber: string;
  givenName: string;
  familyName: string;
  positionTitle: string;
  status: string;
  department: { name: string } | null;
}) {
  return {
    id: staff.id,
    staffNumber: staff.staffNumber,
    givenName: staff.givenName,
    familyName: staff.familyName,
    positionTitle: staff.positionTitle,
    department: staff.department?.name ?? null,
    status: staff.status,
  };
}

function sendCsv(
  response: Response,
  filename: string,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
) {
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  response
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    .setHeader("Cache-Control", "private, no-store")
    .send(content);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function schoolId(request: Request): string {
  const value = request.params["schoolId"];
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
  }

  return value;
}

async function auditReport(
  authService: AuthService,
  request: Request,
  response: Response,
  reportType: "DASHBOARD" | "STUDENTS" | "ATTENDANCE" | "ACADEMICS" | "FINANCE" | "STAFF",
  exported: boolean,
): Promise<void> {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  await authService.recordReportAudit({
    userId,
    schoolId: schoolId(request),
    reportType,
    exported,
    requestId: response.getHeader("x-request-id")?.toString() ?? "unknown",
  });
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch((error: unknown) => {
      if (error instanceof ReportExportTooLargeError) {
        next(new ApiError(413, "REPORT_EXPORT_TOO_LARGE", error.message));
        return;
      }
      next(error);
    });
  };
}
