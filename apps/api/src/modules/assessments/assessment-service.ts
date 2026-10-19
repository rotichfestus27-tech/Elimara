import { AssessmentStoreError, type AssessmentStore } from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";

export class AssessmentService {
  constructor(private readonly store: AssessmentStore) {}

  listGradingScales(schoolId: string) {
    return this.run(() => this.store.listGradingScales(schoolId));
  }

  createGradingScale(input: Parameters<AssessmentStore["createGradingScale"]>[0]) {
    return this.run(() => this.store.createGradingScale(input));
  }

  async deactivateGradingScale(input: Parameters<AssessmentStore["deactivateGradingScale"]>[0]) {
    return this.run(async () => {
      if (!(await this.store.deactivateGradingScale(input))) throw notFound("grading scale");
    });
  }

  listAssessments(schoolId: string, query: Parameters<AssessmentStore["listAssessments"]>[1]) {
    return this.run(() => this.store.listAssessments(schoolId, query));
  }

  async getAssessment(schoolId: string, assessmentId: string) {
    return this.run(async () => {
      const item = await this.store.getAssessment(schoolId, assessmentId);
      if (!item) throw notFound("assessment");
      return item;
    });
  }

  createAssessment(input: Parameters<AssessmentStore["createAssessment"]>[0]) {
    return this.run(() => this.store.createAssessment(input));
  }

  async updateDraftAssessment(input: Parameters<AssessmentStore["updateDraftAssessment"]>[0]) {
    return this.run(async () => {
      const item = await this.store.updateDraftAssessment(input);
      if (!item) throw notFound("assessment");
      return item;
    });
  }

  async openAssessment(input: Parameters<AssessmentStore["openAssessment"]>[0]) {
    return this.withAssessment(() => this.store.openAssessment(input));
  }

  async submitForModeration(input: Parameters<AssessmentStore["submitForModeration"]>[0]) {
    return this.withAssessment(() => this.store.submitForModeration(input));
  }

  async finalizeAssessment(input: Parameters<AssessmentStore["finalizeAssessment"]>[0]) {
    return this.withAssessment(() => this.store.finalizeAssessment(input));
  }

  async publishAssessment(input: Parameters<AssessmentStore["publishAssessment"]>[0]) {
    return this.withAssessment(() => this.store.publishAssessment(input));
  }

  async reopenAssessment(input: Parameters<AssessmentStore["reopenAssessment"]>[0]) {
    return this.withAssessment(() => this.store.reopenAssessment(input));
  }

  async listResults(
    schoolId: string,
    assessmentId: string,
    query: { limit: number; offset: number },
  ) {
    return this.run(async () => {
      const result = await this.store.listResults(schoolId, assessmentId, query);
      if (!result) throw notFound("assessment");
      return result;
    });
  }

  enterResults(input: Parameters<AssessmentStore["enterResults"]>[0]) {
    return this.run(async () => {
      const result = await this.store.enterResults(input);
      if (result.length === 0) throw notFound("assessment");
      return result;
    });
  }

  async correctResult(input: Parameters<AssessmentStore["correctResult"]>[0]) {
    return this.run(async () => {
      const result = await this.store.correctResult(input);
      if (!result) throw notFound("assessment result");
      return result;
    });
  }

  async reportCard(
    schoolId: string,
    studentId: string,
    query: Parameters<AssessmentStore["reportCard"]>[2],
  ) {
    return this.run(async () => {
      const result = await this.store.reportCard(schoolId, studentId, query);
      if (!result) throw notFound("student");
      return result;
    });
  }

  academicSummary(schoolId: string, query: Parameters<AssessmentStore["academicSummary"]>[1]) {
    return this.run(() => this.store.academicSummary(schoolId, query));
  }

  private async withAssessment<T>(operation: () => Promise<T | null>): Promise<T> {
    return this.run(async () => {
      const result = await operation();
      if (!result) throw notFound("assessment");
      return result;
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AssessmentStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function mapStoreError(error: AssessmentStoreError): ApiError {
  switch (error.code) {
    case "NOT_FOUND":
    case "SCHOOL_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "INVALID_RELATIONSHIP":
    case "INVALID_DATE_RANGE":
    case "INVALID_SCORE":
      return new ApiError(400, error.code, error.message);
    case "TEACHER_ASSIGNMENT_REQUIRED":
      return new ApiError(403, error.code, error.message);
    case "DUPLICATE":
    case "ALREADY_ENTERED":
    case "INVALID_STATUS":
    case "MISSING_RESULTS":
    case "EMPTY_ROSTER":
    case "SCALE_IN_USE":
      return new ApiError(409, error.code, error.message);
  }
}

function notFound(resource: string): ApiError {
  return new ApiError(404, "RECORD_NOT_FOUND", `The requested ${resource} was not found.`);
}
