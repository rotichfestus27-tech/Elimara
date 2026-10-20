import { Prisma, type PrismaClient, SchoolStatus, UserStatus } from "@prisma/client";
import type {
  ChangePlatformSchoolStatusInput,
  CreatePlatformSchoolInput,
  CreateSaasPlanInput,
  PlatformAdminStore,
  PlatformAuditQuery,
  PlatformAuditRecord,
  PlatformMfaRecord,
  PlatformPage,
  PlatformSchoolListQuery,
  PlatformSchoolRecord,
  PlatformSummary,
  SaasPlanEntitlements,
  SaasPlanListQuery,
  SaasPlanRecord,
  SchoolSubscriptionRecord,
  UpdatePlatformSchoolInput,
  UpdateSaasPlanInput,
} from "./platform-contracts.js";
import { PlatformAdminStoreError } from "./platform-contracts.js";

export class PrismaPlatformAdminStore implements PlatformAdminStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listSchools(query: PlatformSchoolListQuery): Promise<PlatformPage<PlatformSchoolRecord>> {
    const where: Prisma.SchoolWhereInput = {
      status: query.status,
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.school.count({ where }),
    ]);
    return { items, total };
  }

  getSchool(schoolId: string): Promise<PlatformSchoolRecord | null> {
    return this.prisma.school.findUnique({ where: { id: schoolId } });
  }

  async createSchool(input: CreatePlatformSchoolInput): Promise<PlatformSchoolRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const school = await transaction.school.create({
        data: {
          name: input.name,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          status: SchoolStatus.SUSPENDED,
        },
      });
      await writeAudit(transaction, input, "PLATFORM_SCHOOL_CREATED", {
        schoolId: school.id,
        status: school.status,
      });
      return school;
    });
  }

  async updateSchool(input: UpdatePlatformSchoolInput): Promise<PlatformSchoolRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const school = await transaction.school.updateMany({
        where: { id: input.schoolId },
        data: {
          name: input.name,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
        },
      });
      if (school.count !== 1) return null;
      const updated = await transaction.school.findUnique({ where: { id: input.schoolId } });
      if (!updated) return null;
      await writeAudit(transaction, input, "PLATFORM_SCHOOL_UPDATED", {
        schoolId: updated.id,
        changedFields: Object.keys(input).filter(
          (key) => !["actorUserId", "requestId", "schoolId"].includes(key),
        ),
      });
      return updated;
    });
  }

  async changeSchoolStatus(
    input: ChangePlatformSchoolStatusInput,
  ): Promise<PlatformSchoolRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await lockSchool(transaction, input.schoolId);
      if (!locked) return null;
      const current = await transaction.school.findUnique({
        where: { id: input.schoolId },
      });
      if (!current) return null;
      if (current.status === input.status) return current;
      if (!isAllowedSchoolTransition(current.status, input.status)) {
        throw new PlatformAdminStoreError(
          "INVALID_TRANSITION",
          `School status cannot transition from ${current.status} to ${input.status}.`,
        );
      }
      const school = await transaction.school.update({
        where: { id: input.schoolId },
        data: { status: input.status },
      });
      await writeAudit(transaction, input, "PLATFORM_SCHOOL_STATUS_CHANGED", {
        schoolId: school.id,
        from: current.status,
        to: school.status,
      });
      return school;
    });
  }

  async listPlans(query: SaasPlanListQuery): Promise<PlatformPage<SaasPlanRecord>> {
    const where: Prisma.SaasPlanWhereInput = {
      active: query.active,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.saasPlan.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.saasPlan.count({ where }),
    ]);
    return { items: items.map(mapPlan), total };
  }

  async getPlan(planId: string): Promise<SaasPlanRecord | null> {
    const plan = await this.prisma.saasPlan.findUnique({ where: { id: planId } });
    return plan ? mapPlan(plan) : null;
  }

  async createPlan(input: CreateSaasPlanInput): Promise<SaasPlanRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const plan = await transaction.saasPlan.create({
          data: {
            code: input.code,
            name: input.name,
            description: input.description,
            entitlements: input.entitlements,
          },
        });
        await writeAudit(transaction, input, "PLATFORM_PLAN_CREATED", {
          planId: plan.id,
          code: plan.code,
        });
        return mapPlan(plan);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PlatformAdminStoreError("CONFLICT", "A plan with that code already exists.");
      }
      throw error;
    }
  }

  async updatePlan(input: UpdateSaasPlanInput): Promise<SaasPlanRecord | null> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.saasPlan.findUnique({
          where: { id: input.planId },
        });
        if (!current) return null;
        const plan = await transaction.saasPlan.update({
          where: { id: input.planId },
          data: {
            code: input.code,
            name: input.name,
            description: input.description,
            entitlements: input.entitlements,
            active: input.active,
          },
        });
        await writeAudit(transaction, input, "PLATFORM_PLAN_UPDATED", {
          planId: plan.id,
          changedFields: Object.keys(input).filter(
            (key) => !["actorUserId", "requestId", "planId"].includes(key),
          ),
        });
        return mapPlan(plan);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PlatformAdminStoreError("CONFLICT", "A plan with that code already exists.");
      }
      throw error;
    }
  }

  async listSubscriptions(
    schoolId: string,
    query: PlatformAuditQuery,
  ): Promise<PlatformPage<SchoolSubscriptionRecord>> {
    const where: Prisma.SchoolSubscriptionWhereInput = { schoolId };
    const [items, total] = await Promise.all([
      this.prisma.schoolSubscription.findMany({
        where,
        include: { school: { select: { name: true } }, plan: true },
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.schoolSubscription.count({ where }),
    ]);
    return { items: items.map((item) => mapSubscription(item, item.school.name)), total };
  }

  async assignPlan(input: {
    actorUserId: string;
    requestId: string;
    schoolId: string;
    planId: string;
  }): Promise<SchoolSubscriptionRecord> {
    return serializable(this.prisma, async (transaction) => {
      const locked = await lockSchool(transaction, input.schoolId);
      if (!locked) throw new PlatformAdminStoreError("CONFLICT", "School not found.");
      const plan = await transaction.saasPlan.findFirst({
        where: { id: input.planId, active: true },
      });
      if (!plan) throw new PlatformAdminStoreError("CONFLICT", "Active plan not found.");
      const current = await transaction.schoolSubscription.findFirst({
        where: { schoolId: input.schoolId, endedAt: null },
        include: { school: { select: { name: true } }, plan: true },
      });
      if (current?.planId === input.planId) return mapSubscription(current, current.school.name);
      const now = new Date();
      if (current) {
        await transaction.schoolSubscription.update({
          where: { id: current.id },
          data: { endedAt: now },
        });
      }
      const subscription = await transaction.schoolSubscription.create({
        data: {
          schoolId: input.schoolId,
          planId: input.planId,
          planCode: plan.code,
          planName: plan.name,
          entitlements: toPrismaJsonObject(asEntitlements(plan.entitlements)),
          assignedByUserId: input.actorUserId,
          assignedAt: now,
        },
        include: { school: { select: { name: true } }, plan: true },
      });
      await writeAudit(transaction, input, "PLATFORM_SUBSCRIPTION_ASSIGNED", {
        schoolId: input.schoolId,
        subscriptionId: subscription.id,
        planId: input.planId,
        replacedSubscriptionId: current?.id ?? null,
      });
      return mapSubscription(subscription, locked.name);
    });
  }

  async endSubscription(input: {
    actorUserId: string;
    requestId: string;
    schoolId: string;
  }): Promise<SchoolSubscriptionRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await lockSchool(transaction, input.schoolId);
      if (!locked) return null;
      const current = await transaction.schoolSubscription.findFirst({
        where: { schoolId: input.schoolId, endedAt: null },
        include: { school: { select: { name: true } }, plan: true },
      });
      if (!current) return null;
      const endedAt = new Date();
      const subscription = await transaction.schoolSubscription.update({
        where: { id: current.id },
        data: { endedAt },
        include: { school: { select: { name: true } }, plan: true },
      });
      await writeAudit(transaction, input, "PLATFORM_SUBSCRIPTION_ENDED", {
        schoolId: input.schoolId,
        subscriptionId: current.id,
      });
      return mapSubscription(subscription, current.school.name);
    });
  }

  async getSummary(): Promise<PlatformSummary> {
    const [active, suspended, closed, activePlans, activeSubscriptions] = await Promise.all([
      this.prisma.school.count({ where: { status: SchoolStatus.ACTIVE } }),
      this.prisma.school.count({ where: { status: SchoolStatus.SUSPENDED } }),
      this.prisma.school.count({ where: { status: SchoolStatus.CLOSED } }),
      this.prisma.saasPlan.count({ where: { active: true } }),
      this.prisma.schoolSubscription.count({ where: { endedAt: null } }),
    ]);
    return {
      schools: { ACTIVE: active, SUSPENDED: suspended, CLOSED: closed },
      activePlans,
      activeSubscriptions,
    };
  }

  async listAuditEvents(query: PlatformAuditQuery): Promise<PlatformPage<PlatformAuditRecord>> {
    const where: Prisma.SecurityAuditEventWhereInput = {
      schoolId: null,
      eventType: { startsWith: "PLATFORM_" },
    };
    const [items, total] = await Promise.all([
      this.prisma.securityAuditEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: query.offset,
        take: query.limit,
        select: {
          id: true,
          actorUserId: true,
          eventType: true,
          outcome: true,
          requestId: true,
          occurredAt: true,
          metadata: true,
        },
      }),
      this.prisma.securityAuditEvent.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        metadata: asRecord(item.metadata),
      })),
      total,
    };
  }

  async getPlatformMfa(userId: string): Promise<PlatformMfaRecord | null> {
    const assignment = await this.prisma.platformAdminAssignment.findUnique({
      where: { userId },
      select: {
        active: true,
        revokedAt: true,
        pendingTotpSecretEncrypted: true,
        pendingTotpSecretExpiresAt: true,
        totpSecretEncrypted: true,
        totpEnabledAt: true,
        totpLastUsedStep: true,
        user: { select: { passwordHash: true, status: true } },
      },
    });
    if (!assignment) return null;
    return {
      passwordHash: assignment.user.passwordHash,
      active: assignment.active && assignment.user.status === UserStatus.ACTIVE,
      revokedAt: assignment.revokedAt,
      pendingTotpSecretEncrypted: assignment.pendingTotpSecretEncrypted,
      pendingTotpSecretExpiresAt: assignment.pendingTotpSecretExpiresAt,
      totpSecretEncrypted: assignment.totpSecretEncrypted,
      totpEnabledAt: assignment.totpEnabledAt,
      totpLastUsedStep: assignment.totpLastUsedStep,
    };
  }

  async savePendingTotpSecret(input: {
    actorUserId: string;
    requestId: string;
    userId: string;
    secret: string;
    expiresAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.platformAdminAssignment.updateMany({
        where: {
          userId: input.userId,
          active: true,
          revokedAt: null,
          totpEnabledAt: null,
          user: { status: UserStatus.ACTIVE },
        },
        data: {
          pendingTotpSecretEncrypted: input.secret,
          pendingTotpSecretExpiresAt: input.expiresAt,
        },
      });
      if (result.count !== 1) return false;
      await writeAudit(transaction, input, "PLATFORM_MFA_ENROLLMENT_STARTED", {});
      return true;
    });
  }

  async completeTotpEnrollment(input: {
    actorUserId: string;
    sessionId: string;
    encryptedSecret: string;
    step: number;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.platformAdminAssignment.updateMany({
        where: {
          userId: input.actorUserId,
          active: true,
          revokedAt: null,
          totpEnabledAt: null,
          pendingTotpSecretEncrypted: input.encryptedSecret,
          pendingTotpSecretExpiresAt: { gt: input.now },
          user: { status: UserStatus.ACTIVE },
        },
        data: {
          pendingTotpSecretEncrypted: null,
          pendingTotpSecretExpiresAt: null,
          totpSecretEncrypted: input.encryptedSecret,
          totpEnabledAt: input.now,
          totpLastUsedStep: input.step,
        },
      });
      if (result.count !== 1) return false;
      const session = await transaction.userSession.updateMany({
        where: {
          id: input.sessionId,
          userId: input.actorUserId,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { mfaVerifiedAt: input.now },
      });
      if (session.count !== 1) throw new Error("The authenticated session is no longer active.");
      await writeAudit(transaction, input, "PLATFORM_MFA_ENROLLMENT_COMPLETED", {});
      return true;
    });
  }

  async markTotpVerified(input: {
    actorUserId: string;
    sessionId: string;
    step: number;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.platformAdminAssignment.updateMany({
        where: {
          userId: input.actorUserId,
          active: true,
          revokedAt: null,
          totpEnabledAt: { not: null },
          user: { status: UserStatus.ACTIVE },
          OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: input.step } }],
        },
        data: { totpLastUsedStep: input.step },
      });
      if (result.count !== 1) return false;
      const session = await transaction.userSession.updateMany({
        where: {
          id: input.sessionId,
          userId: input.actorUserId,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { mfaVerifiedAt: input.now },
      });
      if (session.count !== 1) throw new Error("The authenticated session is no longer active.");
      await writeAudit(transaction, input, "PLATFORM_MFA_VERIFIED", {});
      return true;
    });
  }
}

