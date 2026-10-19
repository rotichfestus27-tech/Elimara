import { type Request, type RequestHandler, type Response, Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import {
  requireAuthentication,
  requireCsrf,
  requirePlatformAdmin,
} from "../identity/auth-middleware.js";
import type { AuthService } from "../identity/auth-service.js";
import type { PlatformAdminService } from "./platform-admin-service.js";

const idParamsSchema = z.object({ id: z.uuid() }).strict();
const schoolParamsSchema = z.object({ schoolId: z.uuid() }).strict();
const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  search: z.string().trim().min(1).max(100).optional(),
});
const schoolListQuerySchema = pageQuerySchema.extend({
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional(),
});
const planListQuerySchema = pageQuerySchema.extend({
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
const createSchoolSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactEmail: z.email().max(320).optional(),
    contactPhone: z.string().trim().min(7).max(40).optional(),
  })
  .strict();
const updateSchoolSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    contactEmail: z.email().max(320).nullable().optional(),
    contactPhone: z.string().trim().min(7).max(40).nullable().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "Provide at least one field to update.");
const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]) }).strict();
const entitlementSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/),
    z.union([z.boolean(), z.number().finite().nonnegative(), z.string().max(250)]),
  )
  .refine((value) => Object.keys(value).length <= 100, "At most 100 entitlements are allowed.");
const createPlanSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,79}$/),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    entitlements: entitlementSchema,
  })
  .strict();
const updatePlanSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,79}$/)
      .optional(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    entitlements: entitlementSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "Provide at least one field to update.");
