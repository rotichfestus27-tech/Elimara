import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export type RequestSchemas = {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
};

export type ValidatedRequest = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
};

declare global {
  namespace Express {
    interface Locals {
      validatedRequest?: ValidatedRequest;
    }
  }
}

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return async (request, response, next) => {
    try {
      response.locals.validatedRequest = {
        ...(schemas.params ? { params: await schemas.params.parseAsync(request.params) } : {}),
        ...(schemas.query ? { query: await schemas.query.parseAsync(request.query) } : {}),
        ...(schemas.body ? { body: await schemas.body.parseAsync(request.body) } : {}),
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
