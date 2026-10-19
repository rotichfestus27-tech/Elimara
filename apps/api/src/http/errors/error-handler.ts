import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "./api-error.js";

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    issues?: Array<{ path: string; code: string; message: string }>;
  };
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const requestId = response.getHeader("x-request-id")?.toString() ?? "unknown";
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";
  let issues: ErrorBody["error"]["issues"];

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_FAILED";
    message = "The request is invalid.";
    issues = error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      code: issue.code,
      message: issue.message,
    }));
  } else if (isPayloadTooLarge(error)) {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "The request body exceeds the allowed size.";
  } else if (isMalformedJson(error)) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "The request body contains invalid JSON.";
  }

  if (statusCode >= 500) {
    request.log.error(
      { requestId, errorName: error instanceof Error ? error.name : "UnknownError" },
      "Unhandled request error",
    );
  }

  const body: ErrorBody = {
    error: {
      code,
      message,
      requestId,
      ...(issues ? { issues } : {}),
    },
  };

  response.status(statusCode).json(body);
};

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  );
}

function isMalformedJson(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}
