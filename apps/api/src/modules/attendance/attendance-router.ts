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
import type { AttendanceService } from "./attendance-service.js";

const permissions = {
  read: "attendance.register.read",
  manage: "attendance.register.manage",
  correct: "attendance.register.correct",
} as const;

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const reasonParams = schoolParams.extend({ reasonId: z.uuid() }).strict();
const registerParams = schoolParams.extend({ registerId: z.uuid() }).strict();
const recordParams = registerParams.extend({ recordId: z.uuid() }).strict();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm time.");
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
const registerQuery = pageSchema
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    type: z.enum(["STUDENT_DAILY", "STUDENT_LESSON", "STAFF_DAILY"]).optional(),
    classId: z.uuid().optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from must be on or before to.",
    path: ["to"],
  });
const summaryQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    type: z.enum(["STUDENT_DAILY", "STUDENT_LESSON", "STAFF_DAILY"]).optional(),
    classId: z.uuid().optional(),
  })
  .strict()
  .refine((query) => query.from <= query.to, {
    message: "from must be on or before to.",
    path: ["to"],
  })
  .refine(
    (query) => {
      const days =
        (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000;
      return days <= 365;
    },
    {
      message: "Date ranges cannot exceed 366 calendar days.",
      path: ["to"],
    },
  );
const reasonBody = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const registerBody = z
  .object({
    academicYearId: z.uuid(),
    date: z.iso.date(),
    type: z.enum(["STUDENT_DAILY", "STUDENT_LESSON", "STAFF_DAILY"]),
    classId: z.uuid().optional(),
    streamId: z.uuid().optional(),
    timetableLessonId: z.uuid().optional(),
  })
  .strict();
const attendanceDataFields = {
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EARLY_DEPARTURE"]),
  reasonId: z.uuid().nullable().optional(),
  arrivalAt: timeSchema.nullable().optional(),
  departureAt: timeSchema.nullable().optional(),
};
type AttendanceStatusInput = {
  status: "PRESENT" | "ABSENT" | "LATE" | "EARLY_DEPARTURE";
  arrivalAt?: string | null;
  departureAt?: string | null;
};
function refineAttendanceStatus(record: AttendanceStatusInput, context: z.RefinementCtx) {
  if (record.status === "LATE" && !record.arrivalAt) {
    context.addIssue({
      code: "custom",
      path: ["arrivalAt"],
      message: "arrivalAt is required for LATE.",
    });
  }
  if (record.status !== "LATE" && record.arrivalAt) {
    context.addIssue({
      code: "custom",
      path: ["arrivalAt"],
      message: "arrivalAt is only valid for LATE.",
    });
  }
  if (record.status === "EARLY_DEPARTURE" && !record.departureAt) {
    context.addIssue({
      code: "custom",
      path: ["departureAt"],
      message: "departureAt is required for EARLY_DEPARTURE.",
    });
  }
  if (record.status !== "EARLY_DEPARTURE" && record.departureAt) {
    context.addIssue({
      code: "custom",
      path: ["departureAt"],
      message: "departureAt is only valid for EARLY_DEPARTURE.",
    });
  }
}
const attendanceRecordBody = z
  .object({
    studentId: z.uuid().optional(),
    staffId: z.uuid().optional(),
    ...attendanceDataFields,
  })
  .strict()
  .refine((record) => Boolean(record.studentId) !== Boolean(record.staffId), {
    message: "Provide exactly one studentId or staffId.",
  })
  .superRefine(refineAttendanceStatus);
const attendanceCorrectionBody = z
  .object(attendanceDataFields)
  .strict()
  .superRefine(refineAttendanceStatus);

export function createAttendanceRouter(
  service: AttendanceService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/attendance/reasons",
    authenticate,
    validateRequest({ params: schoolParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const reasons = await service.listReasons(schoolId(request));
      response.json({ data: reasons.map(serializeTimestamps) });
    }),
  );

  router.post(
    "/schools/:schoolId/attendance/reasons",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: reasonBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.createReason({
        ...context(request, response),
        ...reasonBody.parse(request.body),
      });
      response.status(201).json({ data: serializeTimestamps(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/attendance/reasons/:reasonId/deactivate",
    authenticate,
    csrf,
    validateRequest({ params: reasonParams }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      await service.deactivateReason({
        ...context(request, response),
        reasonId: id(request, "reasonId"),
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/schools/:schoolId/attendance/summary",
    authenticate,
    validateRequest({ params: schoolParams, query: summaryQuery }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const query = summaryQuery.parse(request.query);
      response.json({
        data: await service.summary(schoolId(request), {
          from: query.from,
          to: query.to,
          ...(query.type ? { type: query.type } : {}),
          ...(query.classId ? { classId: query.classId } : {}),
        }),
      });
    }),
  );

  router.get(
    "/schools/:schoolId/attendance/registers",
    authenticate,
    validateRequest({ params: schoolParams, query: registerQuery }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const query = registerQuery.parse(request.query);
      const result = await service.listRegisters(schoolId(request), query);
      response.json({
        data: result.items.map(serializeRegister),
        meta: { limit: query.limit, offset: query.offset, total: result.total },
      });
    }),
  );

  router.post(
    "/schools/:schoolId/attendance/registers",
    authenticate,
    csrf,
    validateRequest({ params: schoolParams, body: registerBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.createRegister({
        ...context(request, response),
        ...registerBody.parse(request.body),
      });
      response.status(201).json({ data: serializeRegister(result) });
    }),
  );

  router.get(
    "/schools/:schoolId/attendance/registers/:registerId/records",
    authenticate,
    validateRequest({ params: registerParams }),
    requireSchoolPermission(authService, permissions.read),
    route(async (request, response) => {
      const result = await service.listRecords(schoolId(request), id(request, "registerId"));
      response.json({ data: result.map(serializeAttendanceRecord) });
    }),
  );

  router.post(
    "/schools/:schoolId/attendance/registers/:registerId/records",
    authenticate,
    csrf,
    validateRequest({ params: registerParams, body: attendanceRecordBody }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.record({
        ...context(request, response),
        registerId: id(request, "registerId"),
        ...attendanceRecordBody.parse(request.body),
      });
      response.status(201).json({ data: serializeAttendanceRecord(result) });
    }),
  );

  router.patch(
    "/schools/:schoolId/attendance/registers/:registerId/records/:recordId",
    authenticate,
    csrf,
    validateRequest({ params: recordParams, body: attendanceCorrectionBody }),
    requireSchoolPermission(authService, permissions.correct),
    route(async (request, response) => {
      const result = await service.correct({
        ...context(request, response),
        registerId: id(request, "registerId"),
        recordId: id(request, "recordId"),
        ...attendanceCorrectionBody.parse(request.body),
      });
      response.json({ data: serializeAttendanceRecord(result) });
    }),
  );

  router.post(
    "/schools/:schoolId/attendance/registers/:registerId/finalize",
    authenticate,
    csrf,
    validateRequest({ params: registerParams }),
    requireSchoolPermission(authService, permissions.manage),
    route(async (request, response) => {
      const result = await service.finalize({
        ...context(request, response),
        registerId: id(request, "registerId"),
      });
      response.json({ data: serializeRegister(result) });
    }),
  );

  return router;
}

function serializeTimestamps<T extends { createdAt: Date; updatedAt?: Date }>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    ...(record.updatedAt ? { updatedAt: record.updatedAt.toISOString() } : {}),
  };
}

function serializeRegister<T extends { date: Date; createdAt: Date }>(record: T) {
  return {
    ...record,
    date: record.date.toISOString().slice(0, 10),
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeAttendanceRecord<
  T extends { arrivalAt: Date | null; departureAt: Date | null; markedAt: Date; updatedAt: Date },
>(record: T) {
  return {
    ...record,
    arrivalAt: record.arrivalAt?.toISOString().slice(11, 16) ?? null,
    departureAt: record.departureAt?.toISOString().slice(11, 16) ?? null,
    markedAt: record.markedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
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
