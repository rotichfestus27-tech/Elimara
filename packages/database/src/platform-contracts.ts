export type PlatformSchoolStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export type PlatformSchoolRecord = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: PlatformSchoolStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PlatformSchoolListQuery = {
  limit: number;
  offset: number;
  status?: PlatformSchoolStatus;
  search?: string;
};

export type PlatformPage<T> = {
  items: T[];
  total: number;
};

export type PlatformSchoolWrite = {
  actorUserId: string;
  requestId: string;
};

export type CreatePlatformSchoolInput = PlatformSchoolWrite & {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
};

export type UpdatePlatformSchoolInput = PlatformSchoolWrite & {
  schoolId: string;
  name?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export type ChangePlatformSchoolStatusInput = PlatformSchoolWrite & {
  schoolId: string;
  status: PlatformSchoolStatus;
};

export type SaasPlanEntitlements = Record<string, boolean | number | string>;

export type SaasPlanRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  entitlements: SaasPlanEntitlements;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SaasPlanListQuery = {
  limit: number;
  offset: number;
  active?: boolean;
  search?: string;
};

export type CreateSaasPlanInput = PlatformSchoolWrite & {
  code: string;
  name: string;
  description?: string;
  entitlements: SaasPlanEntitlements;
};

export type UpdateSaasPlanInput = PlatformSchoolWrite & {
  planId: string;
  code?: string;
  name?: string;
  description?: string | null;
  entitlements?: SaasPlanEntitlements;
  active?: boolean;
};

export type SchoolSubscriptionRecord = {
  id: string;
  schoolId: string;
  schoolName: string;
  planId: string;
  planCode: string;
  planName: string;
  entitlements: SaasPlanEntitlements;
  assignedByUserId: string;
  assignedAt: Date;
  endedAt: Date | null;
};

export type PlatformAuditRecord = {
  id: string;
  actorUserId: string | null;
  eventType: string;
  outcome: string;
  requestId: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown>;
};

export type PlatformSummary = {
  schools: Record<PlatformSchoolStatus, number>;
  activePlans: number;
  activeSubscriptions: number;
};

export type PlatformMfaRecord = {
  passwordHash: string | null;
  active: boolean;
  revokedAt: Date | null;
  pendingTotpSecretEncrypted: string | null;
  pendingTotpSecretExpiresAt: Date | null;
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  totpLastUsedStep: number | null;
};

export type PlatformAuditQuery = {
  limit: number;
  offset: number;
};

export interface PlatformAdminStore {
  listSchools(query: PlatformSchoolListQuery): Promise<PlatformPage<PlatformSchoolRecord>>;
  getSchool(schoolId: string): Promise<PlatformSchoolRecord | null>;
  createSchool(input: CreatePlatformSchoolInput): Promise<PlatformSchoolRecord>;
  updateSchool(input: UpdatePlatformSchoolInput): Promise<PlatformSchoolRecord | null>;
  changeSchoolStatus(input: ChangePlatformSchoolStatusInput): Promise<PlatformSchoolRecord | null>;
  listPlans(query: SaasPlanListQuery): Promise<PlatformPage<SaasPlanRecord>>;
  getPlan(planId: string): Promise<SaasPlanRecord | null>;
  createPlan(input: CreateSaasPlanInput): Promise<SaasPlanRecord>;
  updatePlan(input: UpdateSaasPlanInput): Promise<SaasPlanRecord | null>;
  listSubscriptions(
    schoolId: string,
    query: PlatformAuditQuery,
  ): Promise<PlatformPage<SchoolSubscriptionRecord>>;
  assignPlan(
    input: PlatformSchoolWrite & { schoolId: string; planId: string },
  ): Promise<SchoolSubscriptionRecord>;
  endSubscription(
    input: PlatformSchoolWrite & { schoolId: string },
  ): Promise<SchoolSubscriptionRecord | null>;
  getSummary(): Promise<PlatformSummary>;
  listAuditEvents(query: PlatformAuditQuery): Promise<PlatformPage<PlatformAuditRecord>>;
  getPlatformMfa(userId: string): Promise<PlatformMfaRecord | null>;
  savePendingTotpSecret(
    input: PlatformSchoolWrite & {
      userId: string;
      secret: string;
      expiresAt: Date;
    },
  ): Promise<boolean>;
  completeTotpEnrollment(input: {
    actorUserId: string;
    sessionId: string;
    encryptedSecret: string;
    step: number;
    now: Date;
    requestId: string;
  }): Promise<boolean>;
  markTotpVerified(input: {
    actorUserId: string;
    sessionId: string;
    step: number;
    now: Date;
    requestId: string;
  }): Promise<boolean>;
}

export class PlatformAdminStoreError extends Error {
  constructor(
    readonly code:
      | "CONFLICT"
      | "INVALID_TRANSITION"
      | "PLATFORM_ADMIN_REQUIRED"
      | "CONCURRENT_CHANGE",
    message: string,
  ) {
    super(message);
    this.name = "PlatformAdminStoreError";
  }
}
