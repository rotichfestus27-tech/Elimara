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

describe("PostgreSQL Integration: School Tenant Isolation & Compound Foreign Keys", () => {
  const prisma = getTestPrismaClient();
  let schoolA: TestSchoolFixture;
  let schoolB: TestSchoolFixture;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabaseConnected(prisma);
    schoolA = await createTestSchool(prisma, "Isolation School A");
    schoolB = await createTestSchool(prisma, "Isolation School B");
    createdSchoolIds.push(schoolA.id, schoolB.id);
  });

  afterAll(async () => {
    await cleanupTestSchools(prisma, createdSchoolIds);
    await prisma.$disconnect();
  });

  it("permits identical unique codes/names in different schools but rejects duplicates within the same school", async () => {
    const yearName = `AY-${randomUUID().slice(0, 6)}`;

    // 1. Create AcademicYear with same name in School A and School B -> both succeed
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: yearName,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
    expect(yearA.id).toBeDefined();

    const yearB = await prisma.academicYear.create({
      data: {
        schoolId: schoolB.id,
        name: yearName,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });
    expect(yearB.id).toBeDefined();

    // 2. Attempt duplicate AcademicYear in School A -> rejected by compound unique key @@unique([schoolId, name])
    await expect(
      prisma.academicYear.create({
        data: {
          schoolId: schoolA.id,
          name: yearName,
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("rejects cross-school LibraryLoan referencing AcademicClass from another school via compound foreign key", async () => {
    // 1. Create AcademicYear and AcademicClass in School A
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const classA = await prisma.academicClass.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        name: "Form 1 Alpha",
      },
    });

    // 2. Create Library Item and Copy in School B
    const itemB = await prisma.libraryItem.create({
      data: {
        schoolId: schoolB.id,
        title: "Advanced Chemistry",
      },
    });

    const copyB = await prisma.libraryCopy.create({
      data: {
        schoolId: schoolB.id,
        itemId: itemB.id,
        copyNumber: "CHEM-001",
      },
    });

    // 3. Attempt to issue LibraryLoan in School B referencing Class A from School A
    // Must fail because (school_id, academic_class_id) references academic_classes(school_id, id)
    let error: unknown = null;
    try {
      await prisma.libraryLoan.create({
        data: {
          schoolId: schoolB.id,
          copyId: copyB.id,
          academicClassId: classA.id, // Mismatched School!
          loanDate: new Date(),
          dueDate: new Date(Date.now() + 7 * 86400000),
        },
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003");
  });

  it("rejects cross-school LibraryReservation referencing AcademicClass from another school", async () => {
    // 1. Create AcademicYear and AcademicClass in School A
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const classA = await prisma.academicClass.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        name: "Form 2 Beta",
      },
    });

    // 2. Create Library Item in School B
    const itemB = await prisma.libraryItem.create({
      data: {
        schoolId: schoolB.id,
        title: "World History",
      },
    });

    // 3. Attempt to queue LibraryReservation in School B referencing Class A from School A
    let error: unknown = null;
    try {
      await prisma.libraryReservation.create({
        data: {
          schoolId: schoolB.id,
          itemId: itemB.id,
          academicClassId: classA.id, // Mismatched School!
        },
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2003");
  });

  it("rejects cross-school StudentPlacement linking a student of School B to a class of School A", async () => {
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const classA = await prisma.academicClass.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        name: "Grade 5 Green",
      },
    });

    const yearB = await prisma.academicYear.create({
      data: {
        schoolId: schoolB.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const studentB = await prisma.student.create({
      data: {
        schoolId: schoolB.id,
        admissionYearId: yearB.id,
        admissionNumber: `ADM-${randomUUID().slice(0, 6)}`,
        givenName: "Jane",
        familyName: "Doe",
      },
    });

    // Attempt to place Student B into Class A of School A
    await expect(
      prisma.studentPlacement.create({
        data: {
          schoolId: schoolB.id,
          studentId: studentB.id,
          academicYearId: yearB.id,
          academicClassId: classA.id, // Class belonging to School A!
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("rejects cross-school StudentGuardian linking a student of School A to a guardian of School B", async () => {
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: `AY-${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      },
    });

    const studentA = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        admissionYearId: yearA.id,
        admissionNumber: `ADM-${randomUUID().slice(0, 6)}`,
        givenName: "Alice",
        familyName: "Smith",
      },
    });

    const guardianB = await prisma.guardian.create({
      data: {
        schoolId: schoolB.id,
        givenName: "Bob",
        familyName: "Jones",
      },
    });

    // Attempt to link Student A with Guardian B
    await expect(
      prisma.studentGuardian.create({
        data: {
          schoolId: schoolA.id,
          studentId: studentA.id,
          guardianId: guardianB.id, // Guardian from School B!
          relationship: "Parent",
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
