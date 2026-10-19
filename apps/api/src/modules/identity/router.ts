import { type RequestHandler, Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { validateRequest } from "../../http/middleware/validate-request.js";
import {
  requireAuthentication,
  requireCsrf,
  requirePlatformAdmin,
  requireSchoolMembership,
} from "./auth-middleware.js";
import type { AuthService } from "./auth-service.js";
import { clearSessionCookies, setSessionCookies } from "./session-cookies.js";

const loginBodySchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});

const resetRequestBodySchema = z.object({ email: z.email().max(320) });

const resetCompleteBodySchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: z.string().min(12).max(1024),
});

const schoolParamsSchema = z.object({ schoolId: z.uuid() });

export function createIdentityRouter(service: AuthService, config: AppConfig): Router {
  const router = Router();
  const authenticate = requireAuthentication(service, config);

  router.post(
    "/auth/login",
    validateLoginRequest(config),
    validateRequest({ body: loginBodySchema }),
    async (request, response, next) => {
      try {
        const validated = loginBodySchema.parse(request.body);
        const result = await service.login(
          validated.email,
          validated.password,
          request.ip || "unknown",
          response.getHeader("x-request-id")?.toString() ?? "unknown",
        );
        setSessionCookies(response, config, result.sessionToken, result.csrfToken);
        response.status(200).json({ data: { user: result.user } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/auth/logout",
    authenticate,
    requireCsrf(config),
    async (_request, response, next) => {
      try {
        const auth = response.locals.auth;
        const token = _request.cookies?.[config.SESSION_COOKIE_NAME];
        if (!auth || typeof token !== "string") {
          throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
        }
        await service.logout(
          token,
          auth.user.id,
          response.getHeader("x-request-id")?.toString() ?? "unknown",
        );
        clearSessionCookies(response, config);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/auth/me", authenticate, (_request, response) => {
    response.json({ data: { user: response.locals.auth?.user } });
  });

  router.post(
    "/auth/password-reset/request",
    validateRequest({ body: resetRequestBodySchema }),
    async (request, response, next) => {
      try {
        const body = resetRequestBodySchema.parse(request.body);
        await service.requestPasswordReset(
          body.email,
          request.ip || "unknown",
          response.getHeader("x-request-id")?.toString() ?? "unknown",
        );
        response.status(202).json({
          data: { message: "If the account is eligible, recovery instructions will be sent." },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/auth/password-reset/complete",
    validateRequest({ body: resetCompleteBodySchema }),
    async (_request, response, next) => {
      try {
        const body = resetCompleteBodySchema.parse(_request.body);
        await service.completePasswordReset(
          body.token,
          body.newPassword,
          response.getHeader("x-request-id")?.toString() ?? "unknown",
        );
        clearSessionCookies(response, config);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/schools/:schoolId/access",
    authenticate,
    validateRequest({ params: schoolParamsSchema }),
    requireSchoolMembership(service),
    (_request, response) => {
      const access = response.locals.schoolAccess;
      if (!access)
        throw new ApiError(500, "INTERNAL_ERROR", "School access context is unavailable.");
      response.json({ data: { school: access } });
    },
  );

  router.get(
    "/platform/access",
    authenticate,
    requirePlatformAdmin(service),
    (_request, response) => {
      response.json({ data: { access: "platform" } });
    },
  );

  return router;
}

function validateLoginRequest(config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get("origin");
    const fetchSite = request.get("sec-fetch-site");
    const mediaType = request.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();

    if (origin && !config.CORS_ORIGINS.includes(origin)) {
      next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed."));
      return;
    }
    if (!origin && fetchSite === "cross-site") {
      next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed."));
      return;
    }
    if (mediaType !== "application/json") {
      next(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Login requests must use JSON."));
      return;
    }
    next();
  };
}
