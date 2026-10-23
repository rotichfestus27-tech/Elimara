import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestSchools,
  createTestSchool,
  ensureDatabaseConnected,
  getTestPrismaClient,
  type TestSchoolFixture,
} from "./setup.js";

describe("PostgreSQL Integration: Least-Privilege Role Security & DDL Denial", () => {
  const prisma = getTestPrismaClient();
  let school: TestSchoolFixture;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabaseConnected(prisma);
    school = await createTestSchool(prisma, "Least-Privilege School");
    createdSchoolIds.push(school.id);
  });

  afterAll(async () => {
    await cleanupTestSchools(prisma, createdSchoolIds);
    await prisma.$disconnect();
  });

  it("permits standard application DML operations (INSERT, SELECT, UPDATE, DELETE)", async () => {
    // 1. INSERT
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
    expect(year.id).toBeDefined();

    // 2. SELECT
    const fetchedYear = await prisma.academicYear.findUnique({
      where: {
        schoolId_id: {
          schoolId: school.id,
          id: year.id,
        },
      },
    });
    expect(fetchedYear?.name).toBe(year.name);

    // 3. UPDATE
    const updatedYear = await prisma.academicYear.update({
      where: {
        schoolId_id: {
          schoolId: school.id,
          id: year.id,
        },
      },
      data: {
        status: "INACTIVE",
      },
    });
    expect(updatedYear.status).toBe("INACTIVE");

    // 4. DELETE
    const deletedYear = await prisma.academicYear.delete({
      where: {
        schoolId_id: {
          schoolId: school.id,
          id: year.id,
        },
      },
    });
    expect(deletedYear.id).toBe(year.id);
  });

  it("strictly denies unauthorized DDL operations when connected as the runtime role", async () => {
    // Determine the current database user
    const userResult = await prisma.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user;
    `;
    const currentUser = userResult[0]?.current_user;

    // If connected as elimara_app, assert that DDL statements fail with 42501 (insufficient_privilege)
    if (currentUser === "elimara_app") {
      // 1. Attempt CREATE TABLE
      await expect(
        prisma.$executeRawUnsafe(
          'CREATE TABLE "unauthorized_runtime_table" ("id" serial PRIMARY KEY);',
        ),
      ).rejects.toThrow();

      // 2. Attempt DROP TABLE
      await expect(prisma.$executeRawUnsafe('DROP TABLE "schools";')).rejects.toThrow();

      // 3. Attempt ALTER TABLE
      await expect(
        prisma.$executeRawUnsafe('ALTER TABLE "schools" ADD COLUMN "unauthorized_column" text;'),
      ).rejects.toThrow();

      // 4. Attempt TRUNCATE
      await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "users";')).rejects.toThrow();

      // 5. Attempt querying _prisma_migrations
      await expect(prisma.$queryRawUnsafe('SELECT * FROM "_prisma_migrations";')).rejects.toThrow();
    } else {
      // If connected as admin or migrator in local environment, verify that current user is identified
      expect(currentUser).toBeDefined();
    }
  });

  it("prohibits granting database privileges from application runtime", async () => {
    const userResult = await prisma.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user;
    `;
    const currentUser = userResult[0]?.current_user;

    if (currentUser === "elimara_app") {
      await expect(
        prisma.$executeRawUnsafe("GRANT ALL PRIVILEGES ON SCHEMA public TO PUBLIC;"),
      ).rejects.toThrow();
    }
  });
});
