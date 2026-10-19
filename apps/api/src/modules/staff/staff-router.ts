import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import type { AuthService } from "../identity/auth-service.js";
import {
  requireAuthentication,
  requireCsrf,
  requireSchoolPermission,
} from "../identity/auth-middleware.js";
import type { StaffService } from "./staff-service.js";

const permissions = {
  profileRead: "staff.profile.read",
  profileManage: "staff.profile.manage",
  employmentRead: "staff.employment.read",
  employmentManage: "staff.employment.manage",
  assignmentRead: "staff.assignment.read",
  assignmentManage: "staff.assignment.manage",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const recordParams = schoolParams.extend({ id: z.uuid() }).strict();
const staffParams = schoolParams.extend({ staffId: z.uuid() }).strict();
const employmentParams = staffParams.extend({ employmentId: z.uuid() }).strict();
const assignmentParams = staffParams.extend({ assignmentId: z.uuid() }).strict();

const pageFields = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  q: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
};
const departmentList = z
  .object({
    ...pageFields,
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();
const staffList = z
  .object({
    ...pageFields,
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    departmentId: z.uuid().optional(),
    sortBy: z.enum(["staffNumber", "familyName", "createdAt"]).default("familyName"),
  })
  .strict();
const historyPage = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();
const departmentCreate = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const staffCreate = z
  .object({
    staffNumber: z.string().trim().min(1).max(80),
    givenName: z.string().trim().min(1).max(100),
    middleName: z.string().trim().min(1).max(100).nullable().optional(),
    familyName: z.string().trim().min(1).max(100),
    contactEmail: z.email().max(320).nullable().optional(),
    contactPhone: z.string().trim().min(7).max(40).nullable().optional(),
    positionTitle: z.string().trim().min(1).max(120),
    departmentId: z.uuid().nullable().optional(),
    userId: z.uuid().nullable().optional(),
  })
  .strict();
const staffUpdate = z
  .object({
    staffNumber: z.string().trim().min(1).max(80).optional(),
    givenName: z.string().trim().min(1).max(100).optional(),
    middleName: z.string().trim().min(1).max(100).nullable().optional(),
    familyName: z.string().trim().min(1).max(100).optional(),
    contactEmail: z.email().max(320).nullable().optional(),
    contactPhone: z.string().trim().min(7).max(40).nullable().optional(),
    positionTitle: z.string().trim().min(1).max(120).optional(),
    departmentId: z.uuid().nullable().optional(),
    userId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
const statusUpdate = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).strict();
const employmentCreate = z
  .object({
    positionTitle: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
  })
  .strict();
const employmentEnd = z.object({ endsOn: z.iso.date() }).strict();
const classAssignmentCreate = z
  .object({ classId: z.uuid(), streamId: z.uuid().optional() })
  .strict();
const subjectAssignmentCreate = z.object({ classSubjectAssignmentId: z.uuid() }).strict();

export function createStaffRouter(
  service: StaffService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/departments",
    authenticate,
    validateRequest({ params: schoolParams, query: departmentList }),
    requireSchoolPermission(authService, permissions.profileRead),
    route(async (request, response) => {
      const query = departmentList.parse(request.query);
      const result = await service.listDepartments(schoolId(request), {
        limit: query.limit,
        offset: query.offset,
        sortOrder: query.sortOrder,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { search: query.q } : {}),
      });
      response.json({
        data: result.items.map(serializeDepartment),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/departments",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: departmentCreate }),
    requireSchoolPermission(authService, permissions.profileManage),
    route(async (request, response) => {
      const result = await service.createDepartment({
        ...context(request, response),
        ...departmentCreate.parse(request.body),
      });
      response.status(201).json({ data: serializeDepartment(result) });
    }),
  );

  router.patch(
    "/schools/:schoolId/departments/:id",
    authenticate,
    csrf,
    validateRequest({ params: recordParams, body: departmentCreate }),
    requireSchoolPermission(authService, permissions.profileManage),
    route(async (request, response) => {
      const result = await service.updateDepartment({
        ...context(request, response),
        id: recordId(request),
        ...departmentCreate.parse(request.body),
      });
      response.json({ data: serializeDepartment(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/departments/:id/deactivate",
    authenticate,
    csrf,
    validateRequest({ params: recordParams }),
    requireSchoolPermission(authService, permissions.profileManage),
    route(async (request, response) => {
      await service.deactivateDepartment({
        ...context(request, response),
        id: recordId(request),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/staff",
    authenticate,
    validateRequest({ params: schoolParams, query: staffList }),
    requireSchoolPermission(authService, permissions.profileRead),
    route(async (request, response) => {
      const query = staffList.parse(request.query);
      const result = await service.listStaff(schoolId(request), {
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        ...(query.status ? { status: query.status } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.q ? { search: query.q } : {}),
      });
      response.json({
        data: result.items.map(serializeStaff),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/staff",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: staffCreate }),
    requireSchoolPermission(authService, permissions.profileManage),
    route(async (request, response) => {
      const result = await service.createStaff({
        ...context(request, response),
        ...staffCreate.parse(request.body),
      });
      response.status(201).json({ data: serializeStaff(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/staff/:id",
    authenticate,
    validateRequest({ params: recordParams }),
    requireSchoolPermission(authService, permissions.profileRead),
    route(async (request, response) => {
      const result = await service.getStaff(schoolId(request), recordId(request));
      response.json({ data: serializeStaff(result) });
    }),
  );

  router.patch(
    "/schools/:schoolId/staff/:id",
    authenticate,
    csrf,
    validateRequest({ params: recordParams, body: staffUpdate }),
    requireSchoolPermission(authService, permissions.profileManage),
    route(async (request, response) => {
      const result = await service.updateStaff({
        ...context(request, response),
        id: recordId(request),
        ...staffUpdate.parse(request.body),
      });
      response.json({ data: serializeStaff(result) });
    }),
  );

  router.patch(
    "/schools/:schoolId/staff/:id/status",
    authenticate,
    csrf,
    validateRequest({ params: recordParams, body: statusUpdate }),
    requireSchoolPermission(authService, permissions.profileManage),
    route(async (request, response) => {
      const result = await service.changeStaffStatus({
        ...context(request, response),
        id: recordId(request),
        ...statusUpdate.parse(request.body),
      });
      response.json({ data: serializeStaff(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/staff/:staffId/employments",
    authenticate,
    validateRequest({ params: staffParams, query: historyPage }),
    requireSchoolPermission(authService, permissions.employmentRead),
    route(async (request, response) => {
      const query = historyPage.parse(request.query);
      const result = await service.listEmployments(schoolId(request), staffId(request), query);
      response.json({
        data: result.items.map(serializeEmployment),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/employments",
    authenticate,
    csrf,
    validateRequest({ params: staffParams, body: employmentCreate }),
    requireSchoolPermission(authService, permissions.employmentManage),
    route(async (request, response) => {
      const result = await service.createEmployment({
        ...context(request, response),
        staffId: staffId(request),
        ...employmentCreate.parse(request.body),
      });
      response.status(201).json({ data: serializeEmployment(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/employments/:employmentId/end",
    authenticate,
    csrf,
    validateRequest({ params: employmentParams, body: employmentEnd }),
    requireSchoolPermission(authService, permissions.employmentManage),
    route(async (request, response) => {
      const result = await service.endEmployment({
        ...context(request, response),
        staffId: staffId(request),
        employmentId: employmentId(request),
        ...employmentEnd.parse(request.body),
      });
      response.json({ data: serializeEmployment(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/staff/:staffId/assignments",
    authenticate,
    validateRequest({ params: staffParams, query: historyPage }),
    requireSchoolPermission(authService, permissions.assignmentRead),
    route(async (request, response) => {
      const query = historyPage.parse(request.query);
      const result = await service.listAssignments(schoolId(request), staffId(request), query);
      response.json({
        data: result.items.map(serializeAssignment),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/class-assignments",
    authenticate,
    csrf,
    validateRequest({ params: staffParams, body: classAssignmentCreate }),
    requireSchoolPermission(authService, permissions.assignmentManage),
    route(async (request, response) => {
      const result = await service.createClassAssignment({
        ...context(request, response),
        staffId: staffId(request),
        ...classAssignmentCreate.parse(request.body),
      });
      response.status(201).json({ data: serializeAssignment(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/subject-assignments",
    authenticate,
    csrf,
    validateRequest({ params: staffParams, body: subjectAssignmentCreate }),
    requireSchoolPermission(authService, permissions.assignmentManage),
    route(async (request, response) => {
      const result = await service.createSubjectAssignment({
        ...context(request, response),
        staffId: staffId(request),
        ...subjectAssignmentCreate.parse(request.body),
      });
      response.status(201).json({ data: serializeAssignment(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/class-assignments/:assignmentId/end",
    authenticate,
    csrf,
    validateRequest({ params: assignmentParams }),
    requireSchoolPermission(authService, permissions.assignmentManage),
    route(async (request, response) => {
      const result = await service.endClassAssignment({
        ...context(request, response),
        staffId: staffId(request),
        assignmentId: assignmentId(request),
      });
      response.json({ data: serializeAssignment(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/subject-assignments/:assignmentId/end",
    authenticate,
    csrf,
    validateRequest({ params: assignmentParams }),
    requireSchoolPermission(authService, permissions.assignmentManage),
    route(async (request, response) => {
      const result = await service.endSubjectAssignment({
        ...context(request, response),
        staffId: staffId(request),
        assignmentId: assignmentId(request),
      });
      response.json({ data: serializeAssignment(result) });
    }),
  );

  return router;
}

function serializeDepartment<T extends { createdAt: Date; updatedAt: Date }>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeStaff<T extends { createdAt: Date; updatedAt: Date; department: unknown }>(
  record: T,
) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeEmployment<T extends { startsOn: Date; endsOn: Date | null; createdAt: Date }>(
  record: T,
) {
  return {
    ...record,
    startsOn: record.startsOn.toISOString().slice(0, 10),
    endsOn: record.endsOn?.toISOString().slice(0, 10) ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeAssignment<T extends { createdAt: Date; endedAt: Date | null }>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
  };
}

function pageMeta(query: { limit: number; offset: number }, total: number) {
  return { limit: query.limit, offset: query.offset, total };
}

function context(request: Request, response: Response) {
  return {
    schoolId: schoolId(request),
    actorUserId: authenticatedUserId(response),
    requestId: response.getHeader("x-request-id")?.toString() ?? "unknown",
  };
}

function schoolId(request: Request): string {
  const value = request.params["schoolId"];
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
  return value;
}

function recordId(request: Request): string {
  const value = request.params["id"];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_ID", "A record ID is required.");
  return value;
}

function staffId(request: Request): string {
  const value = request.params["staffId"];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_ID", "A staff ID is required.");
  return value;
}

function employmentId(request: Request): string {
  const value = request.params["employmentId"];
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_ID", "An employment ID is required.");
  return value;
}

function assignmentId(request: Request): string {
  const value = request.params["assignmentId"];
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_ID", "An assignment ID is required.");
  return value;
}

function authenticatedUserId(response: Response): string {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return userId;
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
