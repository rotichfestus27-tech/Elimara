import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import type { AssessmentRecord } from "@elimara/database";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import type { AuthService } from "../identity/auth-service.js";
import {
  requireAuthentication,
  requireCsrf,
  requireSchoolPermission,
} from "../identity/auth-middleware.js";
import type { AssessmentService } from "./assessment-service.js";

const permissions = {
  read: "assessments.read",
  manage: "assessments.manage",
  enter: "results.enter",
  correct: "results.correct",
  moderate: "results.moderate",
  finalize: "results.finalize",
  publish: "results.publish",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const assessmentParams = schoolParams.extend({ assessmentId: z.uuid() }).strict();
const studentParams = schoolParams.extend({ studentId: z.uuid() }).strict();
const scaleParams = schoolParams.extend({ gradingScaleId: z.uuid() }).strict();
const resultParams = assessmentParams.extend({ studentId: z.uuid() }).strict();
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
const scaleQuery = z.object({}).strict();
const assessmentQuery = pageSchema
  .extend({
    academicYearId: z.uuid().optional(),
    termId: z.uuid().optional(),
    classId: z.uuid().optional(),
    status: z.enum(["DRAFT", "OPEN", "MODERATION", "FINALIZED", "PUBLISHED"]).optional(),
  })
  .strict();
const reportQuery = z.object({ academicYearId: z.uuid(), termId: z.uuid() }).strict();
const summaryQuery = reportQuery.extend({ classId: z.uuid().optional() }).strict();
const decimalScore = z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/);
const percentBound = z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/);
const bandBody = z
  .object({
    code: z.string().trim().min(1).max(24),
    label: z.string().trim().min(1).max(100),
    lowerPercent: percentBound,
    upperPercent: percentBound,
  })
  .strict();
const gradingScaleBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    bands: z.array(bandBody).min(2).max(30),
  })
  .strict();
const assessmentBody = z
  .object({
    academicYearId: z.uuid(),
    termId: z.uuid(),
    classId: z.uuid(),
    streamId: z.uuid().optional(),
    classSubjectAssignmentId: z.uuid(),
    gradingScaleId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    maximumScore: decimalScore,
  })
  .strict()
  .refine((assessment) => assessment.startsOn <= assessment.endsOn, {
    message: "endsOn must be on or after startsOn.",
    path: ["endsOn"],
  });
