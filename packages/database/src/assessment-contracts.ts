import type { AcademicRecordStatus } from "./contracts.js";

export type AssessmentStatus = "DRAFT" | "OPEN" | "MODERATION" | "FINALIZED" | "PUBLISHED";
export type AssessmentContext = {
  schoolId: string;
  actorUserId: string;
  requestId: string;
};
export type AssessmentPageQuery = {
  limit: number;
  offset: number;
  academicYearId?: string;
  termId?: string;
  classId?: string;
  streamId?: string;
  classSubjectAssignmentId?: string;
  status?: AssessmentStatus;
};
export type GradeBandRecord = {
  id: string;
  code: string;
  label: string;
  lowerPercent: string;
  upperPercent: string;
  position: number;
};
export type GradingScaleRecord = {
  id: string;
  name: string;
  status: AcademicRecordStatus;
  createdAt: Date;
  bands: GradeBandRecord[];
};
export type AssessmentRecord = {
  id: string;
  academicYearId: string;
  termId: string;
  classId: string;
  streamId: string | null;
  classSubjectAssignmentId: string;
  subjectId: string;
  subjectName: string;
  gradingScaleId: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  maximumScore: string;
  status: AssessmentStatus;
  eligibleCount: number;
  enteredCount: number;
  missingCount: number;
  createdAt: Date;
  updatedAt: Date;
};
export type AssessmentResultRecord = {
  id: string;
  studentId: string;
  studentAdmissionNumber: string;
  studentGivenName: string;
  studentFamilyName: string;
  score: string | null;
  maximumScore: string;
  percentage: string | null;
  gradeCode: string | null;
  gradeLabel: string | null;
  enteredAt: Date | null;
  updatedAt: Date;
  exempted: boolean;
  exemptionReason: string | null;
};
export type ResultPageQuery = {
  limit: number;
  offset: number;
  studentId?: string;
  missingOnly?: boolean;
};

export type ResultPage = { items: AssessmentResultRecord[]; total: number; missingCount: number };
export type ReportCardItem = {
  assessmentId: string;
  assessmentName: string;
  termId: string;
  subjectId: string;
  subjectName: string;
  startsOn: Date;
  score: string;
  maximumScore: string;
  percentage: string;
  gradeCode: string;
  gradeLabel: string;
};
export type AcademicSummary = {
  assessmentCount: number;
  eligibleCount: number;
  enteredCount: number;
  missingCount: number;
  publishedCount: number;
};
export type CreateGradingScaleInput = AssessmentContext & {
  name: string;
  bands: Array<{ code: string; label: string; lowerPercent: string; upperPercent: string }>;
};
export type CreateAssessmentInput = AssessmentContext & {
  academicYearId: string;
  termId: string;
  classId: string;
  streamId?: string;
  classSubjectAssignmentId: string;
  gradingScaleId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  maximumScore: string;
};
export type UpdateDraftAssessmentInput = AssessmentContext &
  Omit<CreateAssessmentInput, keyof AssessmentContext> & { assessmentId: string };
export type AssessmentResultInput = {
  studentId: string;
  score: string;
};
export type EnterResultsInput = AssessmentContext & {
  assessmentId: string;
  results: AssessmentResultInput[];
};
export type CorrectAssessmentResultInput = AssessmentContext & {
  assessmentId: string;
  studentId: string;
  score: string;
};

export type ExemptResultInput = AssessmentContext & {
  assessmentId: string;
  studentId: string;
  exemptionReason: string;
};

export interface AssessmentStore {
  listGradingScales(schoolId: string): Promise<GradingScaleRecord[]>;
  createGradingScale(input: CreateGradingScaleInput): Promise<GradingScaleRecord>;
  deactivateGradingScale(input: AssessmentContext & { gradingScaleId: string }): Promise<boolean>;
  listAssessments(
    schoolId: string,
    query: AssessmentPageQuery,
  ): Promise<{ items: AssessmentRecord[]; total: number }>;
  getAssessment(schoolId: string, assessmentId: string): Promise<AssessmentRecord | null>;
  createAssessment(input: CreateAssessmentInput): Promise<AssessmentRecord>;
  updateDraftAssessment(input: UpdateDraftAssessmentInput): Promise<AssessmentRecord | null>;
  openAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null>;
  submitForModeration(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null>;
  finalizeAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null>;
  publishAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null>;
  reopenAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null>;
  listResults(
    schoolId: string,
    assessmentId: string,
    query: ResultPageQuery,
  ): Promise<ResultPage | null>;
  getResult(schoolId: string, assessmentId: string, studentId: string): Promise<AssessmentResultRecord | null>;
  enterResults(input: EnterResultsInput): Promise<AssessmentResultRecord[]>;
  correctResult(input: CorrectAssessmentResultInput): Promise<AssessmentResultRecord | null>;
  exemptResult(input: ExemptResultInput): Promise<AssessmentResultRecord | null>;
  reportCard(
    schoolId: string,
    studentId: string,
    query: { academicYearId: string; termId: string },
  ): Promise<ReportCardItem[] | null>;
  academicSummary(
    schoolId: string,
    query: { academicYearId: string; termId: string; classId?: string },
  ): Promise<AcademicSummary>;
}
