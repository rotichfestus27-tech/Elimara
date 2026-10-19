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
import type { AdmissionsService } from "./admissions-service.js";

const permissions = {
  applicationRead: "admissions.application.read",
  applicationCreate: "admissions.application.create",
  applicationReview: "admissions.application.review",
  applicationAdmit: "admissions.application.admit",
  studentRead: "students.profile.read",
  studentUpdate: "students.profile.update",
  studentStatus: "students.profile.status",
  guardianRead: "guardians.profile.read",
  guardianManage: "guardians.profile.manage",
  studentGuardianManage: "students.guardian.manage",
  placementManage: "students.placement.manage",
} as const;

const schoolParamsSchema = z.object({ schoolId: z.uuid() }).strict();
const recordParamsSchema = schoolParamsSchema.extend({ id: z.uuid() }).strict();
const guardianParamsSchema = schoolParamsSchema.extend({ guardianId: z.uuid() }).strict();
const studentGuardianParamsSchema = schoolParamsSchema
  .extend({
    id: z.uuid(),
    guardianId: z.uuid(),
  })
  .strict();

const existingGuardianSchema = z
  .object({
    existingGuardianId: z.uuid(),
    relationship: z.string().trim().min(1).max(60),
    authorizedAccess: z.boolean(),
  })
  .strict();
const newGuardianSchema = z
  .object({
    givenName: z.string().trim().min(1).max(100),
    middleName: z.string().trim().min(1).max(100).nullable().optional(),
    familyName: z.string().trim().min(1).max(100),
    email: z.email().max(320).nullable().optional(),
    phone: z.string().trim().min(7).max(40).nullable().optional(),
    relationship: z.string().trim().min(1).max(60),
    authorizedAccess: z.boolean(),
  })
  .strict()
  .refine((value) => Boolean(value.email?.trim() || value.phone?.trim()), {
    message: "New guardians require at least one contact method.",
  });
const guardianSchema = z.union([existingGuardianSchema, newGuardianSchema]);

const personSchema = z.object({
  givenName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().min(1).max(100).nullable().optional(),
  familyName: z.string().trim().min(1).max(100),
  dateOfBirth: z.iso.date().nullable().optional(),
  guardians: z.array(guardianSchema).min(1).max(10),
});

const applicationCreateSchema = personSchema.strict();
const applicationUpdateSchema = personSchema.strict();
const applicationListSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    status: z
      .enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN", "ADMITTED"])
      .optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
const transitionSchema = z
  .object({ transition: z.enum(["submit", "review", "accept", "reject", "withdraw"]) })
  .strict();
const admitSchema = z
  .object({
    academicYearId: z.uuid(),
    classId: z.uuid(),
    streamId: z.uuid().optional(),
  })
  .strict();

const studentListSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    status: z.enum(["ACTIVE", "TRANSFERRED", "GRADUATED", "WITHDRAWN"]).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["admissionNumber", "familyName", "createdAt"]).default("admissionNumber"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
const studentUpdateSchema = z
  .object({
    givenName: z.string().trim().min(1).max(100).optional(),
    middleName: z.string().trim().min(1).max(100).nullable().optional(),
    familyName: z.string().trim().min(1).max(100).optional(),
    dateOfBirth: z.iso.date().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
const studentStatusSchema = z
  .object({ status: z.enum(["TRANSFERRED", "GRADUATED", "WITHDRAWN"]) })
  .strict();

const guardianListSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    q: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["familyName", "createdAt"]).default("familyName"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();
const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();
const guardianCreateSchema = z
  .object({
    givenName: z.string().trim().min(1).max(100),
    middleName: z.string().trim().min(1).max(100).nullable().optional(),
    familyName: z.string().trim().min(1).max(100),
    email: z.email().max(320).nullable().optional(),
    phone: z.string().trim().min(7).max(40).nullable().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.email?.trim() || value.phone?.trim()), {
    message: "At least one contact method is required.",
  });
const guardianUpdateSchema = z
  .object({
    givenName: z.string().trim().min(1).max(100).optional(),
    middleName: z.string().trim().min(1).max(100).nullable().optional(),
    familyName: z.string().trim().min(1).max(100).optional(),
    email: z.email().max(320).nullable().optional(),
    phone: z.string().trim().min(7).max(40).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
const studentGuardianUpdateSchema = z
  .object({
    relationship: z.string().trim().min(1).max(60).optional(),
    authorizedAccess: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
const studentGuardianCreateSchema = z
  .object({
    guardianId: z.uuid(),
    relationship: z.string().trim().min(1).max(60),
    authorizedAccess: z.boolean(),
  })
  .strict();

export function createAdmissionsRouter(
  service: AdmissionsService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.post(
    "/schools/:schoolId/admission-applications",
    authenticate,
    csrf,
    validateRequest({ params: schoolParamsSchema, body: applicationCreateSchema }),
    requireSchoolPermission(authService, permissions.applicationCreate),
    route(async (request, response) => {
      const key = request.get("Idempotency-Key");
      if (!key || key.length > 100) {
        throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid Idempotency-Key is required.");
      }
      const result = await service.createApplication({
        ...context(request, response),
        idempotencyKey: key,
        ...applicationCreateSchema.parse(request.body),
      });
      response.status(201).json({ data: serializeApplication(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/admission-applications",
    authenticate,
    validateRequest({ params: schoolParamsSchema, query: applicationListSchema }),
    requireSchoolPermission(authService, permissions.applicationRead),
    route(async (request, response) => {
      const query = applicationListSchema.parse(request.query);
      const result = await service.listApplications(schoolId(request), {
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { search: query.q } : {}),
      });
      response.json({
        data: result.items.map(serializeApplication),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.get(
    "/schools/:schoolId/admission-applications/:id",
    authenticate,
    validateRequest({ params: recordParamsSchema }),
    requireSchoolPermission(authService, permissions.applicationRead),
    route(async (request, response) => {
      const application = await service.getApplication(schoolId(request), recordId(request));
      response.json({ data: serializeApplication(application) });
    }),
  );

  router.patch(
    "/schools/:schoolId/admission-applications/:id",
    authenticate,
    csrf,
    validateRequest({ params: recordParamsSchema, body: applicationUpdateSchema }),
    requireSchoolPermission(authService, permissions.applicationCreate),
    route(async (request, response) => {
      const result = await service.updateDraftApplication({
        ...context(request, response),
        id: recordId(request),
        ...applicationUpdateSchema.parse(request.body),
      });
      response.json({ data: serializeApplication(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/admission-applications/:id/transitions",
    authenticate,
    csrf,
    validateRequest({ params: recordParamsSchema, body: transitionSchema }),
    transitionPermission(authService),
    route(async (request, response) => {
      const body = transitionSchema.parse(request.body);
      const result = await service.transitionApplication({
        ...context(request, response),
        id: recordId(request),
        transition: body.transition,
      });
      response.json({ data: serializeApplication(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/admission-applications/:id/admit",
    authenticate,
    csrf,
    validateRequest({ params: recordParamsSchema, body: admitSchema }),
    requireSchoolPermission(authService, permissions.applicationAdmit),
    route(async (request, response) => {
      const result = await service.admitApplication({
        ...context(request, response),
        id: recordId(request),
        ...admitSchema.parse(request.body),
      });
      response.status(result.replayed ? 200 : 201).json({
        data: serializeStudent(result.student),
        meta: { replayed: result.replayed },
      });
    }),
  );

  registerStudentRoutes(router, service, authService, authenticate, csrf);
  registerGuardianRoutes(router, service, authService, authenticate, csrf);
  return router;
}

function registerStudentRoutes(
  router: Router,
  service: AdmissionsService,
  authService: AuthService,
  authenticate: RequestHandler,
  csrf: RequestHandler,
) {
  router.get(
    "/schools/:schoolId/students",
    authenticate,
    validateRequest({ params: schoolParamsSchema, query: studentListSchema }),
    requireSchoolPermission(authService, permissions.studentRead),
    route(async (request, response) => {
      const query = studentListSchema.parse(request.query);
      const result = await service.listStudents(schoolId(request), {
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { search: query.q } : {}),
      });
      response.json({
        data: result.items.map(serializeStudent),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:id",
    authenticate,
    validateRequest({ params: recordParamsSchema }),
    requireSchoolPermission(authService, permissions.studentRead),
    route(async (request, response) => {
      const student = await service.getStudent(schoolId(request), recordId(request));
      response.json({ data: serializeStudent(student) });
    }),
  );

  router.patch(
    "/schools/:schoolId/students/:id",
    authenticate,
    csrf,
    validateRequest({ params: recordParamsSchema, body: studentUpdateSchema }),
    requireSchoolPermission(authService, permissions.studentUpdate),
    route(async (request, response) => {
      const student = await service.updateStudentProfile({
        ...context(request, response),
        id: recordId(request),
        ...studentUpdateSchema.parse(request.body),
      });
      response.json({ data: serializeStudent(student) });
    }),
  );

  router.post(
    "/schools/:schoolId/students/:id/status",
    authenticate,
    csrf,
    validateRequest({ params: recordParamsSchema, body: studentStatusSchema }),
    requireSchoolPermission(authService, permissions.studentStatus),
    route(async (request, response) => {
      const student = await service.changeStudentStatus({
        ...context(request, response),
        id: recordId(request),
        ...studentStatusSchema.parse(request.body),
      });
      response.json({ data: serializeStudent(student) });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:id/profile-history",
    authenticate,
    validateRequest({ params: recordParamsSchema, query: historyQuerySchema }),
    requireSchoolPermission(authService, permissions.studentRead),
    route(async (request, response) => {
      const result = await service.listStudentProfileRevisions(
        schoolId(request),
        recordId(request),
        historyQuerySchema.parse(request.query),
      );
      response.json({
        data: result.items.map((revision) => ({
          ...revision,
          dateOfBirth: revision.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          recordedAt: revision.recordedAt.toISOString(),
        })),
        meta: pageMeta(historyQuerySchema.parse(request.query), result.total),
      });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:id/guardians",
    authenticate,
    validateRequest({ params: recordParamsSchema }),
    requireSchoolPermission(authService, permissions.studentRead),
    requireSchoolPermission(authService, permissions.guardianRead),
    route(async (request, response) => {
      const result = await service.listStudentGuardians(schoolId(request), recordId(request));
      response.json({ data: result.map(serializeStudentGuardian) });
    }),
  );

  router.patch(
    "/schools/:schoolId/students/:id/guardians/:guardianId",
    authenticate,
    csrf,
    validateRequest({ params: studentGuardianParamsSchema, body: studentGuardianUpdateSchema }),
    requireSchoolPermission(authService, permissions.studentGuardianManage),
    route(async (request, response) => {
      const result = await service.updateStudentGuardian({
        ...context(request, response),
        studentId: recordId(request),
        guardianId: guardianId(request),
        ...studentGuardianUpdateSchema.parse(request.body),
      });
      response.json({ data: serializeStudentGuardian(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/students/:id/guardians",
    authenticate,
    csrf,
    validateRequest({ params: recordParamsSchema, body: studentGuardianCreateSchema }),
    requireSchoolPermission(authService, permissions.studentGuardianManage),
    route(async (request, response) => {
      const body = studentGuardianCreateSchema.parse(request.body);
      const result = await service.createStudentGuardian({
        ...context(request, response),
        studentId: recordId(request),
        guardianId: body.guardianId,
        relationship: body.relationship,
        authorizedAccess: body.authorizedAccess,
      });
      response.status(201).json({ data: serializeStudentGuardian(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:id/placements",
    authenticate,
    validateRequest({ params: recordParamsSchema }),
    requireSchoolPermission(authService, permissions.studentRead),
    route(async (request, response) => {
      const result = await service.listStudentPlacements(schoolId(request), recordId(request));
      response.json({
        data: result.map((placement) => ({
          ...placement,
          startedAt: placement.startedAt.toISOString(),
          endedAt: placement.endedAt?.toISOString() ?? null,
        })),
      });
    }),
  );
}

function registerGuardianRoutes(
  router: Router,
  service: AdmissionsService,
  authService: AuthService,
  authenticate: RequestHandler,
  csrf: RequestHandler,
) {
  router.get(
    "/schools/:schoolId/guardians",
    authenticate,
    validateRequest({ params: schoolParamsSchema, query: guardianListSchema }),
    requireSchoolPermission(authService, permissions.guardianRead),
    route(async (request, response) => {
      const query = guardianListSchema.parse(request.query);
      const result = await service.listGuardians(schoolId(request), {
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        ...(query.q ? { search: query.q } : {}),
      });
      response.json({
        data: result.items.map(serializeGuardian),
        meta: pageMeta(query, result.total),
      });
    }),
  );

  router.post(
    "/schools/:schoolId/guardians",
    authenticate,
    csrf,
    validateRequest({ params: schoolParamsSchema, body: guardianCreateSchema }),
    requireSchoolPermission(authService, permissions.guardianManage),
    route(async (request, response) => {
      const result = await service.createGuardian({
        ...context(request, response),
        ...guardianCreateSchema.parse(request.body),
      });
      response.status(201).json({ data: serializeGuardian(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/guardians/:guardianId",
    authenticate,
    validateRequest({ params: guardianParamsSchema }),
    requireSchoolPermission(authService, permissions.guardianRead),
    route(async (request, response) => {
      const result = await service.getGuardian(schoolId(request), guardianId(request));
      response.json({ data: serializeGuardian(result) });
    }),
  );

  router.patch(
    "/schools/:schoolId/guardians/:guardianId",
    authenticate,
    csrf,
    validateRequest({ params: guardianParamsSchema, body: guardianUpdateSchema }),
    requireSchoolPermission(authService, permissions.guardianManage),
    route(async (request, response) => {
      const result = await service.updateGuardian({
        ...context(request, response),
        id: guardianId(request),
        ...guardianUpdateSchema.parse(request.body),
      });
      response.json({ data: serializeGuardian(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/guardians/:guardianId/profile-history",
    authenticate,
    validateRequest({ params: guardianParamsSchema, query: historyQuerySchema }),
    requireSchoolPermission(authService, permissions.guardianRead),
    route(async (request, response) => {
      const result = await service.listGuardianProfileRevisions(
        schoolId(request),
        guardianId(request),
        historyQuerySchema.parse(request.query),
      );
      response.json({
        data: result.items.map((revision) => ({
          ...revision,
          recordedAt: revision.recordedAt.toISOString(),
        })),
        meta: pageMeta(historyQuerySchema.parse(request.query), result.total),
      });
    }),
  );
}

function serializeApplication<
  T extends {
    createdAt: Date;
    updatedAt: Date;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
    withdrawnAt: Date | null;
    admittedAt: Date | null;
    dateOfBirth: Date | null;
    guardians: Array<{
      guardianId: string | null;
    }>;
  },
>(record: T) {
  return {
    ...record,
    dateOfBirth: record.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    rejectedAt: record.rejectedAt?.toISOString() ?? null,
    withdrawnAt: record.withdrawnAt?.toISOString() ?? null,
    admittedAt: record.admittedAt?.toISOString() ?? null,
  };
}

function serializeStudent<T extends { dateOfBirth: Date | null; createdAt: Date; updatedAt: Date }>(
  record: T,
) {
  return {
    ...record,
    dateOfBirth: record.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeGuardian<T extends { createdAt: Date; updatedAt: Date }>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeStudentGuardian<T extends { guardian: { createdAt: Date; updatedAt: Date } }>(
  record: T,
) {
  return { ...record, guardian: serializeGuardian(record.guardian) };
}

function pageMeta(query: { limit: number; offset: number }, total: number) {
  return { limit: query.limit, offset: query.offset, total };
}

function context(request: Request, response: Response) {
  return {
    schoolId: schoolId(request),
    actorUserId: authenticatedUserId(response),
    requestId: requestId(response),
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

function guardianId(request: Request): string {
  const value = request.params["guardianId"];
  if (typeof value !== "string")
    throw new ApiError(400, "INVALID_ID", "A guardian ID is required.");
  return value;
}

function authenticatedUserId(response: Response): string {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return userId;
}

function requestId(response: Response): string {
  return response.getHeader("x-request-id")?.toString() ?? "unknown";
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function transitionPermission(authService: AuthService): RequestHandler {
  return (request, response, next) => {
    const transition = transitionSchema.parse(request.body).transition;
    const permission =
      transition === "submit" || transition === "withdraw"
        ? permissions.applicationCreate
        : permissions.applicationReview;
    requireSchoolPermission(authService, permission)(request, response, next);
  };
}
