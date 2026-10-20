import { OperationsStoreError, type SchoolOperationsStore } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class TimetableService {
  constructor(private readonly store: SchoolOperationsStore) {}

  listPeriods(schoolId: string) {
    return this.run(() => this.store.listPeriods(schoolId));
  }

  createPeriod(input: Parameters<SchoolOperationsStore["createPeriod"]>[0]) {
    return this.run(() => this.store.createPeriod(input));
  }

  listRooms(schoolId: string) {
    return this.run(() => this.store.listRooms(schoolId));
  }

  createRoom(input: Parameters<SchoolOperationsStore["createRoom"]>[0]) {
    return this.run(() => this.store.createRoom(input));
  }

  async listAvailability(schoolId: string, staffId: string) {
    return this.run(async () => {
      const result = await this.store.listAvailability(schoolId, staffId);
      if (!result) throw notFound("active staff member");
      return result;
    });
  }

  addAvailability(input: Parameters<SchoolOperationsStore["addAvailability"]>[0]) {
    return this.run(() => this.store.addAvailability(input));
  }

  listTimetables(schoolId: string, academicYearId: string) {
    return this.run(() => this.store.listTimetables(schoolId, academicYearId));
  }

  createTimetable(input: Parameters<SchoolOperationsStore["createTimetable"]>[0]) {
    return this.run(() => this.store.createTimetable(input));
  }

  async listLessons(schoolId: string, timetableId: string) {
    return this.run(async () => {
      const result = await this.store.listLessons(schoolId, timetableId);
      if (!result) throw notFound("timetable");
      return result;
    });
  }

  createLesson(input: Parameters<SchoolOperationsStore["createLesson"]>[0]) {
    return this.run(() => this.store.createLesson(input));
  }

  async updateLesson(input: Parameters<SchoolOperationsStore["updateLesson"]>[0]) {
    return this.run(async () => {
      const result = await this.store.updateLesson(input);
      if (!result) throw notFound("timetable lesson");
      return result;
    });
  }

  async publish(input: Parameters<SchoolOperationsStore["publishTimetable"]>[0]) {
    return this.run(async () => {
      const result = await this.store.publishTimetable(input);
      if (!result) throw notFound("timetable");
      return result;
    });
  }

  async unpublish(input: Parameters<SchoolOperationsStore["unpublishTimetable"]>[0]) {
    return this.run(async () => {
      const result = await this.store.unpublishTimetable(input);
      if (!result) throw notFound("published timetable");
      return result;
    });
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
