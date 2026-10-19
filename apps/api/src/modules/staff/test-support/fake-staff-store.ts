import { randomUUID } from "node:crypto";
import type {
  ChangeStaffStatusInput,
  CreateStaffClassAssignmentInput,
  CreateStaffDepartmentInput,
  CreateStaffEmploymentInput,
  CreateStaffInput,
  CreateStaffSubjectAssignmentInput,
  DepartmentPageQuery,
  DeactivateStaffDepartmentInput,
  EndStaffAssignmentInput,
  EndStaffEmploymentInput,
  StaffAssignmentRecord,
  StaffDepartmentRecord,
  StaffEmploymentRecord,
  StaffEntityPage,
  StaffHistoryPageQuery,
  StaffPageQuery,
  StaffRecord,
  StaffStore,
  UpdateStaffDepartmentInput,
  UpdateStaffInput,
} from "@elimara/database";
import { StaffStoreError } from "@elimara/database";

export class FakeStaffStore implements StaffStore {
  readonly departments = new Map<string, StaffDepartmentRecord>();
  readonly staff = new Map<string, StaffRecord>();
  readonly employments = new Map<string, StaffEmploymentRecord>();
  readonly assignments = new Map<string, StaffAssignmentRecord>();
  readonly classSubjectsWithUnpublishedAssessments = new Set<string>();
  private readonly departmentSchools = new Map<string, string>();
  private readonly staffSchools = new Map<string, string>();
  private readonly employmentSchools = new Map<string, string>();
  private readonly assignmentSchools = new Map<string, string>();
  private readonly assignmentStaffIds = new Map<string, string>();
  private readonly membershipsBySchool = new Map<string, Set<string>>();
  private readonly activeClasses = new Map<string, Set<string>>();
  private readonly activeStreams = new Map<string, Set<string>>();
  private readonly activeClassSubjects = new Map<string, Set<string>>();

  seedMembership(schoolId: string, userId: string): void {
    const memberships = this.membershipsBySchool.get(schoolId) ?? new Set<string>();
    memberships.add(userId);
    this.membershipsBySchool.set(schoolId, memberships);
  }

  seedClass(schoolId: string, classId: string): void {
    const classes = this.activeClasses.get(schoolId) ?? new Set<string>();
    classes.add(classId);
    this.activeClasses.set(schoolId, classes);
  }

  seedStream(schoolId: string, classId: string, streamId: string): void {
    this.seedClass(schoolId, classId);
    const streams = this.activeStreams.get(schoolId) ?? new Set<string>();
    streams.add(`${classId}:${streamId}`);
    this.activeStreams.set(schoolId, streams);
  }

  seedClassSubject(schoolId: string, classSubjectAssignmentId: string): void {
    const assignments = this.activeClassSubjects.get(schoolId) ?? new Set<string>();
    assignments.add(classSubjectAssignmentId);
    this.activeClassSubjects.set(schoolId, assignments);
  }