const assignPlanSchema = z.object({ planId: z.uuid() }).strict();
const mfaEnrollmentSchema = z.object({ password: z.string().min(1).max(1024) }).strict();
const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export function createPlatformAdminRouter(
  service: PlatformAdminService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    next();
  });
  const authenticate = requireAuthentication(authService, config);
  const platformAdmin = requirePlatformAdmin(authService);
  const protectedRoute = [authenticate, platformAdmin];
  const writeRoute = [authenticate, requireCsrf(config), platformAdmin];

  router.post(
    "/platform/mfa/enrollment",
    authenticate,
    requireCsrf(config),
    validateRequest({ body: mfaEnrollmentSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const body = mfaEnrollmentSchema.parse(request.body);
      const result = await service.startTotpEnrollment({
        userId: auth.user.id,
        email: auth.user.email,
        password: body.password,
        requestId: requestId(response),
      });
      response.setHeader("Cache-Control", "no-store");
      response.status(201).json({ data: result });
    }),
  );

  router.get(
    "/platform/mfa/status",
    authenticate,
    endpoint(async (_request, response) => {
      const auth = authenticated(response);
      response.json({ data: await service.getTotpStatus(auth.user.id, auth.mfaVerifiedAt) });
    }),
  );

  router.post(
    "/platform/mfa/enrollment/confirm",
    authenticate,
    requireCsrf(config),
    validateRequest({ body: mfaCodeSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      await service.completeTotpEnrollment({
        userId: auth.user.id,
        sessionId: auth.sessionId,
        code: mfaCodeSchema.parse(request.body).code,
        requestId: requestId(response),
        address: request.ip || "unknown",
      });
      response.status(204).end();
    }),
  );

  router.post(
    "/platform/mfa/verify",
    authenticate,
    requireCsrf(config),
    validateRequest({ body: mfaCodeSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      await service.verifyTotp({
        userId: auth.user.id,
        sessionId: auth.sessionId,
        code: mfaCodeSchema.parse(request.body).code,
        requestId: requestId(response),
        address: request.ip || "unknown",
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/platform/summary",
    ...protectedRoute,
    endpoint(async (_request, response) => {
      response.json({ data: await service.getSummary() });
    }),
  );

  router.get(
    "/platform/schools",
    ...protectedRoute,
    validateRequest({ query: schoolListQuerySchema }),
    endpoint(async (request, response) => {
      const query = schoolListQuerySchema.parse(request.query);
      const page = await service.listSchools(query);
      response.json({
        data: page.items,
        meta: { limit: query.limit, offset: query.offset, total: page.total },
      });
    }),
  );

  router.post(
    "/platform/schools",
    ...writeRoute,
    validateRequest({ body: createSchoolSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const school = await service.createSchool({
        ...createSchoolSchema.parse(request.body),
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.status(201).json({ data: school });
    }),
  );

  router.get(
    "/platform/schools/:schoolId",
    ...protectedRoute,
    validateRequest({ params: schoolParamsSchema }),
    endpoint(async (request, response) => {
      response.json({ data: await service.getSchool(schoolId(request)) });
    }),
  );

  router.patch(
    "/platform/schools/:schoolId",
    ...writeRoute,
    validateRequest({ params: schoolParamsSchema, body: updateSchoolSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const school = await service.updateSchool({
        ...updateSchoolSchema.parse(request.body),
        schoolId: schoolId(request),
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.json({ data: school });
    }),
  );

  router.patch(
    "/platform/schools/:schoolId/status",
    ...writeRoute,
    validateRequest({ params: schoolParamsSchema, body: statusSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const body = statusSchema.parse(request.body);
      const school = await service.changeSchoolStatus({
        schoolId: schoolId(request),
        status: body.status,
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.json({ data: school });
    }),
  );

  router.get(
    "/platform/plans",
    ...protectedRoute,
    validateRequest({ query: planListQuerySchema }),
    endpoint(async (request, response) => {
      const query = planListQuerySchema.parse(request.query);
      const page = await service.listPlans(query);
      response.json({
        data: page.items,
        meta: { limit: query.limit, offset: query.offset, total: page.total },
      });
    }),
  );

  router.post(
    "/platform/plans",
    ...writeRoute,
    validateRequest({ body: createPlanSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const plan = await service.createPlan({
        ...createPlanSchema.parse(request.body),
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.status(201).json({ data: plan });
    }),
  );

  router.get(
    "/platform/plans/:id",
    ...protectedRoute,
    validateRequest({ params: idParamsSchema }),
    endpoint(async (request, response) => {
      response.json({ data: await service.getPlan(planId(request)) });
    }),
  );

  router.patch(
    "/platform/plans/:id",
    ...writeRoute,
    validateRequest({ params: idParamsSchema, body: updatePlanSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const plan = await service.updatePlan({
        ...updatePlanSchema.parse(request.body),
        planId: planId(request),
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.json({ data: plan });
    }),
  );

  router.get(
    "/platform/schools/:schoolId/subscriptions",
    ...protectedRoute,
    validateRequest({ params: schoolParamsSchema, query: pageQuerySchema }),
    endpoint(async (request, response) => {
      const query = pageQuerySchema.parse(request.query);
      const page = await service.listSubscriptions(schoolId(request), query);
      response.json({
        data: page.items,
        meta: { limit: query.limit, offset: query.offset, total: page.total },
      });
    }),
  );

  router.put(
    "/platform/schools/:schoolId/subscription",
    ...writeRoute,
    validateRequest({ params: schoolParamsSchema, body: assignPlanSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      const subscription = await service.assignPlan({
        schoolId: schoolId(request),
        planId: assignPlanSchema.parse(request.body).planId,
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.json({ data: subscription });
    }),
  );

  router.post(
    "/platform/schools/:schoolId/subscription/end",
    ...writeRoute,
    validateRequest({ params: schoolParamsSchema }),
    endpoint(async (request, response) => {
      const auth = authenticated(response);
      await service.endSubscription({
        schoolId: schoolId(request),
        actorUserId: auth.user.id,
        requestId: requestId(response),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/platform/audit-events",
    ...protectedRoute,
    validateRequest({ query: pageQuerySchema }),
    endpoint(async (request, response) => {
      const query = pageQuerySchema.parse(request.query);
      const page = await service.listAuditEvents(query);
      response.json({
        data: page.items,
        meta: { limit: query.limit, offset: query.offset, total: page.total },
      });
    }),
  );

  return router;
}

type AsyncHandler = (request: Request, response: Response) => Promise<void>;

function endpoint(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function authenticated(response: Response) {
  const auth = response.locals.auth;
  if (!auth) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return auth;
}

function schoolId(request: Request): string {
  const value = request.params["schoolId"];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_SCHOOL", "Invalid school ID.");
  return value;
}

function planId(request: Request): string {
  const value = request.params["id"];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_PLAN", "Invalid plan ID.");
  return value;
}

function requestId(response: Response): string {
  return response.getHeader("x-request-id")?.toString() ?? "unknown";
}
