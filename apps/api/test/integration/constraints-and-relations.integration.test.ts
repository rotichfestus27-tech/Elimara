import { randomUUID } from "node:crypto";
import { Prisma } from "@elimara/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestSchools,
  createTestSchool,
  ensureDatabaseConnected,
  getTestPrismaClient,
  type TestSchoolFixture,
} from "./setup.js";

describe("PostgreSQL Integration: Relational Constraints & Restrictive Deletions", () => {
  const prisma = getTestPrismaClient();
  let school: TestSchoolFixture;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabaseConnected(prisma);
    school = await createTestSchool(prisma, "Relations School");
    createdSchoolIds.push(school.id);
  });

  afterAll(async () => {
    await cleanupTestSchools(prisma, createdSchoolIds);
    await prisma.$disconnect();
  });

  it("creates and retrieves a full relational academic hierarchy", async () => {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const term = await prisma.academicTerm.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Term 1",
        termNumber: 1,
        startDate: new Date("2026-01-05"),
        endDate: new Date("2026-04-10"),
      },
    });

    const academicClass = await prisma.academicClass.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Form 3",
        orderIndex: 3,
      },
    });

    const stream = await prisma.academicStream.create({
      data: {
        schoolId: school.id,
        academicClassId: academicClass.id,
        name: "East",
      },
    });

    expect(stream.id).toBeDefined();
    expect(academicClass.id).toBeDefined();
    expect(term.id).toBeDefined();

    // Query with compound nested relation
    const retrievedClass = await prisma.academicClass.findUnique({
      where: {
        schoolId_id: {
          schoolId: school.id,
          id: academicClass.id,
        },
      },
      include: {
        academicYear: true,
        streams: true,
      },
    });

    expect(retrievedClass).not.toBeNull();
    expect(retrievedClass?.name).toBe("Form 3");
    expect(retrievedClass?.academicYear.name).toBe(year.name);
    expect(retrievedClass?.streams).toHaveLength(1);
    expect(retrievedClass?.streams[0].name).toBe("East");
  });

  it("enforces ON DELETE RESTRICT preventing deletion of parents with dependent records", async () => {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const academicClass = await prisma.academicClass.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Grade 10",
      },
    });

    // Attempting to delete the AcademicYear while AcademicClass exists must fail with P2003
    await expect(
      prisma.academicYear.delete({
        where: {
          schoolId_id: {
            schoolId: school.id,
            id: year.id,
          },
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    // Deleting the dependent child first allows parent deletion
    await prisma.academicClass.delete({
      where: {
        schoolId_id: {
          schoolId: school.id,
          id: academicClass.id,
        },
      },
    });

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

  it("enforces uniqueness within parent entity scope", async () => {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    await prisma.academicClass.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Standard 7",
      },
    });

    // Duplicate class name in same academic year must fail
    await expect(
      prisma.academicClass.create({
        data: {
          schoolId: school.id,
          academicYearId: year.id,
          name: "Standard 7",
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("enforces copy number uniqueness within library item", async () => {
    const item = await prisma.libraryItem.create({
      data: {
        schoolId: school.id,
        title: "Clean Code",
      },
    });

    await prisma.libraryCopy.create({
      data: {
        schoolId: school.id,
        itemId: item.id,
        copyNumber: "COPY-001",
      },
    });

    // Duplicate copyNumber for the same item must fail
    await expect(
      prisma.libraryCopy.create({
        data: {
          schoolId: school.id,
          itemId: item.id,
          copyNumber: "COPY-001",
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
