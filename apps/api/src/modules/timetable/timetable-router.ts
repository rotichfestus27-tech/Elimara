import { Router, type Request, type RequestHandler, type Response } from "express";
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
import type { TimetableService } from "./timetable-service.js";

const permissions = {
  read: "timetable.read",
  manage: "timetable.manage",
  publish: "timetable.publish",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const staffParams = schoolParams.extend({ staffId: z.uuid() }).strict();
const yearParams = schoolParams.extend({ academicYearId: z.uuid() }).strict();
const timetableParams = schoolParams.extend({ timetableId: z.uuid() }).strict();
const lessonParams = timetableParams.extend({ lessonId: z.uuid() }).strict();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm time.");
const weekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
const periodBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    position: z.number().int().min(1).max(100),
    startsAt: timeSchema,
    endsAt: timeSchema,
  })
  .strict()
  .refine((period) => period.startsAt < period.endsAt, {
    message: "endsAt must be after startsAt.",
    path: ["endsAt"],
  });
const roomBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    capacity: z.number().int().min(1).max(100_000),
  })
  .strict();
const availabilityBody = z
  .object({
    weekday: weekdaySchema,
    startsAt: timeSchema,
    endsAt: timeSchema,
  })
  .strict()
  .refine((window) => window.startsAt < window.endsAt, {
    message: "endsAt must be after startsAt.",
    path: ["endsAt"],
  });
const timetableBody = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();
const timetableLessonBody = z
  .object({
    classId: z.uuid(),
    streamId: z.uuid().optional(),
    classSubjectAssignmentId: z.uuid(),
    staffId: z.uuid(),
    roomId: z.uuid().optional(),
    weekday: weekdaySchema,
    startPeriodId: z.uuid(),
    endPeriodId: z.uuid(),
  })
  .strict();

export function createTimetableRouter(
  service: TimetableService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/timetable-periods",
    authenticate,
    validateRequest({ params: schoolParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const periods = await service.listPeriods(schoolId(request));
      response.json({ data: periods.map(serializeTimes) });
    }),
  );

  router.post(
    "/schools/:schoolId/timetable-periods",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: periodBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.createPeriod({
        ...context(request, response),
        ...periodBody.parse(request.body),
      });
      response.status(201).json({ data: serializeTimes(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/rooms",
    authenticate,
    validateRequest({ params: schoolParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const rooms = await service.listRooms(schoolId(request));
      response.json({ data: rooms.map(serializeTimestamps) });
    }),
  );

  router.post(
    "/schools/:schoolId/rooms",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: roomBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.createRoom({
        ...context(request, response),
        ...roomBody.parse(request.body),
      });
      response.status(201).json({ data: serializeTimestamps(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/staff/:staffId/availability",
    authenticate,
    validateRequest({ params: staffParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const windows = await service.listAvailability(schoolId(request), id(request, "staffId"));
      response.json({ data: windows.map(serializeTimes) });
    }),
  );

  router.post(
    "/schools/:schoolId/staff/:staffId/availability",
    authenticate,
    csrf,
    validateRequest({ params: staffParams, body: availabilityBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.addAvailability({
        ...context(request, response),
        staffId: id(request, "staffId"),
        ...availabilityBody.parse(request.body),
      });
      response.status(201).json({ data: serializeTimes(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/academic-years/:academicYearId/timetables",
    authenticate,
    validateRequest({ params: yearParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const timetables = await service.listTimetables(
        schoolId(request),
        id(request, "academicYearId"),
      );
      response.json({ data: timetables.map(serializeTimestamps) });
    }),
  );

  router.post(
    "/schools/:schoolId/academic-years/:academicYearId/timetables",
    authenticate,
    csrf,
    validateRequest({ params: yearParams, body: timetableBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.createTimetable({
        ...context(request, response),
        academicYearId: id(request, "academicYearId"),
        ...timetableBody.parse(request.body),
      });
      response.status(201).json({ data: serializeTimestamps(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/timetables/:timetableId/lessons",
    authenticate,
    validateRequest({ params: timetableParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const lessons = await service.listLessons(schoolId(request), id(request, "timetableId"));
      response.json({ data: lessons.map(serializeTimestamps) });
    }),
  );

  router.post(
    "/schools/:schoolId/timetables/:timetableId/lessons",
    authenticate,
    csrf,
    validateRequest({ params: timetableParams, body: timetableLessonBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.createLesson({
        ...context(request, response),
        timetableId: id(request, "timetableId"),
        ...timetableLessonBody.parse(request.body),
      });
      response.status(201).json({ data: serializeTimestamps(result) });
    }),
  );

  router.patch(
    "/schools/:schoolId/timetables/:timetableId/lessons/:lessonId",
    authenticate,
    csrf,
    validateRequest({ params: lessonParams, body: timetableLessonBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.updateLesson({
        ...context(request, response),
        lessonId: id(request, "lessonId"),
        ...timetableLessonBody.parse(request.body),
      });
      response.json({ data: serializeTimestamps(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/timetables/:timetableId/publish",
    authenticate,
    csrf,
    validateRequest({ params: timetableParams }),
    requireSchoolPermission(authService, permissions.publish),
    route(async (request, response) => {
      const result = await service.publish({
        ...context(request, response),
        timetableId: id(request, "timetableId"),
      });
      response.json({ data: serializeTimestamps(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/timetables/:timetableId/unpublish",
    authenticate,
    csrf,
    validateRequest({ params: timetableParams }),
    requireSchoolPermission(authService, permissions.publish),
    route(async (request, response) => {
      const result = await service.unpublish({
        ...context(request, response),
        timetableId: id(request, "timetableId"),
      });
      response.json({ data: serializeTimestamps(result) });
    }),
  );

  return router;
}

function serializeTimes<T extends { startsAt: string; endsAt: string }>(record: T) {
  return { ...record };
}

function serializeTimestamps<
  T extends { createdAt: Date; updatedAt?: Date; publishedAt?: Date | null },
>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    ...(record.updatedAt ? { updatedAt: record.updatedAt.toISOString() } : {}),
    ...("publishedAt" in record ? { publishedAt: record.publishedAt?.toISOString() ?? null } : {}),
  };
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
