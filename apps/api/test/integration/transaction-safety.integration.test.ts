import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestSchools,
  createTestSchool,
  ensureDatabaseConnected,
  getTestPrismaClient,
  type TestSchoolFixture,
} from "./setup.js";

describe("PostgreSQL Integration: Transaction Atomicity & Rollback Safety", () => {
  const prisma = getTestPrismaClient();
  let school: TestSchoolFixture;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabaseConnected(prisma);
    school = await createTestSchool(prisma, "Transaction School");
    createdSchoolIds.push(school.id);
  });

  afterAll(async () => {
    await cleanupTestSchools(prisma, createdSchoolIds);
    await prisma.$disconnect();
  });

  it("completely rolls back all multi-record operations when an error occurs", async () => {
    const yearName = `AY-${randomUUID().slice(0, 6)}`;
    const feeStructureName = `Term 1 Tuition ${randomUUID().slice(0, 6)}`;

    // Create prerequisite AcademicYear
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: yearName,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    let transactionFailed = false;

    try {
      await prisma.$transaction(
        async (tx) => {
          // Step 1: Create FeeStructure
          const feeStructure = await tx.feeStructure.create({
            data: {
              schoolId: school.id,
              academicYearId: year.id,
              name: feeStructureName,
              status: "ACTIVE",
            },
          });

          // Step 2: Create FeeStructureItem
          await tx.feeStructureItem.create({
            data: {
              schoolId: school.id,
              feeStructureId: feeStructure.id,
              name: "Tuition Fee",
              amount: 50000,
            },
          });

          // Step 3: Intentional failure to trigger rollback
          throw new Error("Intentional rollback failure in middle of multi-record operation");
        },
        {
          maxWait: 5000,
          timeout: 10000,
        },
      );
    } catch {
      transactionFailed = true;
    }

    expect(transactionFailed).toBe(true);

    // Verify zero orphaned records remain in the database
    const feeStructureCount = await prisma.feeStructure.count({
      where: {
        schoolId: school.id,
        name: feeStructureName,
      },
    });
    expect(feeStructureCount).toBe(0);

    const feeItemCount = await prisma.feeStructureItem.count({
      where: {
        schoolId: school.id,
        name: "Tuition Fee",
      },
    });
    expect(feeItemCount).toBe(0);
  });

  it("successfully commits all records when every transaction step succeeds", async () => {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const feeStructureName = `Term 2 Tuition ${randomUUID().slice(0, 6)}`;

    const result = await prisma.$transaction(
      async (tx) => {
        const feeStructure = await tx.feeStructure.create({
          data: {
            schoolId: school.id,
            academicYearId: year.id,
            name: feeStructureName,
            status: "ACTIVE",
          },
        });

        const feeItem = await tx.feeStructureItem.create({
          data: {
            schoolId: school.id,
            feeStructureId: feeStructure.id,
            name: "Boarding Fee",
            amount: 30000,
          },
        });

        return { feeStructure, feeItem };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );

    expect(result.feeStructure.id).toBeDefined();
    expect(result.feeItem.id).toBeDefined();

    // Verify records exist in PostgreSQL
    const savedFeeStructure = await prisma.feeStructure.findUnique({
      where: {
        schoolId_id: {
          schoolId: school.id,
          id: result.feeStructure.id,
        },
      },
    });
    expect(savedFeeStructure).not.toBeNull();
    expect(savedFeeStructure?.name).toBe(feeStructureName);
  });
});