const enterResultsBody = z
  .object({
    results: z
      .array(z.object({ studentId: z.uuid(), score: decimalScore }).strict())
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (body) => new Set(body.results.map((result) => result.studentId)).size === body.results.length,
    {
      message: "Each student can appear only once in a submission.",
      path: ["results"],
    },
  );
const correctResultBody = z.object({ score: decimalScore }).strict();

export function createAssessmentRouter(
  service: AssessmentService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/grading-scales",
    authenticate,
    validateRequest({ params: schoolParams, query: scaleQuery }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const items = await service.listGradingScales(schoolId(request));
      response.json({ data: items.map(serializeScale) });
    }),
  );

  router.post(
    "/schools/:schoolId/grading-scales",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: gradingScaleBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const item = await service.createGradingScale({
        ...context(request, response),
        ...gradingScaleBody.parse(request.body),
      });
      response.status(201).json({ data: serializeScale(item) });
    }),
  );

  router.post(
    "/schools/:schoolId/grading-scales/:gradingScaleId/deactivate",
    authenticate,
    csrf,
    validateRequest({ params: scaleParams }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      await service.deactivateGradingScale({
        ...context(request, response),
        gradingScaleId: id(request, "gradingScaleId"),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/assessments",
    authenticate,
    validateRequest({ params: schoolParams, query: assessmentQuery }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const query = assessmentQuery.parse(request.query);
      const result = await service.listAssessments(schoolId(request), query);
      response.json({
        data: result.items.map(serializeAssessment),
        meta: { limit: query.limit, offset: query.offset, total: result.total },
      });
    }),
  );

  router.post(
    "/schools/:schoolId/assessments",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: assessmentBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const item = await service.createAssessment({
        ...context(request, response),
        ...assessmentBody.parse(request.body),
      });
      response.status(201).json({ data: serializeAssessment(item) });
    }),
  );

  router.get(
    "/schools/:schoolId/assessments/:assessmentId",
    authenticate,
    validateRequest({ params: assessmentParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const item = await service.getAssessment(schoolId(request), id(request, "assessmentId"));
      response.json({ data: serializeAssessment(item) });
    }),
  );

  router.patch(
    "/schools/:schoolId/assessments/:assessmentId",
    authenticate,
    csrf,
    validateRequest({ params: assessmentParams, body: assessmentBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const item = await service.updateDraftAssessment({
        ...context(request, response),
        assessmentId: id(request, "assessmentId"),
        ...assessmentBody.parse(request.body),
      });
      response.json({ data: serializeAssessment(item) });
    }),
  );

  addTransitionRoute(router, {
    path: "/schools/:schoolId/assessments/:assessmentId/open",
    permission: permissions.manage,
    serviceMethod: (service, input) => service.openAssessment(input),
    service,
    authenticate,
    csrf,
    authService,
    params: assessmentParams,
  });
  addTransitionRoute(router, {
    path: "/schools/:schoolId/assessments/:assessmentId/submit-for-moderation",
    permission: permissions.moderate,
    serviceMethod: (service, input) => service.submitForModeration(input),
    service,
    authenticate,
    csrf,
    authService,
    params: assessmentParams,
  });
  addTransitionRoute(router, {
    path: "/schools/:schoolId/assessments/:assessmentId/finalize",
    permission: permissions.finalize,
    serviceMethod: (service, input) => service.finalizeAssessment(input),
    service,
    authenticate,
    csrf,
    authService,
    params: assessmentParams,
  });
  addTransitionRoute(router, {
    path: "/schools/:schoolId/assessments/:assessmentId/publish",
    permission: permissions.publish,
    serviceMethod: (service, input) => service.publishAssessment(input),
    service,
    authenticate,
    csrf,
    authService,
    params: assessmentParams,
  });
  addTransitionRoute(router, {
    path: "/schools/:schoolId/assessments/:assessmentId/reopen-for-correction",
    permission: permissions.correct,
    serviceMethod: (service, input) => service.reopenAssessment(input),
    service,
    authenticate,
    csrf,
    authService,
    params: assessmentParams,
  });

  router.get(
    "/schools/:schoolId/assessments/:assessmentId/marks",
    authenticate,
    validateRequest({ params: assessmentParams, query: pageSchema }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const query = pageSchema.parse(request.query);
      const result = await service.listResults(
        schoolId(request),
        id(request, "assessmentId"),
        query,
      );
      response.json({
        data: result.items.map(serializeResult),
        meta: {
          limit: query.limit,
          offset: query.offset,
          total: result.total,
          missingCount: result.missingCount,
        },
      });
    }),
  );

  router.post(
    "/schools/:schoolId/assessments/:assessmentId/marks",
    authenticate,
    csrf,
    validateRequest({ params: assessmentParams, body: enterResultsBody }),
    requireSchoolPermission(authService, permissions.enter),
    route(async (request, response) => {
      const body = enterResultsBody.parse(request.body);
      const results = await service.enterResults({
        ...context(request, response),
        assessmentId: id(request, "assessmentId"),
        ...body,
      });
      response.status(201).json({ data: results.map(serializeResult) });
    }),
  );

  router.patch(
    "/schools/:schoolId/assessments/:assessmentId/marks/:studentId",
    authenticate,
    csrf,
    validateRequest({ params: resultParams, body: correctResultBody }),
    requireSchoolPermission(authService, permissions.correct),
    route(async (request, response) => {
      const result = await service.correctResult({
        ...context(request, response),
        assessmentId: id(request, "assessmentId"),
        studentId: id(request, "studentId"),
        ...correctResultBody.parse(request.body),
      });
      response.json({ data: serializeResult(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/students/:studentId/report-card",
    authenticate,
    validateRequest({ params: studentParams, query: reportQuery }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const query = reportQuery.parse(request.query);
      const items = await service.reportCard(schoolId(request), id(request, "studentId"), query);
      response.json({ data: items.map(serializeReportItem) });
    }),
  );

  router.get(
    "/schools/:schoolId/academic-summary",
    authenticate,
    validateRequest({ params: schoolParams, query: summaryQuery }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const summary = await service.academicSummary(
        schoolId(request),
        summaryQuery.parse(request.query),
      );
      response.json({ data: summary });
    }),
  );

  return router;
}

function addTransitionRoute(
  router: Router,
  options: {
    path: string;
    permission: string;
    service: AssessmentService;
    serviceMethod: (
      service: AssessmentService,
      input: ReturnType<typeof context> & { assessmentId: string },
    ) => Promise<AssessmentRecord>;
    authenticate: RequestHandler;
    csrf: RequestHandler;
    authService: AuthService;
    params: typeof assessmentParams;
  },
) {
  router.post(
    options.path,
    options.authenticate,
    options.csrf,
    validateRequest({ params: options.params }),
    requireSchoolPermission(options.authService, options.permission),
    route(async (request, response) => {
      const result = await options.serviceMethod(options.service, {
        ...context(request, response),
        assessmentId: id(request, "assessmentId"),
      });
      response.json({ data: serializeAssessment(result) });
    }),
  );
}

function serializeAssessment(value: AssessmentRecord) {
  return {
    ...value,
    startsOn: dateString(value.startsOn),
    endsOn: dateString(value.endsOn),
    createdAt: timestampString(value.createdAt),
    updatedAt: timestampString(value.updatedAt),
  };
}

function serializeScale(
  value: Awaited<ReturnType<AssessmentService["listGradingScales"]>>[number],
) {
  return { ...value, createdAt: value.createdAt.toISOString() };
}

function serializeResult(
  value: Awaited<ReturnType<AssessmentService["listResults"]>>["items"][number],
) {
  return {
    ...value,
    enteredAt: value.enteredAt?.toISOString() ?? null,
    updatedAt: value.updatedAt.toISOString(),
  };
}

function serializeReportItem(value: Awaited<ReturnType<AssessmentService["reportCard"]>>[number]) {
  return { ...value, startsOn: value.startsOn.toISOString().slice(0, 10) };
}

function dateString(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function timestampString(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
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

function id(request: Request, key: string): string {
  const value = request.params[key];
  if (typeof value !== "string") throw new ApiError(400, "INVALID_ID", "A record ID is required.");
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
