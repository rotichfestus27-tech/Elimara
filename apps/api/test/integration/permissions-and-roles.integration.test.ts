import { randomUUID } from "node:crypto";
import { Prisma, SYSTEM_PERMISSIONS } from "@elimara/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestSchools,
  createTestSchool,
  ensureDatabaseConnected,
  getTestPrismaClient,
  type TestSchoolFixture,
} from "./setup.js";

describe("PostgreSQL Integration: Permissions, Roles & Membership Grants", () => {
  const prisma = getTestPrismaClient();
  let schoolA: TestSchoolFixture;
  let schoolB: TestSchoolFixture;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabaseConnected(prisma);
    schoolA = await createTestSchool(prisma, "Perm School A");
    schoolB = await createTestSchool(prisma, "Perm School B");
    createdSchoolIds.push(schoolA.id, schoolB.id);
  });

  afterAll(async () => {
    await cleanupTestSchools(prisma, createdSchoolIds);
    await prisma.$disconnect();
  });

  it("verifies all authoritative permissions are seeded and readable from PostgreSQL", async () => {
    const permissionsInDb = await prisma.permission.findMany();
    const permissionKeys = new Set(permissionsInDb.map((p) => p.key));

    expect(permissionsInDb.length).toBeGreaterThanOrEqual(SYSTEM_PERMISSIONS.length);

    for (const def of SYSTEM_PERMISSIONS) {
      expect(permissionKeys.has(def.key)).toBe(true);
    }
  });

  it("creates a custom school role and associates seeded permissions", async () => {
    const roleKey = `librarian_${randomUUID().slice(0, 6)}`;

    // 1. Create SchoolRole in School A
    const role = await prisma.schoolRole.create({
      data: {
        schoolId: schoolA.id,
        key: roleKey,
        name: "School Head Librarian",
      },
    });
    expect(role.id).toBeDefined();

    // 2. Associate seeded permissions
    await prisma.schoolRolePermission.createMany({
      data: [
        { roleId: role.id, permissionKey: "library.catalog.read" },
        { roleId: role.id, permissionKey: "library.loans.manage" },
      ],
    });

    // 3. Query role with permissions
    const retrievedRole = await prisma.schoolRole.findUnique({
      where: {
        schoolId_id: {
          schoolId: schoolA.id,
          id: role.id,
        },
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    expect(retrievedRole).not.toBeNull();
    expect(retrievedRole?.permissions).toHaveLength(2);
    const assignedKeys = retrievedRole?.permissions.map((p) => p.permissionKey) ?? [];
    expect(assignedKeys).toContain("library.catalog.read");
    expect(assignedKeys).toContain("library.loans.manage");
  });

  it("rejects cross-school role grants and duplicate role grants on memberships", async () => {
    // 1. Create User
    const user = await prisma.user.create({
      data: {
        email: `teacher_${randomUUID().slice(0, 8)}@example.com`,
        status: "ACTIVE",
      },
    });

    // 2. Create SchoolMembership in School A
    const membershipA = await prisma.schoolMembership.create({
      data: {
        schoolId: schoolA.id,
        userId: user.id,
        status: "ACTIVE",
      },
    });

    // 3. Create Role in School A and School B
    const roleA = await prisma.schoolRole.create({
      data: {
        schoolId: schoolA.id,
        key: `dept_head_${randomUUID().slice(0, 6)}`,
        name: "Department Head A",
      },
    });

    const roleB = await prisma.schoolRole.create({
      data: {
        schoolId: schoolB.id,
        key: `dept_head_${randomUUID().slice(0, 6)}`,
        name: "Department Head B",
      },
    });

    // 4. Grant Role A to Membership A -> succeeds
    const grant = await prisma.membershipRoleGrant.create({
      data: {
        schoolId: schoolA.id,
        membershipId: membershipA.id,
        roleId: roleA.id,
      },
    });
    expect(grant.id).toBeDefined();

    // 5. Attempt duplicate grant -> fails with P2002
    await expect(
      prisma.membershipRoleGrant.create({
        data: {
          schoolId: schoolA.id,
          membershipId: membershipA.id,
          roleId: roleA.id,
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    // 6. Attempt to grant Role B (School B) to Membership A (School A) -> fails with foreign key violation P2003
    await expect(
      prisma.membershipRoleGrant.create({
        data: {
          schoolId: schoolA.id,
          membershipId: membershipA.id,
          roleId: roleB.id, // Role from School B!
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