  async listDepartments(
    schoolId: string,
    query: DepartmentPageQuery,
  ): Promise<StaffEntityPage<StaffDepartmentRecord>> {
    const matching = [...this.departments.values()]
      .filter((item) => this.departmentSchools.get(item.id) === schoolId)
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) => !query.search || item.name.toLowerCase().includes(query.search.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name) * (query.sortOrder === "asc" ? 1 : -1));
    return {
      items: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
    };
  }

  async createDepartment(input: CreateStaffDepartmentInput): Promise<StaffDepartmentRecord> {
    if (this.departmentNameExists(input.schoolId, input.name)) throw duplicate();
    const now = new Date();
    const item = {
      id: randomUUID(),
      name: input.name,
      status: "ACTIVE" as const,
      createdAt: now,
      updatedAt: now,
    };
    this.departments.set(item.id, item);
    this.departmentSchools.set(item.id, input.schoolId);
    return item;
  }

  async updateDepartment(input: UpdateStaffDepartmentInput): Promise<StaffDepartmentRecord | null> {
    const item = this.departments.get(input.id);
    if (
      !item ||
      this.departmentSchools.get(input.id) !== input.schoolId ||
      item.status !== "ACTIVE"
    )
      return null;
    if (this.departmentNameExists(input.schoolId, input.name, input.id)) throw duplicate();
    const updated = { ...item, name: input.name, updatedAt: new Date() };
    this.departments.set(item.id, updated);
    return updated;
  }

  async deactivateDepartment(input: DeactivateStaffDepartmentInput): Promise<boolean> {
    const item = this.departments.get(input.id);
    if (
      !item ||
      this.departmentSchools.get(input.id) !== input.schoolId ||
      item.status !== "ACTIVE"
    )
      return false;
    if (
      [...this.staff.values()].some(
        (staff) => staff.departmentId === item.id && staff.status === "ACTIVE",
      )
    ) {
      throw new StaffStoreError("ACTIVE_STAFF_REMAINS", "Reassign active staff first.");
    }
    this.departments.set(item.id, { ...item, status: "INACTIVE", updatedAt: new Date() });
    return true;
  }

  async listStaff(schoolId: string, query: StaffPageQuery): Promise<StaffEntityPage<StaffRecord>> {
    const matching = [...this.staff.values()]
      .filter((item) => this.staffSchools.get(item.id) === schoolId)
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.departmentId || item.departmentId === query.departmentId)
      .filter(
        (item) =>
          !query.search ||
          `${item.staffNumber} ${item.givenName} ${item.familyName}`
            .toLowerCase()
            .includes(query.search.toLowerCase()),
      )
      .sort(
        (a, b) =>
          String(a[query.sortBy]).localeCompare(String(b[query.sortBy])) *
          (query.sortOrder === "asc" ? 1 : -1),
      );
    return {
      items: matching.slice(query.offset, query.offset + query.limit),
      total: matching.length,
    };
  }

  async getStaff(schoolId: string, id: string): Promise<StaffRecord | null> {
    return this.staffSchools.get(id) === schoolId ? (this.staff.get(id) ?? null) : null;
  }

  async createStaff(input: CreateStaffInput): Promise<StaffRecord> {
    this.assertDepartment(input.schoolId, input.departmentId);
    this.assertMembership(input.schoolId, input.userId);
    if (
      [...this.staff.values()].some(
        (item) =>
          this.staffSchools.get(item.id) === input.schoolId &&
          item.staffNumber.toUpperCase() === input.staffNumber.toUpperCase(),
      )
    ) {
      throw duplicate();
    }
    if (
      input.userId &&
      [...this.staff.values()].some(
        (item) => this.staffSchools.get(item.id) === input.schoolId && item.userId === input.userId,
      )
    ) {
      throw duplicate();
    }
    const now = new Date();
    const department = input.departmentId
      ? (this.departments.get(input.departmentId) ?? null)
      : null;
    const item: StaffRecord = {
      id: randomUUID(),
      staffNumber: input.staffNumber,
      givenName: input.givenName,
      middleName: input.middleName ?? null,
      familyName: input.familyName,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      positionTitle: input.positionTitle,
      departmentId: input.departmentId ?? null,
      department,
      userId: input.userId ?? null,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.staff.set(item.id, item);
    this.staffSchools.set(item.id, input.schoolId);
    return item;
  }

  async updateStaff(input: UpdateStaffInput): Promise<StaffRecord | null> {
    const current = this.staff.get(input.id);
    if (!current || this.staffSchools.get(input.id) !== input.schoolId) return null;
    const departmentId =
      input.departmentId === undefined ? current.departmentId : input.departmentId;
    const userId = input.userId === undefined ? current.userId : input.userId;
    this.assertDepartment(input.schoolId, departmentId);
    this.assertMembership(input.schoolId, userId);
    if (
      input.staffNumber &&
      [...this.staff.values()].some(
        (item) =>
          item.id !== input.id &&
          this.staffSchools.get(item.id) === input.schoolId &&
          item.staffNumber.toUpperCase() === input.staffNumber?.toUpperCase(),
      )
    ) {
      throw duplicate();
    }
    const department = departmentId ? (this.departments.get(departmentId) ?? null) : null;
    const updated = {
      ...current,
      ...input,
      departmentId,
      userId,
      department,
      updatedAt: new Date(),
    };
    this.staff.set(input.id, updated);
    return updated;
  }

  async changeStaffStatus(input: ChangeStaffStatusInput): Promise<StaffRecord | null> {
    const current = this.staff.get(input.id);
    if (!current || this.staffSchools.get(input.id) !== input.schoolId) return null;
    if (input.status === "ACTIVE" && current.departmentId) {
      const department = this.departments.get(current.departmentId);
      if (!department || department.status !== "ACTIVE") {
        throw new StaffStoreError(
          "RECORD_INACTIVE",
          "Reassign staff to an active department first.",
        );
      }
    }
    if (input.status === "INACTIVE") {
      if (
        [...this.employments.values()].some(
          (item) => item.staffId === input.id && item.endsOn === null,
        )
      ) {
        throw new StaffStoreError("ACTIVE_EMPLOYMENT_REMAINS", "End active employment first.");
      }
      if (
        [...this.assignments.values()].some(
          (item) => this.assignmentStaffIds.get(item.id) === input.id && item.endedAt === null,
        )
      ) {
        throw new StaffStoreError("ACTIVE_ASSIGNMENTS_REMAIN", "End active assignments first.");
      }
    }
    const updated = { ...current, status: input.status, updatedAt: new Date() };
    this.staff.set(input.id, updated);
    return updated;
  }

  async listEmployments(
    schoolId: string,
    staffId: string,
    query: StaffHistoryPageQuery,
  ): Promise<StaffEntityPage<StaffEmploymentRecord> | null> {
    if (this.staffSchools.get(staffId) !== schoolId) return null;
    const items = [...this.employments.values()]
      .filter(
        (item) => this.employmentSchools.get(item.id) === schoolId && item.staffId === staffId,
      )
      .sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime());
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async createEmployment(input: CreateStaffEmploymentInput): Promise<StaffEmploymentRecord> {
    const staff = await this.getStaff(input.schoolId, input.staffId);
    if (!staff) throw notFound();
    if (staff.status !== "ACTIVE")
      throw new StaffStoreError("RECORD_INACTIVE", "Staff is inactive.");
    if (
      [...this.employments.values()].some(
        (item) => item.staffId === input.staffId && item.endsOn === null,
      )
    )
      throw duplicate();
    const item: StaffEmploymentRecord = {
      id: randomUUID(),
      staffId: input.staffId,
      positionTitle: input.positionTitle,
      startsOn: asDate(input.startsOn),
      endsOn: null,
      createdAt: new Date(),
    };
    this.employments.set(item.id, item);
    this.employmentSchools.set(item.id, input.schoolId);
    return item;
  }

  async endEmployment(input: EndStaffEmploymentInput): Promise<StaffEmploymentRecord | null> {
    const current = this.employments.get(input.employmentId);
    if (
      !current ||
      this.employmentSchools.get(current.id) !== input.schoolId ||
      current.staffId !== input.staffId
    )
      return null;
    if (current.endsOn) throw new StaffStoreError("ALREADY_ENDED", "Employment already ended.");
    const endsOn = asDate(input.endsOn);
    if (endsOn < current.startsOn)
      throw new StaffStoreError("INVALID_DATE_RANGE", "End date precedes start date.");
    const updated = { ...current, endsOn };
    this.employments.set(updated.id, updated);
    return updated;
  }

  async listAssignments(
    schoolId: string,
    staffId: string,
    query: StaffHistoryPageQuery,
  ): Promise<StaffEntityPage<StaffAssignmentRecord> | null> {
    if (this.staffSchools.get(staffId) !== schoolId) return null;
    const items = [...this.assignments.values()].filter(
      (item) =>
        this.assignmentSchools.get(item.id) === schoolId &&
        this.assignmentStaffIds.get(item.id) === staffId,
    );
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async createClassAssignment(
    input: CreateStaffClassAssignmentInput,
  ): Promise<StaffAssignmentRecord> {
    const staff = await this.getStaff(input.schoolId, input.staffId);
    if (!staff) throw notFound();
    if (staff.status !== "ACTIVE")
      throw new StaffStoreError("RECORD_INACTIVE", "Staff is inactive.");
    if (!this.activeClasses.get(input.schoolId)?.has(input.classId)) throw invalidRelationship();
    if (
      input.streamId &&
      !this.activeStreams.get(input.schoolId)?.has(`${input.classId}:${input.streamId}`)
    )
      throw invalidRelationship();
    const duplicateActive = [...this.assignments.values()].some(
      (item) =>
        item.kind === "CLASS" &&
        item.classId === input.classId &&
        item.streamId === (input.streamId ?? null) &&
        this.assignmentStaffIds.get(item.id) === input.staffId &&
        item.endedAt === null,
    );
    if (duplicateActive) throw duplicate();
    const item: StaffAssignmentRecord = {
      kind: "CLASS",
      id: randomUUID(),
      classId: input.classId,
      streamId: input.streamId ?? null,
      createdAt: new Date(),
      endedAt: null,
    };
    this.saveAssignment(input.schoolId, input.staffId, item);
    return item;
  }

  async createSubjectAssignment(
    input: CreateStaffSubjectAssignmentInput,
  ): Promise<StaffAssignmentRecord> {
    const staff = await this.getStaff(input.schoolId, input.staffId);
    if (!staff) throw notFound();
    if (staff.status !== "ACTIVE")
      throw new StaffStoreError("RECORD_INACTIVE", "Staff is inactive.");
    if (!this.activeClassSubjects.get(input.schoolId)?.has(input.classSubjectAssignmentId))
      throw invalidRelationship();
    if (
      [...this.assignments.values()].some(
        (item) =>
          item.kind === "SUBJECT" &&
          item.classSubjectAssignmentId === input.classSubjectAssignmentId &&
          this.assignmentStaffIds.get(item.id) === input.staffId &&
          item.endedAt === null,
      )
    ) {
      throw duplicate();
    }
    const item: StaffAssignmentRecord = {
      kind: "SUBJECT",
      id: randomUUID(),
      classSubjectAssignmentId: input.classSubjectAssignmentId,
      createdAt: new Date(),
      endedAt: null,
    };
    this.saveAssignment(input.schoolId, input.staffId, item);
    return item;
  }

  async endClassAssignment(input: EndStaffAssignmentInput): Promise<StaffAssignmentRecord | null> {
    return this.endAssignment(input, "CLASS");
  }

  async endSubjectAssignment(
    input: EndStaffAssignmentInput,
  ): Promise<StaffAssignmentRecord | null> {
    return this.endAssignment(input, "SUBJECT");
  }

  private async endAssignment(input: EndStaffAssignmentInput, kind: "CLASS" | "SUBJECT") {
    const current = this.assignments.get(input.assignmentId);
    if (
      !current ||
      this.assignmentSchools.get(current.id) !== input.schoolId ||
      this.assignmentStaffIds.get(current.id) !== input.staffId ||
      current.kind !== kind
    )
      return null;
    if (current.endedAt) throw new StaffStoreError("ALREADY_ENDED", "Assignment already ended.");
    if (
      kind === "SUBJECT" &&
      current.kind === "SUBJECT" &&
      current.classSubjectAssignmentId &&
      this.classSubjectsWithUnpublishedAssessments.has(current.classSubjectAssignmentId)
    ) {
      throw new StaffStoreError(
        "ACTIVE_ASSESSMENTS_REMAIN",
        "An active subject assignment is required until its assessments are published.",
      );
    }
    const endedAt = new Date();
    const updated = { ...current, endedAt };
    this.assignments.set(updated.id, updated);
    return updated;
  }

  private saveAssignment(
    schoolId: string,
    staffId: string,
    assignment: StaffAssignmentRecord,
  ): void {
    this.assignments.set(assignment.id, assignment);
    this.assignmentSchools.set(assignment.id, schoolId);
    this.assignmentStaffIds.set(assignment.id, staffId);
  }

  private assertDepartment(schoolId: string, departmentId: string | null | undefined): void {
    if (!departmentId) return;
    const department = this.departments.get(departmentId);
    if (
      !department ||
      this.departmentSchools.get(departmentId) !== schoolId ||
      department.status !== "ACTIVE"
    ) {
      throw invalidRelationship();
    }
  }

  private assertMembership(schoolId: string, userId: string | null | undefined): void {
    if (userId && !this.membershipsBySchool.get(schoolId)?.has(userId)) throw invalidRelationship();
  }

  private departmentNameExists(schoolId: string, name: string, exceptId?: string): boolean {
    return [...this.departments.values()].some(
      (item) =>
        item.id !== exceptId &&
        this.departmentSchools.get(item.id) === schoolId &&
        item.name.toLowerCase() === name.toLowerCase(),
    );
  }
}

function duplicate(): StaffStoreError {
  return new StaffStoreError("DUPLICATE", "A duplicate record exists.");
}

function notFound(): StaffStoreError {
  return new StaffStoreError("NOT_FOUND", "The staff record was not found.");
}

function invalidRelationship(): StaffStoreError {
  return new StaffStoreError("INVALID_RELATIONSHIP", "The selected relationship is invalid.");
}

function asDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new StaffStoreError("INVALID_DATE_RANGE", "The supplied date is invalid.");
  }
  return date;
}