type Transaction = Prisma.TransactionClient;

function toPrismaJsonObject(value: SaasPlanEntitlements): Prisma.InputJsonObject {
  return value;
}

async function lockSchool(
  transaction: Transaction,
  schoolId: string,
): Promise<{ id: string; name: string } | null> {
  const result = await transaction.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name" FROM "schools" WHERE "id" = ${schoolId}::uuid FOR UPDATE
  `;
  return result[0] ?? null;
}

function isAllowedSchoolTransition(from: SchoolStatus, to: SchoolStatus): boolean {
  if (from === SchoolStatus.ACTIVE) {
    return to === SchoolStatus.SUSPENDED || to === SchoolStatus.CLOSED;
  }
  if (from === SchoolStatus.SUSPENDED) {
    return to === SchoolStatus.ACTIVE || to === SchoolStatus.CLOSED;
  }
  return to === SchoolStatus.ACTIVE;
}

function mapPlan(plan: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  entitlements: Prisma.JsonValue;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SaasPlanRecord {
  return { ...plan, entitlements: asEntitlements(plan.entitlements) };
}

function mapSubscription(
  subscription: {
    id: string;
    schoolId: string;
    planId: string;
    planCode: string;
    planName: string;
    entitlements: Prisma.JsonValue;
    assignedByUserId: string;
    assignedAt: Date;
    endedAt: Date | null;
  },
  schoolName: string,
): SchoolSubscriptionRecord {
  return {
    id: subscription.id,
    schoolId: subscription.schoolId,
    schoolName,
    planId: subscription.planId,
    planCode: subscription.planCode,
    planName: subscription.planName,
    entitlements: asEntitlements(subscription.entitlements),
    assignedByUserId: subscription.assignedByUserId,
    assignedAt: subscription.assignedAt,
    endedAt: subscription.endedAt,
  };
}

function asEntitlements(value: Prisma.JsonValue): SaasPlanEntitlements {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored plan entitlements must be a JSON object.");
  }
  const entitlements: SaasPlanEntitlements = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "boolean" && typeof item !== "number" && typeof item !== "string") {
      throw new Error("Stored plan entitlements contain an unsupported value.");
    }
    entitlements[key] = item;
  }
  return entitlements;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

async function writeAudit(
  transaction: Transaction,
  input: { actorUserId: string; requestId: string },
  eventType: string,
  metadata: Prisma.InputJsonObject,
): Promise<void> {
  await transaction.securityAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata,
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function serializable<T>(
  prisma: PrismaClient,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") {
        throw error;
      }
      if (attempt === 2) {
        throw new PlatformAdminStoreError(
          "CONCURRENT_CHANGE",
          "The subscription changed concurrently. Retry the request.",
        );
      }
    }
  }
  throw new Error("The platform subscription retry limit was exceeded.");
}
