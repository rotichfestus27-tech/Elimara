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
  SaasPlanListQuery,
  SaasPlanRecord,
  SchoolSubscriptionRecord,
  UpdatePlatformSchoolInput,
  UpdateSaasPlanInput,
} from "@elimara/database";
import { PlatformAdminStoreError } from "@elimara/database";

export class FakePlatformAdminStore implements PlatformAdminStore {
  readonly schools = new Map<string, PlatformSchoolRecord>();
  readonly plans = new Map<string, SaasPlanRecord>();
  readonly subscriptions: SchoolSubscriptionRecord[] = [];
  readonly auditEvents: PlatformAuditRecord[] = [];
  readonly mfaRecords = new Map<string, PlatformMfaRecord>();
  private nextId = 0;

  constructor(private readonly onSessionMfaVerified?: (userId: string, now: Date) => void) {}

  async listSchools(query: PlatformSchoolListQuery): Promise<PlatformPage<PlatformSchoolRecord>> {
    const filtered = [...this.schools.values()]
      .filter((school) => !query.status || school.status === query.status)
      .filter(
        (school) => !query.search || school.name.toLowerCase().includes(query.search.toLowerCase()),
      )
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  }

  async getSchool(schoolId: string): Promise<PlatformSchoolRecord | null> {
    return this.schools.get(schoolId) ?? null;
  }

  async createSchool(input: CreatePlatformSchoolInput): Promise<PlatformSchoolRecord> {
    const now = new Date();
    const school: PlatformSchoolRecord = {
      id: this.id(),
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      status: "SUSPENDED",
      createdAt: now,
      updatedAt: now,
    };
    this.schools.set(school.id, school);
    this.audit(input, "PLATFORM_SCHOOL_CREATED", { schoolId: school.id, status: school.status });
    return school;
  }

  async updateSchool(input: UpdatePlatformSchoolInput): Promise<PlatformSchoolRecord | null> {
    const school = this.schools.get(input.schoolId);
    if (!school) return null;
    const updated: PlatformSchoolRecord = {
      ...school,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      updatedAt: new Date(),
    };
    this.schools.set(school.id, updated);
    this.audit(input, "PLATFORM_SCHOOL_UPDATED", {
      schoolId: school.id,
      changedFields: Object.keys(input).filter(
        (key) => !["actorUserId", "requestId", "schoolId"].includes(key),
      ),
    });
    return updated;
  }

  async changeSchoolStatus(
    input: ChangePlatformSchoolStatusInput,
  ): Promise<PlatformSchoolRecord | null> {
    const school = this.schools.get(input.schoolId);
    if (!school) return null;
    if (school.status === input.status) return school;
    const allowed =
      (school.status === "ACTIVE" && ["SUSPENDED", "CLOSED"].includes(input.status)) ||
      (school.status === "SUSPENDED" && ["ACTIVE", "CLOSED"].includes(input.status)) ||
      (school.status === "CLOSED" && input.status === "ACTIVE");
    if (!allowed) {
      throw new PlatformAdminStoreError(
        "INVALID_TRANSITION",
        `School status cannot transition from ${school.status} to ${input.status}.`,
      );
    }
    const updated = { ...school, status: input.status, updatedAt: new Date() };
    this.schools.set(school.id, updated);
    this.audit(input, "PLATFORM_SCHOOL_STATUS_CHANGED", {
      schoolId: school.id,
      from: school.status,
      to: input.status,
    });
    return updated;
  }

  async listPlans(query: SaasPlanListQuery): Promise<PlatformPage<SaasPlanRecord>> {
    const filtered = [...this.plans.values()]
      .filter((plan) => query.active === undefined || plan.active === query.active)
      .filter(
        (plan) =>
          !query.search ||
          plan.name.toLowerCase().includes(query.search.toLowerCase()) ||
          plan.code.toLowerCase().includes(query.search.toLowerCase()),
      )
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  }

  async getPlan(planId: string): Promise<SaasPlanRecord | null> {
    return this.plans.get(planId) ?? null;
  }

