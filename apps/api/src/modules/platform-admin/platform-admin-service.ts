import { createHmac } from "node:crypto";
import type {
  ChangePlatformSchoolStatusInput,
  CreatePlatformSchoolInput,
  CreateSaasPlanInput,
  IdentityStore,
  PlatformAdminStore,
  PlatformAuditQuery,
  PlatformSchoolListQuery,
  SaasPlanListQuery,
  UpdatePlatformSchoolInput,
  UpdateSaasPlanInput,
} from "@elimara/database";
import { PlatformAdminStoreError } from "@elimara/database";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import type { AuthService } from "../identity/auth-service.js";
import {
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  matchingTotpStep,
  totpProvisioningUri,
} from "./totp.js";

const mfaAttemptLimitByIdentity = 10;
const mfaAttemptLimitByAddress = 60;

export class PlatformAdminService {
  constructor(
    private readonly store: PlatformAdminStore,
    private readonly identityStore: IdentityStore,
    private readonly authService: AuthService,
    private readonly config: AppConfig,
  ) {}

  async listSchools(query: PlatformSchoolListQuery) {
    return this.store.listSchools(query);
  }

  async getSchool(schoolId: string) {
    const school = await this.store.getSchool(schoolId);
    if (!school) throw notFound("SCHOOL_NOT_FOUND", "The school was not found.");
    return school;
  }

  async createSchool(input: CreatePlatformSchoolInput) {
    return this.run(() => this.store.createSchool(input));
  }

  async updateSchool(input: UpdatePlatformSchoolInput) {
    return this.run(async () => {
      const school = await this.store.updateSchool(input);
      if (!school) throw notFound("SCHOOL_NOT_FOUND", "The school was not found.");
      return school;
    });
  }

  async changeSchoolStatus(input: ChangePlatformSchoolStatusInput) {
    return this.run(async () => {
      const school = await this.store.changeSchoolStatus(input);
      if (!school) throw notFound("SCHOOL_NOT_FOUND", "The school was not found.");
      return school;
    });
  }

  async listPlans(query: SaasPlanListQuery) {
    return this.store.listPlans(query);
  }

  async getPlan(planId: string) {
    const plan = await this.store.getPlan(planId);
    if (!plan) throw notFound("PLAN_NOT_FOUND", "The subscription plan was not found.");
    return plan;
  }

  async createPlan(input: CreateSaasPlanInput) {
    return this.run(() => this.store.createPlan(input));
  }

  async updatePlan(input: UpdateSaasPlanInput) {
    return this.run(async () => {
      const plan = await this.store.updatePlan(input);
      if (!plan) throw notFound("PLAN_NOT_FOUND", "The subscription plan was not found.");
      return plan;
    });
  }

  async listSubscriptions(schoolId: string, query: PlatformAuditQuery) {
    await this.getSchool(schoolId);
    return this.store.listSubscriptions(schoolId, query);
  }

  async assignPlan(input: {
    actorUserId: string;
    requestId: string;
    schoolId: string;
    planId: string;
  }) {
    await this.getSchool(input.schoolId);
    const plan = await this.getPlan(input.planId);
    if (!plan.active) {
      throw new ApiError(409, "PLAN_INACTIVE", "An inactive plan cannot be assigned.");
    }
    return this.run(() => this.store.assignPlan(input));
  }

  async endSubscription(input: { actorUserId: string; requestId: string; schoolId: string }) {
    const subscription = await this.store.endSubscription(input);
    if (!subscription) {
      const school = await this.store.getSchool(input.schoolId);
      if (!school) throw notFound("SCHOOL_NOT_FOUND", "The school was not found.");
    }
    return subscription;
  }

  getSummary() {
    return this.store.getSummary();
  }

  listAuditEvents(query: PlatformAuditQuery) {
    return this.store.listAuditEvents(query);
  }

  async getTotpStatus(userId: string, mfaVerifiedAt: Date | null) {
    const admin = await this.store.getPlatformMfa(userId);
    if (!admin?.active || admin.revokedAt) throw forbidden();
    const age = mfaVerifiedAt ? Date.now() - mfaVerifiedAt.getTime() : Number.POSITIVE_INFINITY;
    return {
      enrolled: admin.totpEnabledAt !== null && admin.totpSecretEncrypted !== null,
      sessionVerified: age >= 0 && age <= 12 * 60 * 60 * 1000,
    };
  }

