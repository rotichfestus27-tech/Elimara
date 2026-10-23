import { resolve } from "node:path";
import {
  createDatabaseClient,
  PrismaAdmissionsStore,
  PrismaAssessmentStore,
  PrismaFinanceStore,
  PrismaIdentityStore,
  PrismaLibraryStore,
  PrismaNotificationStore,
  PrismaPlatformAdminStore,
  PrismaSchoolConfigurationStore,
  PrismaSchoolOperationsStore,
  PrismaStaffStore,
} from "@elimara/database";
import dotenv from "dotenv";
import pino from "pino";
import { ZodError } from "zod";
import { createApp } from "./app.js";
import { parseEnvironment } from "./config/env.js";
import { createRequestLogger } from "./http/middleware/request-logger.js";
import { executeWithTimeout } from "./http/utils/timeout.js";
import { AdmissionsService } from "./modules/admissions/admissions-service.js";
import { AssessmentService } from "./modules/assessments/assessment-service.js";
import { AttendanceService } from "./modules/attendance/attendance-service.js";
import { FinanceService } from "./modules/finance/finance-service.js";
import { NotificationService } from "./modules/communication/notification-service.js";
import { NotificationTemplateRegistry } from "./modules/communication/notification-templates.js";
import {
  InAppNotificationProvider,
  NotificationWorker,
} from "./modules/communication/notification-worker.js";
import { ReportsService } from "./modules/reports/reports-service.js";
import { AuthService } from "./modules/identity/auth-service.js";
import { LibraryService } from "./modules/library/library-service.js";
import { PlatformAdminService } from "./modules/platform-admin/platform-admin-service.js";
import { argon2PasswordHasher } from "./modules/identity/password-hasher.js";
import { SchoolConfigurationService } from "./modules/schools/school-configuration-service.js";
import { StaffService } from "./modules/staff/staff-service.js";
import { TimetableService } from "./modules/timetable/timetable-service.js";

async function startServer() {
  dotenv.config();
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });
  const config = parseEnvironment(process.env);
  const logger = pino({ level: config.LOG_LEVEL });
  const database = createDatabaseClient(config.DATABASE_URL);
  const identityStore = new PrismaIdentityStore(database);
  const admissionsStore = new PrismaAdmissionsStore(database);
  const schoolConfigurationStore = new PrismaSchoolConfigurationStore(database);
  const staffStore = new PrismaStaffStore(database);
  const operationsStore = new PrismaSchoolOperationsStore(database);
  const assessmentStore = new PrismaAssessmentStore(database);
  const financeStore = new PrismaFinanceStore(database);
  const notificationStore = new PrismaNotificationStore(database);
  const libraryStore = new PrismaLibraryStore(database);
  const platformAdminStore = new PrismaPlatformAdminStore(database);
  const authService = new AuthService(identityStore, argon2PasswordHasher, config);
  const admissionsService = new AdmissionsService(admissionsStore);
  const schoolConfigurationService = new SchoolConfigurationService(schoolConfigurationStore);
  const staffService = new StaffService(staffStore);
  const attendanceService = new AttendanceService(operationsStore);
  const timetableService = new TimetableService(operationsStore);
  const assessmentService = new AssessmentService(assessmentStore);
  const financeService = new FinanceService(financeStore);
  const notificationService = new NotificationService(
    notificationStore,
    new NotificationTemplateRegistry(),
  );
  const libraryService = new LibraryService(libraryStore);
  const platformAdminService = new PlatformAdminService(
    platformAdminStore,
    identityStore,
    authService,
    config,
  );
  const reportsService = new ReportsService({
    admissions: admissionsService,
    attendance: attendanceService,
    assessments: assessmentService,
    finance: financeService,
    staff: staffService,
  });
  const notificationWorker = new NotificationWorker(
    notificationStore,
    [new InAppNotificationProvider()],
    {
      onError: (errorName) => logger.error({ errorName }, "Notification worker failure"),
    },
  );
  notificationWorker.start();
  const app = createApp(config, {
    checkDatabase: async () => {
      await executeWithTimeout(
        async () => {
          await database.$queryRaw`SELECT 1`;
        },
        config.DATABASE_READY_TIMEOUT_MS,
        "Database readiness check timed out.",
      );
    },
    logger: createRequestLogger(config, logger),
    authService,
    admissionsService,
    schoolConfigurationService,
    staffService,
    attendanceService,
    timetableService,
    assessmentService,
    financeService,
    notificationService,
    reportsService,
    libraryService,
    platformAdminService,
  });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "API listening");
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down");
    await notificationWorker.stop();
    server.close(async (error) => {
      await database.$disconnect();
      if (error) {
        logger.error({ errorName: error.name }, "HTTP server shutdown failed");
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const issues =
    error instanceof ZodError
      ? error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        }))
      : undefined;
  console.error(
    JSON.stringify({ level: "error", errorName, message: "API startup failed", issues }),
  );
  process.exitCode = 1;
});
