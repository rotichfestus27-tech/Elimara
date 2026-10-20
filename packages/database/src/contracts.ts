export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  status: "PENDING" | "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  mfaVerifiedAt: Date | null;
  user: UserRecord;
};

export type SchoolAccessRecord = {
  id: string;
  name: string;
  permissions: string[];
};

export type RateLimitResult = {
  emailHits: number;
  addressHits: number;
};

export interface IdentityStore {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  createSession(
    input: {
      userId: string;
      tokenHash: string;
      csrfTokenHash: string;
      expiresAt: Date;
    },
    requestId: string,
  ): Promise<void>;
  revokeSession(tokenHash: string, userId: string, now: Date, requestId: string): Promise<void>;
  revokeAllSessions(userId: string, now: Date): Promise<void>;
  createAccountToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  revokeAccountToken(tokenHash: string, now: Date): Promise<void>;
  completePasswordReset(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
    requestId: string;
  }): Promise<boolean>;
  recordAudit(input: {
    userId?: string;
    schoolId?: string;
    eventType: string;
    outcome: "SUCCESS" | "FAILURE";
    requestId: string;
  }): Promise<void>;
  getSchoolAccess(userId: string, schoolId: string): Promise<SchoolAccessRecord | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
  incrementLoginLimits(emailKey: string, addressKey: string, now: Date): Promise<RateLimitResult>;
}

export type AcademicRecordStatus = "ACTIVE" | "INACTIVE";
export type ConfigurationResource =
  | "academicYears"
  | "terms"
  | "classes"
  | "streams"
  | "subjects"
  | "classSubjects";

export type SchoolProfileRecord = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  updatedAt: Date;
};

export type AcademicYearRecord = {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type TermRecord = AcademicYearRecord & {
  academicYearId: string;
};

export type AcademicClassRecord = {
  id: string;
  academicYearId: string;
  name: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ClassStreamRecord = {
  id: string;
  classId: string;
  name: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type SubjectRecord = {
  id: string;
  name: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ClassSubjectRecord = {
  id: string;
  classId: string;
  subjectId: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ConfigurationRecord =
  | AcademicYearRecord
  | TermRecord
  | AcademicClassRecord
  | ClassStreamRecord
  | SubjectRecord
  | ClassSubjectRecord;

export type ConfigurationListQuery = {
  limit: number;
  offset: number;
  status?: AcademicRecordStatus;
  search?: string;
  parentId?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
};

export type ConfigurationPage = {
  items: ConfigurationRecord[];
  total: number;
};

export type SchoolProfileUpdate = {
  name?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

type ConfigurationAudit = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};

export type CreateConfigurationInput = ConfigurationAudit &
  (
    | {
        resource: "academicYears";
        data: { name: string; startsOn: string; endsOn: string };
      }
    | {
        resource: "terms";
        data: {
          academicYearId: string;
          name: string;
          startsOn: string;
          endsOn: string;
        };
      }
    | {
        resource: "classes";
        data: { academicYearId: string; name: string };
      }
    | {
        resource: "streams";
        data: { classId: string; name: string };
      }
    | {
        resource: "subjects";
        data: { name: string };
      }
    | {
        resource: "classSubjects";
        data: { classId: string; subjectId: string };
      }
  );

export type UpdateConfigurationInput = ConfigurationAudit &
  (
    | {
        resource: "academicYears";
        id: string;
        data: { name?: string; startsOn?: string; endsOn?: string };
      }
    | {
        resource: "terms";
        id: string;
        data: {
          name?: string;
          startsOn?: string;
          endsOn?: string;
        };
      }
    | {
        resource: "classes";
        id: string;
        data: { name?: string };
      }
    | {
        resource: "streams";
        id: string;
        data: { name?: string };
      }
    | {
        resource: "subjects";
        id: string;
        data: { name?: string };
      }
  );

export type DeactivateConfigurationInput = ConfigurationAudit & {
  resource: ConfigurationResource;
  id: string;
};

export type DeactivationOutcome = "DEACTIVATED" | "ALREADY_INACTIVE" | "NOT_FOUND";

export interface SchoolConfigurationStore {
  getSchoolProfile(schoolId: string): Promise<SchoolProfileRecord | null>;
  updateSchoolProfile(input: {
    schoolId: string;
    actorUserId: string;
    requestId: string;
    data: SchoolProfileUpdate;
  }): Promise<SchoolProfileRecord | null>;
  listConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    query: ConfigurationListQuery,
  ): Promise<ConfigurationPage>;
  getConfiguration(
    resource: ConfigurationResource,
    schoolId: string,
    id: string,
  ): Promise<ConfigurationRecord | null>;
  createConfiguration(input: CreateConfigurationInput): Promise<ConfigurationRecord>;
  updateConfiguration(input: UpdateConfigurationInput): Promise<ConfigurationRecord | null>;
  deactivateConfiguration(input: DeactivateConfigurationInput): Promise<DeactivationOutcome>;
}
