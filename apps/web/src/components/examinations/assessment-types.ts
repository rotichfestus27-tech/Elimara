export type AssessmentStatus = "DRAFT" | "OPEN" | "MODERATION" | "FINALIZED" | "PUBLISHED";

export type Assessment = {
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
  startsOn: string;
  endsOn: string;
  maximumScore: string;
  status: AssessmentStatus;
  eligibleCount: number;
  enteredCount: number;
  missingCount: number;
};
