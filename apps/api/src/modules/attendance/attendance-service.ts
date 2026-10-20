import { OperationsStoreError, type SchoolOperationsStore } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class AttendanceService {
  constructor(private readonly store: SchoolOperationsStore) {}

  listReasons(schoolId: string) {
    return this.run(() => this.store.listAbsenceReasons(schoolId));
  }

  createReason(input: Parameters<SchoolOperationsStore["createAbsenceReason"]>[0]) {
    return this.run(() => this.store.createAbsenceReason(input));
  }

  async deactivateReason(input: Parameters<SchoolOperationsStore["deactivateAbsenceReason"]>[0]) {
    return this.run(async () => {
      if (!(await this.store.deactivateAbsenceReason(input))) throw notFound("absence reason");
    });
  }

  listRegisters(
    schoolId: string,
    query: Parameters<SchoolOperationsStore["listAttendanceRegisters"]>[1],
  ) {
    return this.run(() => this.store.listAttendanceRegisters(schoolId, query));
  }

  createRegister(input: Parameters<SchoolOperationsStore["createAttendanceRegister"]>[0]) {
    return this.run(() => this.store.createAttendanceRegister(input));
  }

  async listRecords(schoolId: string, registerId: string) {
    return this.run(async () => {
      const result = await this.store.listAttendanceRecords(schoolId, registerId);
      if (!result) throw notFound("attendance register");
      return result;
    });
  }

  record(input: Parameters<SchoolOperationsStore["recordAttendance"]>[0]) {
    return this.run(() => this.store.recordAttendance(input));
  }

  async correct(input: Parameters<SchoolOperationsStore["correctAttendance"]>[0]) {
    return this.run(async () => {
      const result = await this.store.correctAttendance(input);
      if (!result) throw notFound("attendance record");
      return result;
    });
  }

  async finalize(input: Parameters<SchoolOperationsStore["finalizeAttendanceRegister"]>[0]) {
    return this.run(async () => {
      const result = await this.store.finalizeAttendanceRegister(input);
      if (!result) throw notFound("open attendance register");
      return result;
    });
  }

  summary(schoolId: string, query: Parameters<SchoolOperationsStore["attendanceSummary"]>[1]) {
    return this.run(() => this.store.attendanceSummary(schoolId, query));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OperationsStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function mapStoreError(error: OperationsStoreError): ApiError {
  switch (error.code) {
    case "NOT_FOUND":
    case "SCHOOL_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_RELATIONSHIP":
    case "INVALID_DATE_RANGE":
    case "INVALID_STATUS":
      return new ApiError(400, error.code, error.message);
    case "DUPLICATE":
    case "REGISTER_FINALIZED":
      return new ApiError(409, error.code, error.message);
    case "TIMETABLE_PUBLISHED":
    case "TIMETABLE_CONFLICT":
    case "STAFF_UNAVAILABLE":
    case "ROOM_CAPACITY":
    case "ALREADY_PUBLISHED":
      return new ApiError(409, error.code, error.message);
  }
}

function notFound(resource: string): ApiError {
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${resource} was not found.`);
}
