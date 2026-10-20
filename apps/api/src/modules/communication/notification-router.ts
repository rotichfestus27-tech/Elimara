import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import type { AppConfig } from "../../config/env.js";
import type { AuthService } from "../identity/auth-service.js";
import {
  requireAuthentication,
  requireCsrf,
  requireSchoolPermission,
} from "../identity/auth-middleware.js";
import type { NotificationService } from "./notification-service.js";

const schoolParams = z.object({ schoolId: z.uuid() }).strict();
const notificationParams = schoolParams.extend({ notificationId: z.uuid() }).strict();
const pageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();

export function createNotificationRouter(
  service: NotificationService,
  authService: AuthService,
  config: AppConfig,
): Router {
  const router = Router();
  const authenticate = requireAuthentication(authService, config);
  const csrf = requireCsrf(config);

  router.get(
    "/schools/:schoolId/notifications",
    authenticate,
    validateRequest({ params: schoolParams, query: pageQuery }),
    requireSchoolPermission(authService, "communication.notifications.read"),
    route(async (request, response) => {
      const query = pageQuery.parse(request.query);
      const result = await service.listInbox(
        schoolId(request),
        authenticatedUserId(response),
        query,
      );
      response.json({
        data: result.items.map(serializeNotification),
        meta: { ...query, total: result.total },
      });
    }),
  );

  router.post(
    "/schools/:schoolId/notifications/:notificationId/read",
    authenticate,
    csrf,
    validateRequest({ params: notificationParams }),
    requireSchoolPermission(authService, "communication.notifications.read"),
    route(async (request, response) => {
      await service.markRead(
        schoolId(request),
        authenticatedUserId(response),
        notificationId(request),
      );
      response.status(204).end();
    }),
  );

  return router;
}

function schoolId(request: Request): string {
  const value = request.params["schoolId"];
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
  }
  return value;
}

function authenticatedUserId(response: Response): string {
  const userId = response.locals.auth?.user.id;
  if (!userId) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
  return userId;
}

function notificationId(request: Request): string {
  const value = request.params["notificationId"];
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_ID", "A notification ID is required.");
  }
  return value;
}

function serializeNotification(notification: {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
}) {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    status: notification.status,
    createdAt: notification.createdAt.toISOString(),
    sentAt: notification.sentAt?.toISOString() ?? null,
    deliveredAt: notification.deliveredAt?.toISOString() ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