  async createPlan(input: CreateSaasPlanInput): Promise<SaasPlanRecord> {
    if ([...this.plans.values()].some((plan) => plan.code === input.code)) {
      throw new PlatformAdminStoreError("CONFLICT", "A plan with that code already exists.");
    }
    const now = new Date();
    const plan: SaasPlanRecord = {
      id: this.id(),
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      entitlements: input.entitlements,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.plans.set(plan.id, plan);
    this.audit(input, "PLATFORM_PLAN_CREATED", { planId: plan.id, code: plan.code });
    return plan;
  }

  async updatePlan(input: UpdateSaasPlanInput): Promise<SaasPlanRecord | null> {
    const plan = this.plans.get(input.planId);
    if (!plan) return null;
    const updated = { ...plan, ...input, updatedAt: new Date() };
    this.plans.set(plan.id, updated);
    this.audit(input, "PLATFORM_PLAN_UPDATED", {
      planId: plan.id,
      changedFields: Object.keys(input).filter(
        (key) => !["actorUserId", "requestId", "planId"].includes(key),
      ),
    });
    return updated;
  }

  async listSubscriptions(
    schoolId: string,
    query: PlatformAuditQuery,
  ): Promise<PlatformPage<SchoolSubscriptionRecord>> {
    const items = this.subscriptions
      .filter((subscription) => subscription.schoolId === schoolId)
      .sort((left, right) => right.assignedAt.getTime() - left.assignedAt.getTime());
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async assignPlan(input: {
    actorUserId: string;
    requestId: string;
    schoolId: string;
    planId: string;
  }): Promise<SchoolSubscriptionRecord> {
    const school = this.schools.get(input.schoolId);
    const plan = this.plans.get(input.planId);
    if (!school || !plan?.active) {
      throw new PlatformAdminStoreError("CONFLICT", "School or active plan not found.");
    }
    const current = this.subscriptions.find(
      (subscription) => subscription.schoolId === school.id && subscription.endedAt === null,
    );
    if (current?.planId === plan.id) return current;
    const now = new Date();
    if (current) current.endedAt = now;
    const subscription: SchoolSubscriptionRecord = {
      id: this.id(),
      schoolId: school.id,
      schoolName: school.name,
      planId: plan.id,
      planCode: plan.code,
      planName: plan.name,
      entitlements: plan.entitlements,
      assignedByUserId: input.actorUserId,
      assignedAt: now,
      endedAt: null,
    };
    this.subscriptions.push(subscription);
    this.audit(input, "PLATFORM_SUBSCRIPTION_ASSIGNED", {
      schoolId: school.id,
      subscriptionId: subscription.id,
      planId: plan.id,
      replacedSubscriptionId: current?.id ?? null,
    });
    return subscription;
  }

  async endSubscription(input: {
    actorUserId: string;
    requestId: string;
    schoolId: string;
  }): Promise<SchoolSubscriptionRecord | null> {
    const current = this.subscriptions.find(
      (subscription) => subscription.schoolId === input.schoolId && subscription.endedAt === null,
    );
    if (!current) return null;
    current.endedAt = new Date();
    this.audit(input, "PLATFORM_SUBSCRIPTION_ENDED", {
      schoolId: input.schoolId,
      subscriptionId: current.id,
    });
    return current;
  }

  async getSummary(): Promise<PlatformSummary> {
    const schools = { ACTIVE: 0, SUSPENDED: 0, CLOSED: 0 };
    for (const school of this.schools.values()) schools[school.status] += 1;
    return {
      schools,
      activePlans: [...this.plans.values()].filter((plan) => plan.active).length,
      activeSubscriptions: this.subscriptions.filter(
        (subscription) => subscription.endedAt === null,
      ).length,
    };
  }

  async listAuditEvents(query: PlatformAuditQuery): Promise<PlatformPage<PlatformAuditRecord>> {
    const items = this.auditEvents
      .slice()
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async getPlatformMfa(userId: string): Promise<PlatformMfaRecord | null> {
    return this.mfaRecords.get(userId) ?? null;
  }

  async savePendingTotpSecret(input: {
    actorUserId: string;
    requestId: string;
    userId: string;
    secret: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const record = this.mfaRecords.get(input.userId);
    if (!record?.active || record.revokedAt || record.totpEnabledAt) return false;
    record.pendingTotpSecretEncrypted = input.secret;
    record.pendingTotpSecretExpiresAt = input.expiresAt;
    this.audit(input, "PLATFORM_MFA_ENROLLMENT_STARTED", {});
    return true;
  }

  async completeTotpEnrollment(input: {
    actorUserId: string;
    sessionId: string;
    encryptedSecret: string;
    step: number;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    const record = this.mfaRecords.get(input.actorUserId);
    if (
      !record?.active ||
      record.revokedAt ||
      record.totpEnabledAt ||
      record.pendingTotpSecretEncrypted !== input.encryptedSecret ||
      !record.pendingTotpSecretExpiresAt ||
      record.pendingTotpSecretExpiresAt <= input.now
    ) {
      return false;
    }
    record.pendingTotpSecretEncrypted = null;
    record.pendingTotpSecretExpiresAt = null;
    record.totpSecretEncrypted = input.encryptedSecret;
    record.totpEnabledAt = input.now;
    record.totpLastUsedStep = input.step;
    this.onSessionMfaVerified?.(input.actorUserId, input.now);
    this.audit(input, "PLATFORM_MFA_ENROLLMENT_COMPLETED", {});
    return true;
  }

  async markTotpVerified(input: {
    actorUserId: string;
    sessionId: string;
    step: number;
    now: Date;
    requestId: string;
  }): Promise<boolean> {
    const record = this.mfaRecords.get(input.actorUserId);
    if (
      !record?.active ||
      record.revokedAt ||
      !record.totpEnabledAt ||
      !record.totpSecretEncrypted ||
      (record.totpLastUsedStep !== null && input.step <= record.totpLastUsedStep)
    ) {
      return false;
    }
    record.totpLastUsedStep = input.step;
    this.onSessionMfaVerified?.(input.actorUserId, input.now);
    this.audit(input, "PLATFORM_MFA_VERIFIED", {});
    return true;
  }

  private id(): string {
    this.nextId += 1;
    return `00000000-0000-4000-8000-${String(this.nextId).padStart(12, "0")}`;
  }

  private audit(
    input: { actorUserId: string; requestId: string },
    eventType: string,
    metadata: Record<string, unknown>,
  ): void {
    this.auditEvents.push({
      id: this.id(),
      actorUserId: input.actorUserId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      occurredAt: new Date(),
      metadata,
    });
  }
}