  async startTotpEnrollment(input: {
    userId: string;
    email: string;
    password: string;
    requestId: string;
  }): Promise<{ secret: string; provisioningUri: string }> {
    const admin = await this.store.getPlatformMfa(input.userId);
    if (!admin?.active || admin.revokedAt) {
      throw forbidden();
    }
    if (admin.totpEnabledAt) {
      throw new ApiError(
        409,
        "PLATFORM_MFA_ALREADY_ENABLED",
        "Platform multi-factor authentication is already enabled.",
      );
    }
    if (
      !(await this.authService.verifyCurrentPassword(input.userId, input.email, input.password))
    ) {
      await this.auditMfaFailure(input.userId, input.requestId);
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const secret = createTotpSecret();
    const encryptedSecret = encryptTotpSecret(secret, this.config.PLATFORM_MFA_ENCRYPTION_KEY);
    const saved = await this.store.savePendingTotpSecret({
      actorUserId: input.userId,
      userId: input.userId,
      requestId: input.requestId,
      secret: encryptedSecret,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    if (!saved) throw forbidden();
    return {
      secret,
      provisioningUri: totpProvisioningUri(secret, input.email),
    };
  }

  async completeTotpEnrollment(input: {
    userId: string;
    sessionId: string;
    code: string;
    requestId: string;
    address: string;
  }): Promise<void> {
    const record = await this.prepareMfaAttempt(input.userId, input.address, input.requestId);
    if (
      !record.active ||
      record.revokedAt ||
      record.totpEnabledAt ||
      !record.pendingTotpSecretEncrypted ||
      !record.pendingTotpSecretExpiresAt ||
      record.pendingTotpSecretExpiresAt <= new Date()
    ) {
      throw forbidden();
    }
    const secret = decryptTotpSecret(
      record.pendingTotpSecretEncrypted,
      this.config.PLATFORM_MFA_ENCRYPTION_KEY,
    );
    const now = new Date();
    const step = matchingTotpStep(secret, input.code, now);
    if (step === null) {
      await this.auditMfaFailure(input.userId, input.requestId);
      throw invalidTotp();
    }
    const enabled = await this.store.completeTotpEnrollment({
      actorUserId: input.userId,
      sessionId: input.sessionId,
      encryptedSecret: record.pendingTotpSecretEncrypted,
      step,
      now,
      requestId: input.requestId,
    });
    if (!enabled) throw invalidTotp();
  }

  async verifyTotp(input: {
    userId: string;
    sessionId: string;
    code: string;
    requestId: string;
    address: string;
  }): Promise<void> {
    const record = await this.prepareMfaAttempt(input.userId, input.address, input.requestId);
    if (
      !record.active ||
      record.revokedAt ||
      !record.totpEnabledAt ||
      !record.totpSecretEncrypted
    ) {
      throw forbidden();
    }
    const secret = decryptTotpSecret(
      record.totpSecretEncrypted,
      this.config.PLATFORM_MFA_ENCRYPTION_KEY,
    );
    const now = new Date();
    const step = matchingTotpStep(secret, input.code, now);
    if (step === null || (record.totpLastUsedStep !== null && step <= record.totpLastUsedStep)) {
      await this.auditMfaFailure(input.userId, input.requestId);
      throw invalidTotp();
    }
    const verified = await this.store.markTotpVerified({
      actorUserId: input.userId,
      sessionId: input.sessionId,
      step,
      now,
      requestId: input.requestId,
    });
    if (!verified) {
      await this.auditMfaFailure(input.userId, input.requestId);
      throw invalidTotp();
    }
  }

  private async prepareMfaAttempt(userId: string, address: string, requestId: string) {
    const [identityKey, addressKey] = [
      hmac(this.config.RATE_LIMIT_HMAC_KEY, `platform-mfa-user:${userId}`),
      hmac(this.config.RATE_LIMIT_HMAC_KEY, `platform-mfa-address:${address}`),
    ];
    const limits = await this.identityStore.incrementLoginLimits(
      identityKey,
      addressKey,
      new Date(),
    );
    if (
      limits.emailHits > mfaAttemptLimitByIdentity ||
      limits.addressHits > mfaAttemptLimitByAddress
    ) {
      await this.auditMfaFailure(userId, requestId);
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many verification attempts.");
    }
    const record = await this.store.getPlatformMfa(userId);
    if (!record) throw forbidden();
    return record;
  }

  private async auditMfaFailure(userId: string, requestId: string): Promise<void> {
    await this.identityStore.recordAudit({
      userId,
      eventType: "PLATFORM_MFA_REJECTED",
      outcome: "FAILURE",
      requestId,
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PlatformAdminStoreError) {
        switch (error.code) {
          case "CONFLICT":
            throw new ApiError(409, error.code, error.message);
          case "INVALID_TRANSITION":
            throw new ApiError(409, error.code, error.message);
          case "PLATFORM_ADMIN_REQUIRED":
            throw forbidden();
          case "CONCURRENT_CHANGE":
            throw new ApiError(409, error.code, error.message);
        }
      }
      throw error;
    }
  }
}

function hmac(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function invalidTotp(): ApiError {
  return new ApiError(401, "INVALID_MFA_CODE", "The multi-factor code is invalid or expired.");
}

function forbidden(): ApiError {
  return new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

function notFound(code: string, message: string): ApiError {
  return new ApiError(404, code, message);
}
