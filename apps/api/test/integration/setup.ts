import { randomUUID } from "node:crypto";
import { PrismaClient } from "@elimara/database";

/**
 * Validates that the provided DATABASE_URL is strictly a non-production,
 * disposable test database. Throws immediately if pointing to any prohibited host,
 * production environment, or lacking a clear test/ci designation.
 */
export function assertSafeTestDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is required to run PostgreSQL integration tests.\n" +
        "Ensure a disposable PostgreSQL database is running with migrations applied.",
    );
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL.");
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  // 1. Prohibit any known production, staging, or hosted domain patterns
  const prohibitedHosts = ["prod", "production", "staging", "elimara.com", "elimara-prod", "live"];

  for (const prohibited of prohibitedHosts) {
    if (hostname.includes(prohibited)) {
      throw new Error(
        `FATAL SAFETY VIOLATION: DATABASE_URL (${hostname}) appears to be a prohibited or production database! Integration tests aborted.`,
      );
    }
  }

  // 2. Allow localhost, 127.0.0.1, or container hostnames, or explicit 'test'/'ci' database names
  const isLocalOrContainer =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "postgres" ||
    hostname === "db";

  const hasTestDesignation =
    pathname.includes("test") ||
    pathname.includes("ci") ||
    url.searchParams.get("schema")?.includes("test");

  if (!isLocalOrContainer && !hasTestDesignation) {
    throw new Error(
      `FATAL SAFETY VIOLATION: DATABASE_URL must target localhost/container or contain 'test'/'ci' in its database name (got '${pathname}'). Integration tests aborted.`,
    );
  }

  return databaseUrl;
}

let prismaClientInstance: PrismaClient | null = null;

export function getTestPrismaClient(): PrismaClient {
  if (!prismaClientInstance) {
    const safeUrl = assertSafeTestDatabase(process.env.DATABASE_URL);
    prismaClientInstance = new PrismaClient({
      datasources: {
        db: {
          url: safeUrl,
        },
      },
    });
  }
  return prismaClientInstance;
}

/**
 * Asserts connectivity to the test database. Provides clear diagnostic guidance
 * if the database is unreachable in local or CI environments.
 */
export async function ensureDatabaseConnected(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Unable to connect to PostgreSQL test database.\n` +
        `To run integration tests locally, ensure PostgreSQL is running with migrations deployed.\n` +
        `In CI, integration tests run automatically against the postgres service container.\n` +
        `Original error: ${err}`,
    );
  }
}

export type TestSchoolFixture = {
  id: string;
  name: string;
};

/**
 * Creates an isolated test school with an active status.
 */
export async function createTestSchool(
  prisma: PrismaClient,
  namePrefix = "Test School",
): Promise<TestSchoolFixture> {
  const id = randomUUID();
  const school = await prisma.school.create({
    data: {
      id,
      name: `${namePrefix} [${id.slice(0, 8)}]`,
      status: "ACTIVE",
    },
  });
  return { id: school.id, name: school.name };
}

/**
 * Cleans up all data created for the specified test schools in a deterministic,
 * reverse-dependency order. Leaves all other school records untouched.
 */
export async function cleanupTestSchools(prisma: PrismaClient, schoolIds: string[]): Promise<void> {
  if (!schoolIds.length) return;

  const filter = { schoolId: { in: schoolIds } };

  // Delete dependent records first to satisfy ON DELETE RESTRICT
  await prisma.libraryLoan.deleteMany({ where: filter }).catch(() => {});
  await prisma.libraryReservation.deleteMany({ where: filter }).catch(() => {});
  await prisma.libraryCopy.deleteMany({ where: filter }).catch(() => {});
  await prisma.libraryItem.deleteMany({ where: filter }).catch(() => {});
  await prisma.libraryCategory.deleteMany({ where: filter }).catch(() => {});

  await prisma.assessmentResult.deleteMany({ where: filter }).catch(() => {});
  await prisma.assessment.deleteMany({ where: filter }).catch(() => {});
  await prisma.gradingScaleBand.deleteMany({ where: filter }).catch(() => {});
  await prisma.gradingScale.deleteMany({ where: filter }).catch(() => {});

  await prisma.attendanceRecord.deleteMany({ where: filter }).catch(() => {});
  await prisma.attendanceRegister.deleteMany({ where: filter }).catch(() => {});

  await prisma.paymentAllocation.deleteMany({ where: filter }).catch(() => {});
  await prisma.payment.deleteMany({ where: filter }).catch(() => {});
  await prisma.studentFeeCharge.deleteMany({ where: filter }).catch(() => {});
  await prisma.feeStructureItem.deleteMany({ where: filter }).catch(() => {});
  await prisma.feeStructure.deleteMany({ where: filter }).catch(() => {});

  await prisma.staffClassAssignment.deleteMany({ where: filter }).catch(() => {});
  await prisma.staffSubjectAssignment.deleteMany({ where: filter }).catch(() => {});
  await prisma.staffEmployment.deleteMany({ where: filter }).catch(() => {});
  await prisma.staff.deleteMany({ where: filter }).catch(() => {});
  await prisma.staffDepartment.deleteMany({ where: filter }).catch(() => {});

  await prisma.studentPlacement.deleteMany({ where: filter }).catch(() => {});
  await prisma.studentGuardian.deleteMany({ where: filter }).catch(() => {});
  await prisma.guardian.deleteMany({ where: filter }).catch(() => {});
  await prisma.student.deleteMany({ where: filter }).catch(() => {});
  await prisma.admissionApplication.deleteMany({ where: filter }).catch(() => {});

  await prisma.timetableSlot.deleteMany({ where: filter }).catch(() => {});
  await prisma.timetablePeriodDefinition.deleteMany({ where: filter }).catch(() => {});
  await prisma.timetable.deleteMany({ where: filter }).catch(() => {});

  await prisma.academicStream.deleteMany({ where: filter }).catch(() => {});
  await prisma.academicClass.deleteMany({ where: filter }).catch(() => {});
  await prisma.academicTerm.deleteMany({ where: filter }).catch(() => {});
  await prisma.academicYear.deleteMany({ where: filter }).catch(() => {});
  await prisma.subject.deleteMany({ where: filter }).catch(() => {});

  await prisma.schoolSubscription.deleteMany({ where: filter }).catch(() => {});
  await prisma.schoolRolePermission
    .deleteMany({
      where: { role: { schoolId: { in: schoolIds } } },
    })
    .catch(() => {});
  await prisma.membershipRoleGrant.deleteMany({ where: filter }).catch(() => {});
  await prisma.schoolRole.deleteMany({ where: filter }).catch(() => {});
  await prisma.schoolMembership.deleteMany({ where: filter }).catch(() => {});

  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } }).catch(() => {});
}
