import { createHmac, createHash, randomBytes } from "node:crypto";
import type { IdentityStore, SchoolAccessRecord, UserRecord } from "@elimara/database";
import type { AppConfig } from "../../config/env.js";
import { ApiError } from "../../http/errors/api-error.js";
import type { PasswordHasher, PasswordResetDelivery } from "./identity-store.js";

const passwordPolicy = { min: 12, max: 1024 };
const resetTokenLifetimeMilliseconds = 30 * 60 * 1000;
const loginWindowMilliseconds = 15 * 60 * 1000;
const loginLimitByEmail = 10;
const loginLimitByAddress = 60;

export type AuthenticatedSession = {
  sessionId: string;
  user: Pick<UserRecord, "id" | "email">;
  csrfTokenHash: string;
  mfaVerifiedAt: Date | null;
};

const platformMfaVerificationLifetimeMilliseconds = 12 * 60 * 60 * 1000;

export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly store: IdentityStore,
    private readonly hasher: PasswordHasher,
    private readonly config: AppConfig,
    private readonly resetDelivery?: PasswordResetDelivery,
  ) {}

  async login(
    emailInput: string,
    password: string,
    address: string,
    requestId: string,
  ): Promise<{ sessionToken: string; csrfToken: string; user: Pick<UserRecord, "id" | "email"> }> {
    validatePassword(password);
    const email = normalizeEmail(emailInput);
    const [emailKey, addressKey] = this.rateLimitKeys(email, address);
    const limits = await this.store.incrementLoginLimits(emailKey, addressKey, new Date());

    if (limits.emailHits > loginLimitByEmail || limits.addressHits > loginLimitByAddress) {
      await this.store.recordAudit({
        eventType: "AUTH_LOGIN_THROTTLED",
        outcome: "FAILURE",
        requestId,
      });
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Try again later.");
    }

    const user = await this.store.findUserByEmail(email);
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.hasher.verify(hash, password);

    if (user?.status !== "ACTIVE" || !user.passwordHash || !passwordMatches) {
      await this.store.recordAudit({
        userId: user?.id,
        eventType: "AUTH_LOGIN_REJECTED",
        outcome: "FAILURE",
        requestId,
      });
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const now = new Date();
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.config.SESSION_TTL_HOURS * 60 * 60 * 1000);

    await this.store.createSession(
      {
        userId: user.id,
        tokenHash: digest(sessionToken),
        csrfTokenHash: digest(csrfToken),
        expiresAt,
      },
      requestId,
    );

    return {
      sessionToken,
      csrfToken,
      user: { id: user.id, email: user.email },
    };
  }

  async authenticate(sessionToken: string | undefined): Promise<AuthenticatedSession | null> {
    if (!sessionToken) return null;

    const session = await this.store.findSessionByTokenHash(digest(sessionToken));
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE"
    ) {
      return null;
    }

    return {
      sessionId: session.id,
      user: { id: session.user.id, email: session.user.email },
      csrfTokenHash: session.csrfTokenHash,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }

  async logout(sessionToken: string, userId: string, requestId: string): Promise<void> {
    await this.store.revokeSession(digest(sessionToken), userId, new Date(), requestId);
  }

  async getSchoolAccess(userId: string, schoolId: string): Promise<SchoolAccessRecord> {
    const access = await this.store.getSchoolAccess(userId, schoolId);
    if (!access) {
      throw new ApiError(404, "SCHOOL_NOT_FOUND", "The requested school was not found.");
    }
    return access;
  }

  async requirePlatformAdmin(userId: string, mfaVerifiedAt: Date | null): Promise<void> {
    if (!(await this.store.isPlatformAdmin(userId))) {
      throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
    }
    const age = mfaVerifiedAt ? Date.now() - mfaVerifiedAt.getTime() : Number.POSITIVE_INFINITY;
    if (age < 0 || age > platformMfaVerificationLifetimeMilliseconds) {
      throw new ApiError(
        403,
        "PLATFORM_MFA_REQUIRED",
        "Verify your platform multi-factor authentication before continuing.",
      );
    }
  }

  async verifyCurrentPassword(userId: string, email: string, password: string): Promise<boolean> {
    const user = await this.store.findUserByEmail(normalizeEmail(email));
    if (!user || user.id !== userId || user.status !== "ACTIVE" || !user.passwordHash) {
      return false;
    }
    return this.hasher.verify(user.passwordHash, password);
  }

  async recordReportAudit(input: {
    userId: string;
    schoolId: string;
    reportType: "DASHBOARD" | "STUDENTS" | "ATTENDANCE" | "ACADEMICS" | "FINANCE" | "STAFF";
    exported: boolean;
    requestId: string;
  }): Promise<void> {
    await this.store.recordAudit({
      userId: input.userId,
      schoolId: input.schoolId,
      eventType: `${input.exported ? "REPORT_EXPORTED" : "REPORT_VIEWED"}_${input.reportType}`,
      outcome: "SUCCESS",
      requestId: input.requestId,
    });
  }

  async requestPasswordReset(
    emailInput: string,
    address: string,
    requestId: string,
  ): Promise<void> {
    if (!this.resetDelivery) {
      throw new ApiError(
        503,
        "RECOVERY_UNAVAILABLE",
        "Account recovery is temporarily unavailable.",
      );
    }

    const email = normalizeEmail(emailInput);
    const [emailKey, addressKey] = this.rateLimitKeys(`recovery:${email}`, `recovery:${address}`);
    const limits = await this.store.incrementLoginLimits(emailKey, addressKey, new Date());
    if (limits.emailHits > loginLimitByEmail || limits.addressHits > loginLimitByAddress) {
      await this.store.recordAudit({
        eventType: "AUTH_PASSWORD_RESET_THROTTLED",
        outcome: "FAILURE",
        requestId,
      });
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Try again later.");
    }

    const user = await this.store.findUserByEmail(email);

    if (user?.status !== "ACTIVE") {
      await this.store.recordAudit({
        userId: user?.id,
        eventType: "AUTH_PASSWORD_RESET_REQUESTED",
        outcome: "SUCCESS",
        requestId,
      });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    await this.store.createAccountToken({
      userId: user.id,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + resetTokenLifetimeMilliseconds),
    });

    try {
      await this.resetDelivery.sendPasswordReset(user.email, token);
    } catch {
      await this.store.revokeAccountToken(digest(token), new Date());
      await this.store.recordAudit({
        userId: user.id,
        eventType: "AUTH_PASSWORD_RESET_DELIVERY_FAILED",
        outcome: "FAILURE",
        requestId,
      });
      throw new ApiError(
        503,
        "RECOVERY_UNAVAILABLE",
        "Account recovery is temporarily unavailable.",
      );
    }

    await this.store.recordAudit({
      userId: user.id,
      eventType: "AUTH_PASSWORD_RESET_REQUESTED",
      outcome: "SUCCESS",
      requestId,
    });
  }

  async completePasswordReset(
    token: string,
    newPassword: string,
    requestId: string,
  ): Promise<void> {
    validatePassword(newPassword);
    if (token.length < 32 || token.length > 128) {
      throw new ApiError(400, "INVALID_RESET_TOKEN", "The reset token is invalid or expired.");
    }

    const changed = await this.store.completePasswordReset({
      tokenHash: digest(token),
      passwordHash: await this.hasher.hash(newPassword),
      now: new Date(),
      requestId,
    });

    if (!changed) {
      await this.store.recordAudit({
        eventType: "AUTH_PASSWORD_RESET_REJECTED",
        outcome: "FAILURE",
        requestId,
      });
      throw new ApiError(400, "INVALID_RESET_TOKEN", "The reset token is invalid or expired.");
    }
  }

  private rateLimitKeys(email: string, address: string): [string, string] {
    const emailKey = createHmac("sha256", this.config.RATE_LIMIT_HMAC_KEY)
      .update(`login-email:${email}`)
      .digest("hex");
    const addressKey = createHmac("sha256", this.config.RATE_LIMIT_HMAC_KEY)
      .update(`login-address:${address}`)
      .digest("hex");
    return [emailKey, addressKey];
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomBytes(32).toString("base64url"));
    return this.dummyHash;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validatePassword(password: string): void {
  if (
    password.length < passwordPolicy.min ||
    password.length > passwordPolicy.max ||
    Buffer.byteLength(password, "utf8") > passwordPolicy.max
  ) {
    throw new ApiError(
      400,
      "INVALID_PASSWORD",
      `Password must be between ${passwordPolicy.min} and ${passwordPolicy.max} characters.`,
    );
  }
}

export const authPolicyLimits = {
  loginWindowMilliseconds,
  loginLimitByEmail,
  loginLimitByAddress,
  resetTokenLifetimeMilliseconds,
};
