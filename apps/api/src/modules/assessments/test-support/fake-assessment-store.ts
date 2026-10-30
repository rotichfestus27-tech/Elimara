import {
  AssessmentStoreError,
  type AcademicSummary,
  type AssessmentContext,
  type AssessmentPageQuery,
  type AssessmentRecord,
  type AssessmentResultRecord,
  type AssessmentStore,
  type CreateAssessmentInput,
  type CreateGradingScaleInput,
  type CorrectAssessmentResultInput,
  type EnterResultsInput,
  type GradingScaleRecord,
  type ReportCardItem,
  type ResultPage,
  type UpdateDraftAssessmentInput,
} from "@elimara/database";

export class FakeAssessmentStore implements AssessmentStore {
  readonly assessments = new Map<string, AssessmentRecord>();
  readonly schoolIds = new Map<string, string>();
  readonly marks = new Map<string, AssessmentResultRecord[]>();

  async listGradingScales(_schoolId: string): Promise<GradingScaleRecord[]> {
    return [];
  }

  async createGradingScale(_input: CreateGradingScaleInput): Promise<GradingScaleRecord> {
    throw new Error("Not implemented in this fake.");
  }

  async deactivateGradingScale(
    _input: AssessmentContext & { gradingScaleId: string },
  ): Promise<boolean> {
    return false;
  }

  async listAssessments(
    schoolId: string,
    _query: AssessmentPageQuery,
  ): Promise<{ items: AssessmentRecord[]; total: number }> {
    const items = [...this.assessments.values()].filter((assessment) =>
      this.hasSchool(assessment.id, schoolId),
    );
    return { items, total: items.length };
  }

  async getAssessment(schoolId: string, assessmentId: string) {
    return this.hasSchool(assessmentId, schoolId)
      ? (this.assessments.get(assessmentId) ?? null)
      : null;
  }

  async createAssessment(_input: CreateAssessmentInput): Promise<AssessmentRecord> {
    throw new Error("Not implemented in this fake.");
  }

  async updateDraftAssessment(_input: UpdateDraftAssessmentInput) {
    return null;
  }

  openAssessment(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(input, ["DRAFT"], "OPEN");
  }

  submitForModeration(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(input, ["OPEN"], "MODERATION");
  }

  finalizeAssessment(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(input, ["MODERATION"], "FINALIZED");
  }

  publishAssessment(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(input, ["FINALIZED"], "PUBLISHED");
  }

  reopenAssessment(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(input, ["FINALIZED", "PUBLISHED"], "OPEN");
  }

  async listResults(
    schoolId: string,
    assessmentId: string,
    _query: { limit: number; offset: number; studentId?: string; missingOnly?: boolean },
  ): Promise<ResultPage | null> {
    if (!this.hasSchool(assessmentId, schoolId)) return null;
    const items = this.marks.get(assessmentId) ?? [];
    return {
      items,
      total: items.length,
      missingCount: items.filter((item) => item.score === null).length,
    };
  }

  async getResult(schoolId: string, assessmentId: string, studentId: string): Promise<AssessmentResultRecord | null> {
    if (!this.hasSchool(assessmentId, schoolId)) return null;
    return (this.marks.get(assessmentId) ?? []).find((item) => item.studentId === studentId) ?? null;
  }

  async enterResults(_input: EnterResultsInput): Promise<AssessmentResultRecord[]> {
    return [];
  }

  async correctResult(
    _input: CorrectAssessmentResultInput,
  ): Promise<AssessmentResultRecord | null> {
    return null;
  }

  async exemptResult(
    _input: Parameters<AssessmentStore["exemptResult"]>[0],
  ): Promise<AssessmentResultRecord | null> {
    return null;
  }

  async reportCard(
    _schoolId: string,
    _studentId: string,
    _query: { academicYearId: string; termId: string },
  ): Promise<ReportCardItem[] | null> {
    return [];
  }

  async academicSummary(
    _schoolId: string,
    _query: { academicYearId: string; termId: string; classId?: string },
  ): Promise<AcademicSummary> {
    return {
      assessmentCount: 0,
      eligibleCount: 0,
      enteredCount: 0,
      missingCount: 0,
      publishedCount: 0,
    };
  }

  private async transition(
    input: AssessmentContext & { assessmentId: string },
    allowedFrom: AssessmentRecord["status"][],
    status: AssessmentRecord["status"],
  ) {
    const assessment = this.assessments.get(input.assessmentId);
    if (!assessment || !this.hasSchool(input.assessmentId, input.schoolId)) return null;
    if (!allowedFrom.includes(assessment.status)) {
      throw new AssessmentStoreError("INVALID_STATUS", "The assessment transition is not allowed.");
    }
    const updated = { ...assessment, status, updatedAt: new Date() };
    this.assessments.set(updated.id, updated);
    return updated;
  }

  private hasSchool(assessmentId: string, schoolId: string) {
    return this.schoolIds.get(assessmentId) === schoolId;
  }
}
