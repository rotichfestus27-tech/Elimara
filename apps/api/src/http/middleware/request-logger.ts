import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import type { AppConfig } from "../../config/env.js";

export function createRequestLogger(config: AppConfig, logger?: Logger) {
  return pinoHttp({
    ...(logger ? { logger } : {}),
    level: config.LOG_LEVEL,
    genReqId: (_request, response) => response.getHeader("x-request-id")?.toString() ?? "unknown",
    serializers: {
      req: (request) => ({
        id: request.id,
        method: request.method,
      }),
      res: (response) => ({
        statusCode: response.statusCode,
      }),
    },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
      remove: true,
    },
    customLogLevel: (_request, response, error) => {
      if (error || response.statusCode >= 500) return "error";
      if (response.statusCode >= 400) return "warn";
      return "info";
    },
  });
}
