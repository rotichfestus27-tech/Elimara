import type { AcademicRecordStatus } from "./contracts.js";

export type StaffStatus = "ACTIVE" | "INACTIVE";

export type StaffDepartmentRecord = {
  id: string;
  name: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffRecord = {
  id: string;
  staffNumber: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  positionTitle: string;
  departmentId: string | null;
  department: StaffDepartmentRecord | null;
  userId: string | null;
  status: StaffStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffEmploymentRecord = {
  id: string;
  staffId: string;
  positionTitle: string;
  startsOn: Date;
  endsOn: Date | null;
  createdAt: Date;
};

export type StaffAssignmentRecord =
  | {
      kind: "CLASS";
      id: string;
      classId: string;
      streamId: string | null;
      createdAt: Date;
      endedAt: Date | null;
    }
  | {
      kind: "SUBJECT";
      id: string;
      classSubjectAssignmentId: string;
      createdAt: Date;
      endedAt: Date | null;
    };

export type StaffPageQuery = {
  limit: number;
  offset: number;
  status?: StaffStatus;
  departmentId?: string;
  search?: string;
  sortBy: "staffNumber" | "familyName" | "createdAt";
  sortOrder: "asc" | "desc";
};

export type DepartmentPageQuery = {
  limit: number;
  offset: number;
  status?: AcademicRecordStatus;
  search?: string;
  sortOrder: "asc" | "desc";
};

export type StaffEntityPage<T> = { items: T[]; total: number };

export type StaffHistoryPageQuery = { limit: number; offset: number };

export type StaffWriteContext = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};

export type CreateStaffDepartmentInput = StaffWriteContext & { name: string };
export type UpdateStaffDepartmentInput = StaffWriteContext & { id: string; name: string };
export type DeactivateStaffDepartmentInput = StaffWriteContext & { id: string };

export type CreateStaffInput = StaffWriteContext & {
  staffNumber: string;
  givenName: string;
  middleName?: string | null;
  familyName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  positionTitle: string;
  departmentId?: string | null;
  userId?: string | null;
};

export type UpdateStaffInput = StaffWriteContext & {
  id: string;
  staffNumber?: string;
  givenName?: string;
  middleName?: string | null;
  familyName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  positionTitle?: string;
  departmentId?: string | null;
  userId?: string | null;
};

export type ChangeStaffStatusInput = StaffWriteContext & {
  id: string;
  status: StaffStatus;
};

export type CreateStaffEmploymentInput = StaffWriteContext & {
  staffId: string;
  positionTitle: string;
  startsOn: string;
};

export type EndStaffEmploymentInput = StaffWriteContext & {
  staffId: string;
  employmentId: string;
  endsOn: string;
};

export type CreateStaffClassAssignmentInput = StaffWriteContext & {
  staffId: string;
  classId: string;
  streamId?: string;
};

export type CreateStaffSubjectAssignmentInput = StaffWriteContext & {
  staffId: string;
  classSubjectAssignmentId: string;
};

export type EndStaffAssignmentInput = StaffWriteContext & {
  staffId: string;
  assignmentId: string;
};

export interface StaffStore {
  listDepartments(
    schoolId: string,
    query: DepartmentPageQuery,
  ): Promise<StaffEntityPage<StaffDepartmentRecord>>;
  createDepartment(input: CreateStaffDepartmentInput): Promise<StaffDepartmentRecord>;
  updateDepartment(input: UpdateStaffDepartmentInput): Promise<StaffDepartmentRecord | null>;
  deactivateDepartment(input: DeactivateStaffDepartmentInput): Promise<boolean>;
  listStaff(schoolId: string, query: StaffPageQuery): Promise<StaffEntityPage<StaffRecord>>;
  getStaff(schoolId: string, id: string): Promise<StaffRecord | null>;
  createStaff(input: CreateStaffInput): Promise<StaffRecord>;
  updateStaff(input: UpdateStaffInput): Promise<StaffRecord | null>;
  changeStaffStatus(input: ChangeStaffStatusInput): Promise<StaffRecord | null>;
  listEmployments(
    schoolId: string,
    staffId: string,
    query: StaffHistoryPageQuery,
  ): Promise<StaffEntityPage<StaffEmploymentRecord> | null>;
  createEmployment(input: CreateStaffEmploymentInput): Promise<StaffEmploymentRecord>;
  endEmployment(input: EndStaffEmploymentInput): Promise<StaffEmploymentRecord | null>;
  listAssignments(
    schoolId: string,
    staffId: string,
    query: StaffHistoryPageQuery,
  ): Promise<StaffEntityPage<StaffAssignmentRecord> | null>;
  createClassAssignment(input: CreateStaffClassAssignmentInput): Promise<StaffAssignmentRecord>;
  createSubjectAssignment(input: CreateStaffSubjectAssignmentInput): Promise<StaffAssignmentRecord>;
  endClassAssignment(input: EndStaffAssignmentInput): Promise<StaffAssignmentRecord | null>;
  endSubjectAssignment(input: EndStaffAssignmentInput): Promise<StaffAssignmentRecord | null>;
}
