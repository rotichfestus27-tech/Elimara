import { type TransactionTimeoutOptions, resolveTransactionOptions } from "./transaction-options.js";
import { AccountTokenPurpose, MembershipStatus, SchoolStatus, UserStatus } from "@prisma/client";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  IdentityStore,
  RateLimitResult,
  SchoolAccessRecord,
  SessionRecord,
  UserRecord,
} from "./contracts.js";

type SchoolMembershipAccess = {
  school: { id: string; name: string };
  roleGrants: Array<{
    role: { permissions: Array<{ permissionKey: string }> };
  }>;
};

function mapSchoolAccess(membership: SchoolMembershipAccess): SchoolAccessRecord {
  const permissions = new Set(
    membership.roleGrants.flatMap((grant) =>
      grant.role.permissions.map((permission) => permission.permissionKey),
    ),
  );
  return {
    id: membership.school.id,
    name: membership.school.name,
    permissions: [...permissions].sort(),
  };
}

export class PrismaIdentityStore implements IdentityStore {
  private readonly txOptions: { maxWait: number; timeout: number };

  constructor(
    private readonly prisma: PrismaClient,
    options?: TransactionTimeoutOptions,
  ) {
    this.txOptions = resolveTransactionOptions(options);
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, status: true },
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, passwordHash: true, status: true },
        },
      },
    });
  }

  async createSession(
    input: {
      userId: string;
      tokenHash: string;
      csrfTokenHash: string;
      expiresAt: Date;
    },
    requestId: string,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.userSession.create({ data: input });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: input.userId,
          eventType: "AUTH_LOGIN_SUCCEEDED",
          outcome: "SUCCESS",
          requestId,
        },
      });
      },
      { maxWait: this.txOptions.maxWait, timeout: this.txOptions.timeout },
    );
  }

  async revokeSession(
    tokenHash: string,
    userId: string,
    now: Date,
    requestId: string,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.userSession.updateMany({
        where: { tokenHash, userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: userId,
          eventType: "AUTH_LOGOUT",
          outcome: "SUCCESS",
          requestId,
        },
      });
    });
  }

  async revokeAllSessions(userId: string, now: Date): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async createAccountToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.accountActionToken.create({
      data: { ...input, purpose: AccountTokenPurpose.PASSWORD_RESET },
    });
  }

  async revokeAccountToken(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.accountActionToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: now },
    });
  }

  async completePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const token = await transaction.accountActionToken.findFirst({
          where: {
            tokenHash: input.tokenHash,
            purpose: AccountTokenPurpose.PASSWORD_RESET,
            usedAt: null,
            expiresAt: { gt: input.now },
            user: { status: UserStatus.ACTIVE },
          },
          select: { id: true, userId: true },
        });

        if (!token) return false;

        const consumed = await transaction.accountActionToken.updateMany({
          where: {
            id: token.id,
            usedAt: null,
            expiresAt: { gt: input.now },
          },
          data: { usedAt: input.now },
        });
        if (consumed.count !== 1) return false;

        await transaction.user.update({
          where: { id: token.userId },
          data: { passwordHash: input.passwordHash },
        });
        await transaction.accountActionToken.updateMany({
          where: {
            userId: token.userId,
            purpose: AccountTokenPurpose.PASSWORD_RESET,
            usedAt: null,
          },
          data: { usedAt: input.now },
        });
        await transaction.userSession.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: input.now },
        });
        await transaction.securityAuditEvent.create({
          data: {
            actorUserId: token.userId,
            eventType: "AUTH_PASSWORD_RESET_COMPLETED",
            outcome: "SUCCESS",
            requestId: input.requestId,
          },
        });
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: this.txOptions.maxWait,
        timeout: this.txOptions.timeout,
      },
    );
  }

  async recordAudit(input: {
    userId?: string;
    schoolId?: string;
    eventType: string;
    outcome: "SUCCESS" | "FAILURE";
    requestId: string;
  }): Promise<void> {
    await this.prisma.securityAuditEvent.create({
      data: {
        actorUserId: input.userId,
        schoolId: input.schoolId,
        eventType: input.eventType,
        outcome: input.outcome,
        requestId: input.requestId,
      },
    });
  }

  async getSchoolAccess(userId: string, schoolId: string): Promise<SchoolAccessRecord | null> {
    const membership = await this.prisma.schoolMembership.findFirst({
      where: {
        userId,
        schoolId,
        status: MembershipStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE },
        school: { status: SchoolStatus.ACTIVE },
      },
      select: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
        roleGrants: {
          where: { branchId: null, role: { active: true } },
          select: {
            role: {
              select: {
                permissions: {
                  select: { permissionKey: true },
                },
              },
            },
          },
        },
      },
    });

    return membership ? mapSchoolAccess(membership) : null;
  }

  async listSchoolAccess(userId: string): Promise<SchoolAccessRecord[]> {
    const memberships = await this.prisma.schoolMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE },
        school: { status: SchoolStatus.ACTIVE },
      },
      select: {
        school: { select: { id: true, name: true } },
        roleGrants: {
          where: { branchId: null, role: { active: true } },
          select: {
            role: {
              select: {
                permissions: { select: { permissionKey: true } },
              },
            },
          },
        },
      },
      orderBy: [{ school: { name: "asc" } }, { schoolId: "asc" }],
    });
    return memberships.map(mapSchoolAccess);
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const assignment = await this.prisma.platformAdminAssignment.findUnique({
      where: { userId },
      select: {
        active: true,
        revokedAt: true,
        user: { select: { status: true } },
      },
    });
    return (
      assignment?.active === true &&
      assignment.revokedAt === null &&
      assignment.user.status === UserStatus.ACTIVE
    );
  }

  async incrementLoginLimits(
    emailKey: string,
    addressKey: string,
    now: Date,
  ): Promise<RateLimitResult> {
    const windowMs = 15 * 60 * 1000;
    const cutoff = new Date(now.getTime() - windowMs);
    const expiresAt = new Date(now.getTime() + windowMs);

    const [emailHits, addressHits] = await Promise.all([
      this.incrementBucket(emailKey, now, cutoff, expiresAt),
      this.incrementBucket(addressKey, now, cutoff, expiresAt),
    ]);
    return { emailHits, addressHits };
  }

  private async incrementBucket(
    keyHash: string,
    now: Date,
    cutoff: Date,
    expiresAt: Date,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ hit_count: number }>>`
      INSERT INTO "rate_limit_buckets" ("key_hash", "window_started_at", "hit_count", "expires_at")
      VALUES (${keyHash}, ${now}, 1, ${expiresAt})
      ON CONFLICT ("key_hash") DO UPDATE
      SET
        "window_started_at" = CASE
          WHEN "rate_limit_buckets"."window_started_at" <= ${cutoff} THEN ${now}
          ELSE "rate_limit_buckets"."window_started_at"
        END,
        "hit_count" = CASE
          WHEN "rate_limit_buckets"."window_started_at" <= ${cutoff} THEN 1
          ELSE "rate_limit_buckets"."hit_count" + 1
        END,
        "expires_at" = CASE
          WHEN "rate_limit_buckets"."window_started_at" <= ${cutoff} THEN ${expiresAt}
          ELSE "rate_limit_buckets"."expires_at"
        END
      RETURNING "hit_count"
    `;
    return result[0]?.hit_count ?? 0;
  }
}
