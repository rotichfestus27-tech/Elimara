import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { SchoolAccessRecord } from "@elimara/database";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import { assertPermission } from "../authorization/permission-policy.js";
import type { AuthService, AuthenticatedSession } from "./auth-service.js";

declare global {
  namespace Express {
    interface Locals {
      auth?: AuthenticatedSession;
      schoolAccess?: SchoolAccessRecord;
    }
  }
}

export function requireAuthentication(service: AuthService, config: AppConfig): RequestHandler {
  return async (request, response, next) => {
    try {
      const token: unknown = request.cookies?.[config.SESSION_COOKIE_NAME];
      const auth = await service.authenticate(typeof token === "string" ? token : undefined);
      if (!auth) {
        throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
      }
      response.locals.auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCsrf(config: AppConfig): RequestHandler {
  return (request, response, next) => {
    const auth = response.locals.auth;
    const cookieToken: unknown = request.cookies?.[config.CSRF_COOKIE_NAME];
    const headerToken = request.get("x-csrf-token");

    if (
      !auth ||
      typeof cookieToken !== "string" ||
      !headerToken ||
      !constantTimeEqual(cookieToken, headerToken) ||
      !constantTimeEqual(hash(cookieToken), auth.csrfTokenHash)
    ) {
      next(new ApiError(403, "CSRF_VALIDATION_FAILED", "The request could not be verified."));
      return;
    }

    next();
  };
}

export function requireSchoolPermission(service: AuthService, permission: string): RequestHandler {
  return async (request, response, next) => {
    try {
      const auth = response.locals.auth;
      if (!auth) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
      const schoolId = request.params["schoolId"];
      if (typeof schoolId !== "string") {
        throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
      }
      const access = await service.getSchoolAccess(auth.user.id, schoolId);
      assertPermission(access.permissions, permission);
      response.locals.schoolAccess = access;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireSchoolMembership(service: AuthService): RequestHandler {
  return async (request, response, next) => {
    try {
      const auth = response.locals.auth;
      if (!auth) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
      const schoolId = request.params["schoolId"];
      if (typeof schoolId !== "string") {
        throw new ApiError(400, "INVALID_SCHOOL", "A school context is required.");
      }
      response.locals.schoolAccess = await service.getSchoolAccess(auth.user.id, schoolId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePlatformAdmin(service: AuthService): RequestHandler {
  return async (_request, response, next) => {
    try {
      const auth = response.locals.auth;
      if (!auth) throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required.");
      await service.requirePlatformAdmin(auth.user.id, auth.mfaVerifiedAt);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
