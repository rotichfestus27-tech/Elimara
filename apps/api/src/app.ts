import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
  Router,
} from "express";
import helmet from "helmet";
import type { AppConfig } from "./config/env.js";
import { ApiError } from "./http/errors/api-error.js";
import { errorHandler } from "./http/errors/error-handler.js";
import { requestIdMiddleware } from "./http/middleware/request-id.js";
import { createRequestLogger } from "./http/middleware/request-logger.js";
import { executeWithTimeout } from "./http/utils/timeout.js";
import { v1Router } from "./http/v1/router.js";
import { createAdmissionsRouter } from "./modules/admissions/admissions-router.js";
import type { AdmissionsService } from "./modules/admissions/admissions-service.js";
import { createAssessmentRouter } from "./modules/assessments/assessment-router.js";
import type { AssessmentService } from "./modules/assessments/assessment-service.js";
import { createAttendanceRouter } from "./modules/attendance/attendance-router.js";
import type { AttendanceService } from "./modules/attendance/attendance-service.js";
import { createFinanceRouter } from "./modules/finance/finance-router.js";
import type { FinanceService } from "./modules/finance/finance-service.js";
import { createNotificationRouter } from "./modules/communication/notification-router.js";
import type { NotificationService } from "./modules/communication/notification-service.js";
import { createReportsRouter } from "./modules/reports/reports-router.js";
import type { ReportsService } from "./modules/reports/reports-service.js";
import type { AuthService } from "./modules/identity/auth-service.js";
import { createIdentityRouter } from "./modules/identity/router.js";
import { createLibraryRouter } from "./modules/library/library-router.js";
import type { LibraryService } from "./modules/library/library-service.js";
import { createPlatformAdminRouter } from "./modules/platform-admin/platform-admin-router.js";
import type { PlatformAdminService } from "./modules/platform-admin/platform-admin-service.js";
import { createSchoolConfigurationRouter } from "./modules/schools/school-configuration-router.js";
import type { SchoolConfigurationService } from "./modules/schools/school-configuration-service.js";
import { createStaffRouter } from "./modules/staff/staff-router.js";
import type { StaffService } from "./modules/staff/staff-service.js";
import { createTimetableRouter } from "./modules/timetable/timetable-router.js";
import type { TimetableService } from "./modules/timetable/timetable-service.js";

export type AppDependencies = {
  checkDatabase: () => Promise<void>;
  authService?: AuthService;
  admissionsService?: AdmissionsService;
  schoolConfigurationService?: SchoolConfigurationService;
  staffService?: StaffService;
  attendanceService?: AttendanceService;
  timetableService?: TimetableService;
  assessmentService?: AssessmentService;
  financeService?: FinanceService;
  notificationService?: NotificationService;
  reportsService?: ReportsService;
  libraryService?: LibraryService;
  platformAdminService?: PlatformAdminService;
  logger?: RequestHandler;
  errorHandler?: ErrorRequestHandler;
};

export function createApp(config: AppConfig, dependencies: AppDependencies): Express {
  const app = express();
  const apiRouter = Router();

  app.disable("x-powered-by");
  if (config.TRUST_PROXY_HOPS > 0) app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use(requestIdMiddleware);
  app.use(dependencies.logger ?? createRequestLogger(config));
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Request-Id", "X-CSRF-Token", "Idempotency-Key"],
    }),
  );
  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "1mb", parameterLimit: 100 }));
  app.use(cookieParser());

  app.get("/health/live", (_request, response) => {
    response.status(200).json({ data: { status: "live" } });
  });

  app.get("/health/ready", async (_request, response, next) => {
    try {
      await executeWithTimeout(
        () => dependencies.checkDatabase(),
        config.DATABASE_READY_TIMEOUT_MS,
      );
      response.status(200).json({ data: { status: "ready" } });
    } catch (error) {
      next(
        error instanceof ApiError
          ? error
          : new ApiError(503, "SERVICE_NOT_READY", "Service is not ready."),
      );
    }
  });

  apiRouter.use("/v1", v1Router);
  if (dependencies.authService) {
    apiRouter.use("/v1", createIdentityRouter(dependencies.authService, config));
    if (dependencies.admissionsService) {
      apiRouter.use(
        "/v1",
        createAdmissionsRouter(dependencies.admissionsService, dependencies.authService, config),
      );
    }
    if (dependencies.schoolConfigurationService) {
      apiRouter.use(
        "/v1",
        createSchoolConfigurationRouter(
          dependencies.schoolConfigurationService,
          dependencies.authService,
          config,
        ),
      );
    }
    if (dependencies.staffService) {
      apiRouter.use(
        "/v1",
        createStaffRouter(dependencies.staffService, dependencies.authService, config),
      );
    }
    if (dependencies.attendanceService) {
      apiRouter.use(
        "/v1",
        createAttendanceRouter(dependencies.attendanceService, dependencies.authService, config),
      );
    }
    if (dependencies.timetableService) {
      apiRouter.use(
        "/v1",
        createTimetableRouter(dependencies.timetableService, dependencies.authService, config),
      );
    }
    if (dependencies.assessmentService) {
      apiRouter.use(
        "/v1",
        createAssessmentRouter(dependencies.assessmentService, dependencies.authService, config),
      );
    }
    if (dependencies.financeService) {
      apiRouter.use(
        "/v1",
        createFinanceRouter(dependencies.financeService, dependencies.authService, config),
      );
    }
    if (dependencies.notificationService) {
      apiRouter.use(
        "/v1",
        createNotificationRouter(
          dependencies.notificationService,
          dependencies.authService,
          config,
        ),
      );
    }
    if (dependencies.reportsService) {
      apiRouter.use(
        "/v1",
        createReportsRouter(dependencies.reportsService, dependencies.authService, config),
      );
    }
    if (dependencies.libraryService) {
      apiRouter.use(
        "/v1",
        createLibraryRouter(dependencies.libraryService, dependencies.authService, config),
      );
    }
    if (dependencies.platformAdminService) {
      apiRouter.use(
        "/v1",
        createPlatformAdminRouter(dependencies.platformAdminService, dependencies.authService, config),
      );
    }
  }
  app.use("/api", apiRouter);

  app.use((_request, _response, next) => {
    next(new ApiError(404, "NOT_FOUND", "The requested resource was not found."));
  });
  app.use(dependencies.errorHandler ?? errorHandler);

  return app;
}
