export type PlatformSchoolStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export type PlatformSchool = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: PlatformSchoolStatus;
  createdAt: string;
  updatedAt: string;
};

export type PlatformPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  entitlements: Record<string, boolean | number | string>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSubscription = {
  id: string;
  schoolId: string;
  schoolName: string;
  planId: string;
  planCode: string;
  planName: string;
  entitlements: Record<string, boolean | number | string>;
  assignedByUserId: string;
  assignedAt: string;
  endedAt: string | null;
};

export type PlatformAuditEvent = {
  id: string;
  actorUserId: string | null;
  eventType: string;
  outcome: string;
  requestId: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type PlatformPage<T> = {
  data: T[];
  meta: { limit: number; offset: number; total: number };
};

export type PlatformSummary = {
  schools: Record<PlatformSchoolStatus, number>;
  activePlans: number;
  activeSubscriptions: number;
};

export type PlatformMfaStatus = {
  enrolled: boolean;
  sessionVerified: boolean;
};
