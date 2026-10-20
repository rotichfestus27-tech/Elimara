import type { DepartmentPageQuery, StaffPageQuery, StaffStore } from "@elimara/database";
import { StaffStoreError } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class StaffService {
  constructor(private readonly store: StaffStore) {}

  async listDepartments(schoolId: string, query: DepartmentPageQuery) {
    return this.run(() => this.store.listDepartments(schoolId, query));
  }

  async createDepartment(input: Parameters<StaffStore["createDepartment"]>[0]) {
    return this.run(() => this.store.createDepartment(input));
  }

  async updateDepartment(input: Parameters<StaffStore["updateDepartment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.updateDepartment(input);
      if (!result) throw notFound("department");
      return result;
    });
  }

  async deactivateDepartment(input: Parameters<StaffStore["deactivateDepartment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.deactivateDepartment(input);
      if (!result) throw notFound("department");
    });
  }

  async listStaff(schoolId: string, query: StaffPageQuery) {
    return this.run(() => this.store.listStaff(schoolId, query));
  }

  async getStaff(schoolId: string, id: string) {
    return this.run(async () => {
      const result = await this.store.getStaff(schoolId, id);
      if (!result) throw notFound("staff record");
      return result;
    });
  }

  async createStaff(input: Parameters<StaffStore["createStaff"]>[0]) {
    return this.run(() => this.store.createStaff(input));
  }

  async updateStaff(input: Parameters<StaffStore["updateStaff"]>[0]) {
    return this.run(async () => {
      const result = await this.store.updateStaff(input);
      if (!result) throw notFound("staff record");
      return result;
    });
  }

  async changeStaffStatus(input: Parameters<StaffStore["changeStaffStatus"]>[0]) {
    return this.run(async () => {
      const result = await this.store.changeStaffStatus(input);
      if (!result) throw notFound("staff record");
      return result;
    });
  }

  async listEmployments(
    schoolId: string,
    staffId: string,
    query: Parameters<StaffStore["listEmployments"]>[2],
  ) {
    return this.run(async () => {
      const result = await this.store.listEmployments(schoolId, staffId, query);
      if (!result) throw notFound("staff record");
      return result;
    });
  }

  async createEmployment(input: Parameters<StaffStore["createEmployment"]>[0]) {
    return this.run(() => this.store.createEmployment(input));
  }

  async endEmployment(input: Parameters<StaffStore["endEmployment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.endEmployment(input);
      if (!result) throw notFound("employment record");
      return result;
    });
  }

  async listAssignments(
    schoolId: string,
    staffId: string,
    query: Parameters<StaffStore["listAssignments"]>[2],
  ) {
    return this.run(async () => {
      const result = await this.store.listAssignments(schoolId, staffId, query);
      if (!result) throw notFound("staff record");
      return result;
    });
  }

  async createClassAssignment(input: Parameters<StaffStore["createClassAssignment"]>[0]) {
    return this.run(() => this.store.createClassAssignment(input));
  }

  async createSubjectAssignment(input: Parameters<StaffStore["createSubjectAssignment"]>[0]) {
    return this.run(() => this.store.createSubjectAssignment(input));
  }

  async endClassAssignment(input: Parameters<StaffStore["endClassAssignment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.endClassAssignment(input);
      if (!result) throw notFound("class assignment");
      return result;
    });
  }

  async endSubjectAssignment(input: Parameters<StaffStore["endSubjectAssignment"]>[0]) {
    return this.run(async () => {
      const result = await this.store.endSubjectAssignment(input);
      if (!result) throw notFound("subject assignment");
      return result;
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof StaffStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function mapStoreError(error: StaffStoreError): ApiError {
  switch (error.code) {
    case "NOT_FOUND":
    case "SCHOOL_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_RELATIONSHIP":
    case "INVALID_DATE_RANGE":
      return new ApiError(400, error.code, error.message);
    case "DUPLICATE":
    case "RECORD_INACTIVE":
    case "ACTIVE_STAFF_REMAINS":
    case "ACTIVE_EMPLOYMENT_REMAINS":
    case "ACTIVE_ASSIGNMENTS_REMAIN":
    case "ACTIVE_ASSESSMENTS_REMAIN":
    case "ACTIVE_TIMETABLE_ASSIGNMENTS_REMAIN":
    case "ALREADY_ENDED":
      return new ApiError(409, error.code, error.message);
  }
}

function notFound(resource: string): ApiError {
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${resource} was not found.`);
}
