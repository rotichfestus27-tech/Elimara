export type AdmissionApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "ADMITTED";

export type StudentStatus = "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "WITHDRAWN";

export type ApplicationGuardianInput =
  | {
      existingGuardianId: string;
      relationship: string;
      authorizedAccess: boolean;
    }
  | {
      givenName: string;
      middleName?: string | null;
      familyName: string;
      email?: string | null;
      phone?: string | null;
      relationship: string;
      authorizedAccess: boolean;
    };

export type ApplicationPersonData = {
  givenName: string;
  middleName?: string | null;
  familyName: string;
  dateOfBirth?: string | null;
  guardians: ApplicationGuardianInput[];
};

export type AdmissionApplicationRecord = {
  id: string;
  status: AdmissionApplicationStatus;
  possibleDuplicate: boolean;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: Date | null;
  guardians: Array<{
    id: string;
    guardianId: string | null;
    givenName: string;
    middleName: string | null;
    familyName: string;
    email: string | null;
    phone: string | null;
    relationship: string;
    authorizedAccess: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  withdrawnAt: Date | null;
  admittedAt: Date | null;
  studentId: string | null;
};

export type GuardianRecord = {
  id: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StudentProfileRevisionRecord = {
  id: string;
  studentId: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: Date | null;
  recordedAt: Date;
};

export type GuardianProfileRevisionRecord = {
  id: string;
  guardianId: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  email: string | null;
  phone: string | null;
  recordedAt: Date;
};

export type StudentRecord = {
  id: string;
  admissionNumber: string;
  admissionYearId: string;
  admissionApplicationId: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: Date | null;
  status: StudentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type StudentPlacementRecord = {
  id: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  streamId: string | null;
  startedAt: Date;
  endedAt: Date | null;
};

export type StudentGuardianRecord = {
  id: string;
  studentId: string;
  guardianId: string;
  relationship: string;
  authorizedAccess: boolean;
  guardian: GuardianRecord;
};

export type AdmissionApplicationPageQuery = {
  limit: number;
  offset: number;
  status?: AdmissionApplicationStatus;
  search?: string;
  sortBy: "createdAt" | "updatedAt" | "status";
  sortOrder: "asc" | "desc";
};

export type StudentPageQuery = {
  limit: number;
  offset: number;
  status?: StudentStatus;
  search?: string;
  sortBy: "admissionNumber" | "familyName" | "createdAt";
  sortOrder: "asc" | "desc";
};

export type GuardianPageQuery = {
  limit: number;
  offset: number;
  search?: string;
  sortBy: "familyName" | "createdAt";
  sortOrder: "asc" | "desc";
};

export type ProfileHistoryQuery = {
  limit: number;
  offset: number;
};

export type EntityPage<T> = { items: T[]; total: number };

export type ApplicationWriteContext = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};

export type CreateAdmissionApplicationInput = ApplicationWriteContext &
  ApplicationPersonData & {
    idempotencyKey: string;
    requestFingerprint: string;
  };

export type UpdateAdmissionApplicationInput = ApplicationWriteContext &
  ApplicationPersonData & { id: string };

export type ApplicationTransitionInput = ApplicationWriteContext & {
  id: string;
  transition: "submit" | "review" | "accept" | "reject" | "withdraw";
};

export type AdmitApplicationInput = ApplicationWriteContext & {
  id: string;
  academicYearId: string;
  classId: string;
  streamId?: string;
};

export type AdmitApplicationResult = {
  student: StudentRecord;
  replayed: boolean;
};

export type UpdateStudentProfileInput = ApplicationWriteContext & {
  id: string;
  givenName?: string;
  middleName?: string | null;
  familyName?: string;
  dateOfBirth?: string | null;
};

export type ChangeStudentStatusInput = ApplicationWriteContext & {
  id: string;
  status: Exclude<StudentStatus, "ACTIVE">;
};

export type CreateGuardianInput = ApplicationWriteContext & {
  givenName: string;
  middleName?: string | null;
  familyName: string;
  email?: string | null;
  phone?: string | null;
};

export type UpdateGuardianInput = ApplicationWriteContext & {
  id: string;
  givenName?: string;
  middleName?: string | null;
  familyName?: string;
  email?: string | null;
  phone?: string | null;
};

export type UpdateStudentGuardianInput = ApplicationWriteContext & {
  studentId: string;
  guardianId: string;
  relationship?: string;
  authorizedAccess?: boolean;
};

export type CreateStudentGuardianInput = ApplicationWriteContext & {
  studentId: string;
  guardianId: string;
  relationship: string;
  authorizedAccess: boolean;
};

export interface AdmissionsStore {
  createApplication(input: CreateAdmissionApplicationInput): Promise<AdmissionApplicationRecord>;
  listApplications(
    schoolId: string,
    query: AdmissionApplicationPageQuery,
  ): Promise<EntityPage<AdmissionApplicationRecord>>;
  getApplication(schoolId: string, id: string): Promise<AdmissionApplicationRecord | null>;
  updateDraftApplication(
    input: UpdateAdmissionApplicationInput,
  ): Promise<AdmissionApplicationRecord | null>;
  transitionApplication(
    input: ApplicationTransitionInput,
  ): Promise<AdmissionApplicationRecord | null>;
  admitApplication(input: AdmitApplicationInput): Promise<AdmitApplicationResult | null>;
  listStudents(schoolId: string, query: StudentPageQuery): Promise<EntityPage<StudentRecord>>;
  getStudent(schoolId: string, id: string): Promise<StudentRecord | null>;
  updateStudentProfile(input: UpdateStudentProfileInput): Promise<StudentRecord | null>;
  changeStudentStatus(input: ChangeStudentStatusInput): Promise<StudentRecord | null>;
  listGuardians(schoolId: string, query: GuardianPageQuery): Promise<EntityPage<GuardianRecord>>;
  getGuardian(schoolId: string, id: string): Promise<GuardianRecord | null>;
  createGuardian(input: CreateGuardianInput): Promise<GuardianRecord>;
  updateGuardian(input: UpdateGuardianInput): Promise<GuardianRecord | null>;
  listStudentGuardians(
    schoolId: string,
    studentId: string,
  ): Promise<StudentGuardianRecord[] | null>;
  createStudentGuardian(input: CreateStudentGuardianInput): Promise<StudentGuardianRecord>;
  updateStudentGuardian(input: UpdateStudentGuardianInput): Promise<StudentGuardianRecord | null>;
  listStudentPlacements(
    schoolId: string,
    studentId: string,
  ): Promise<StudentPlacementRecord[] | null>;
  listStudentProfileRevisions(
    schoolId: string,
    studentId: string,
    query: ProfileHistoryQuery,
  ): Promise<EntityPage<StudentProfileRevisionRecord> | null>;
  listGuardianProfileRevisions(
    schoolId: string,
    guardianId: string,
    query: ProfileHistoryQuery,
  ): Promise<EntityPage<GuardianProfileRevisionRecord> | null>;
}
