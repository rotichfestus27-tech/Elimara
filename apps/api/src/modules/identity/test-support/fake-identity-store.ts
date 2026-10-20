import type {
  IdentityStore,
  RateLimitResult,
  SchoolAccessRecord,
  SessionRecord,
  UserRecord,
} from "@elimara/database";

export class FakeIdentityStore implements IdentityStore {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly accountTokens = new Map<string, { userId: string; expiresAt: Date; used: boolean }>();
  readonly auditEvents: Array<{ eventType: string; userId?: string; outcome: string }> = [];
  readonly schools = new Map<string, { userId: string; access: SchoolAccessRecord }>();
  readonly platformAdmins = new Set<string>();
  readonly rateLimitHits = new Map<string, number>();
  passwordResetCount = 0;

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async createSession(
    input: {
      userId: string;
      tokenHash: string;
      csrfTokenHash: string;
      expiresAt: Date;
    },
    _requestId: string,
  ): Promise<void> {
    const user = [...this.users.values()].find((record) => record.id === input.userId);
    if (!user) throw new Error("Unknown user");
    const session = {
      ...input,
      id: `session-${this.sessions.size + 1}`,
      revokedAt: null,
      mfaVerifiedAt: null,
      user,
    };
    this.sessions.set(input.tokenHash, session);
    this.auditEvents.push({
      eventType: "AUTH_LOGIN_SUCCEEDED",
      userId: input.userId,
      outcome: "SUCCESS",
    });
  }

  async revokeSession(
    tokenHash: string,
    userId: string,
    now: Date,
    _requestId: string,
  ): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session?.userId === userId) session.revokedAt = now;
    this.auditEvents.push({ eventType: "AUTH_LOGOUT", userId, outcome: "SUCCESS" });
  }

  async revokeAllSessions(userId: string, now: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) session.revokedAt = now;
    }
  }

  async createAccountToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.accountTokens.set(input.tokenHash, {
      userId: input.userId,
      expiresAt: input.expiresAt,
      used: false,
    });
  }

  async revokeAccountToken(tokenHash: string, _now: Date): Promise<void> {
    const token = this.accountTokens.get(tokenHash);
    if (token) token.used = true;
  }

  async completePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    const token = this.accountTokens.get(input.tokenHash);
    if (!token || token.used || token.expiresAt <= input.now) return false;
    const user = [...this.users.values()].find((record) => record.id === token.userId);
    if (user?.status !== "ACTIVE") return false;
    token.used = true;
    user.passwordHash = input.passwordHash;
    this.passwordResetCount += 1;
    await this.revokeAllSessions(user.id, input.now);
    this.auditEvents.push({
      eventType: "AUTH_PASSWORD_RESET_COMPLETED",
      userId: user.id,
      outcome: "SUCCESS",
    });
    return true;
  }

  async recordAudit(input: {
    userId?: string;
    schoolId?: string;
    eventType: string;
    outcome: "SUCCESS" | "FAILURE";
    requestId: string;
  }): Promise<void> {
    this.auditEvents.push({
      eventType: input.eventType,
      userId: input.userId,
      outcome: input.outcome,
    });
  }

  async getSchoolAccess(userId: string, schoolId: string): Promise<SchoolAccessRecord | null> {
    const entry = this.schools.get(schoolId);
    return entry?.userId === userId ? entry.access : null;
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    return this.platformAdmins.has(userId);
  }

  async incrementLoginLimits(
    emailKey: string,
    addressKey: string,
    _now: Date,
  ): Promise<RateLimitResult> {
    const emailHits = (this.rateLimitHits.get(emailKey) ?? 0) + 1;
    const addressHits = (this.rateLimitHits.get(addressKey) ?? 0) + 1;
    this.rateLimitHits.set(emailKey, emailHits);
    this.rateLimitHits.set(addressKey, addressHits);
    return { emailHits, addressHits };
  }
}
