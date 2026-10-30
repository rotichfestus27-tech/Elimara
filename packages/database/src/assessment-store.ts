import { type TransactionTimeoutOptions, resolveTransactionOptions } from "./transaction-options.js";
import {
  AcademicRecordStatus,
  AssessmentStatus,
  Prisma,
  SchoolStatus,
  StaffStatus,
  type PrismaClient,
} from "@prisma/client";
import type {
  AcademicSummary,
  AssessmentContext,
  AssessmentPageQuery,
  AssessmentRecord,
  AssessmentResultRecord,
  AssessmentStore,
  CreateAssessmentInput,
  CreateGradingScaleInput,
  CorrectAssessmentResultInput,
  EnterResultsInput,
  ExemptResultInput,
  GradingScaleRecord,
  ReportCardItem,
  ResultPage,
  ResultPageQuery,
  UpdateDraftAssessmentInput,
} from "./assessment-contracts.js";
import {
  AssessmentRuleError,
  assessmentCanEdit,
  assessmentCanEnterMarks,
  assessmentCanTransition,
  calculateGrade,
  normalizeGradeBands,
  type GradeBandInput,
} from "./assessment-rules.js";

export class AssessmentStoreError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "SCHOOL_NOT_FOUND"
      | "DUPLICATE"
      | "INVALID_RELATIONSHIP"
      | "INVALID_DATE_RANGE"
      | "INVALID_SCORE"
      | "INVALID_STATUS"
      | "MISSING_RESULTS"
      | "EMPTY_ROSTER"
      | "TEACHER_ASSIGNMENT_REQUIRED"
      | "SCALE_IN_USE"
      | "ALREADY_ENTERED",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentStoreError";
  }
}

const gradingScaleSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  bands: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      code: true,
      label: true,
      lowerPercent: true,
      upperPercent: true,
      position: true,
    },
  },
} satisfies Prisma.GradingScaleSelect;

const assessmentSelect = {
  id: true,
  academicYearId: true,
  termId: true,
  classId: true,
  streamId: true,
  classSubjectAssignmentId: true,
  gradingScaleId: true,
  name: true,
  startsOn: true,
  endsOn: true,
  maximumScore: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  classSubjectAssignment: { select: { subjectId: true, subject: { select: { name: true } } } },
} satisfies Prisma.AssessmentSelect;

const resultSelect = {
  id: true,
  studentId: true,
  score: true,
  maximumScore: true,
  percentage: true,
  gradeCode: true,
  gradeLabel: true,
  enteredAt: true,
  updatedAt: true,
  exempted: true,
  exemptionReason: true,
  student: { select: { admissionNumber: true, givenName: true, familyName: true } },
} satisfies Prisma.AssessmentResultSelect;

export class PrismaAssessmentStore implements AssessmentStore {
  private readonly txOptions: { maxWait: number; timeout: number };

  constructor(
    private readonly prisma: PrismaClient,
    options?: TransactionTimeoutOptions,
  ) {
    this.txOptions = resolveTransactionOptions(options);
  }

  async listGradingScales(schoolId: string): Promise<GradingScaleRecord[]> {
    const rows = await this.prisma.gradingScale.findMany({
      where: { schoolId },
      select: gradingScaleSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(mapScale);
  }

  async createGradingScale(input: CreateGradingScaleInput): Promise<GradingScaleRecord> {
    const bands = normalizeGradeBands(input.bands);
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        const created = await tx.gradingScale.create({
          data: {
            schoolId: input.schoolId,
            name: input.name.trim(),
            nameKey: normalizeName(input.name),
            createdByUserId: input.actorUserId,
            bands: {
              create: bands.map((band) => ({
                schoolId: input.schoolId,
                code: band.code,
                label: band.label,
                lowerPercent: new Prisma.Decimal(band.lowerPercent),
                upperPercent: new Prisma.Decimal(band.upperPercent),
                position: band.position,
              })),
            },
          },
          select: gradingScaleSelect,
        });
        await audit(tx, input, "GRADING_SCALE_CREATED", created.id);
        return mapScale(created);
      }),
    );
  }

  async deactivateGradingScale(
    input: AssessmentContext & { gradingScaleId: string },
  ): Promise<boolean> {
    return this.transaction(async (tx) => {
      await requireActiveSchool(tx, input.schoolId);
      await lockGradingScaleForUpdate(tx, input.schoolId, input.gradingScaleId);
      const scale = await tx.gradingScale.findFirst({
        where: { schoolId: input.schoolId, id: input.gradingScaleId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!scale) return false;
      const unfinished = await tx.assessment.count({
        where: {
          schoolId: input.schoolId,
          gradingScaleId: scale.id,
          status: { not: AssessmentStatus.PUBLISHED },
        },
      });
      if (unfinished > 0) {
        throw storeError(
          "SCALE_IN_USE",
          "A grading scale used by an unpublished assessment cannot be deactivated.",
        );
      }
      await tx.gradingScale.update({
        where: { id: scale.id },
        data: { status: AcademicRecordStatus.INACTIVE },
      });
      await audit(tx, input, "GRADING_SCALE_DEACTIVATED", scale.id);
      return true;
    });
  }

  async listAssessments(
    schoolId: string,
    query: AssessmentPageQuery,
  ): Promise<{ items: AssessmentRecord[]; total: number }> {
    const where = assessmentWhere(schoolId, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assessment.findMany({
        where,
        select: assessmentSelect,
        orderBy: [{ startsOn: "desc" }, { name: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.assessment.count({ where }),
    ]);
    const counts = await this.resultCounts(
      schoolId,
      rows.map((row) => row.id),
    );
    return { items: rows.map((row) => mapAssessment(row, counts.get(row.id))), total };
  }

  async getAssessment(schoolId: string, assessmentId: string): Promise<AssessmentRecord | null> {
    const row = await this.prisma.assessment.findFirst({
      where: { schoolId, id: assessmentId },
      select: assessmentSelect,
    });
    if (!row) return null;
    const counts = await this.resultCounts(schoolId, [row.id]);
    return mapAssessment(row, counts.get(row.id));
  }

  async createAssessment(input: CreateAssessmentInput): Promise<AssessmentRecord> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await requireActiveSchool(tx, input.schoolId);
        await lockGradingScaleForShare(tx, input.schoolId, input.gradingScaleId);
        const dates = validateDates(input.startsOn, input.endsOn);
        const [year, term, academicClass, assignment, scale] = await Promise.all([
          tx.academicYear.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.academicYearId,
              status: AcademicRecordStatus.ACTIVE,
              startsOn: { lte: dates.startsOn },
              endsOn: { gte: dates.endsOn },
            },
            select: { id: true },
          }),
          tx.term.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.termId,
              academicYearId: input.academicYearId,
              status: AcademicRecordStatus.ACTIVE,
              startsOn: { lte: dates.startsOn },
              endsOn: { gte: dates.endsOn },
            },
            select: { id: true },
          }),
          tx.academicClass.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.classId,
              academicYearId: input.academicYearId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: { id: true },
          }),
          tx.classSubjectAssignment.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.classSubjectAssignmentId,
              classId: input.classId,
              status: AcademicRecordStatus.ACTIVE,
              subject: { status: AcademicRecordStatus.ACTIVE },
            },
            select: { id: true },
          }),
          tx.gradingScale.findFirst({
            where: { schoolId: input.schoolId, id: input.gradingScaleId, status: "ACTIVE" },
            select: {
              id: true,
              bands: {
                select: { code: true, label: true, lowerPercent: true, upperPercent: true },
              },
            },
          }),
        ]);
        if (!year || !term || !academicClass || !assignment || !scale) {
          throw storeError(
            "INVALID_RELATIONSHIP",
            "The academic year, term, class, subject assignment, or grading scale must be active in this school.",
          );
        }
        validateBands(scale.bands);
        const maximumScore = positiveScore(input.maximumScore);
        if (input.streamId) {
          const stream = await tx.classStream.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.streamId,
              classId: input.classId,
              status: AcademicRecordStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!stream)
            throw storeError("INVALID_RELATIONSHIP", "The stream is not active in this class.");
        }
        const candidates = await tx.studentPlacement.findMany({
          where: {
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            classId: input.classId,
            ...(input.streamId ? { streamId: input.streamId } : {}),
            endedAt: null,
            student: { status: "ACTIVE" },
          },
          select: { studentId: true },
        });
        if (candidates.length === 0) {
          throw storeError(
            "EMPTY_ROSTER",
            "An assessment requires at least one active student placement.",
          );
        }
        const created = await tx.assessment.create({
          data: {
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            termId: input.termId,
            classId: input.classId,
            streamId: input.streamId ?? null,
            classSubjectAssignmentId: input.classSubjectAssignmentId,
            gradingScaleId: input.gradingScaleId,
            name: input.name.trim(),
            nameKey: normalizeName(input.name),
            startsOn: dates.startsOn,
            endsOn: dates.endsOn,
            maximumScore,
            createdByUserId: input.actorUserId,
            results: {
              create: candidates.map(({ studentId }) => ({
                schoolId: input.schoolId,
                studentId,
                maximumScore,
              })),
            },
          },
          select: assessmentSelect,
        });
        await tx.assessmentEvent.create({
          data: {
            schoolId: input.schoolId,
            assessmentId: created.id,
            actorUserId: input.actorUserId,
            fromStatus: null,
            toStatus: AssessmentStatus.DRAFT,
            requestId: input.requestId,
          },
        });
        await audit(tx, input, "ASSESSMENT_CREATED", created.id);
        const fullRecord = await tx.assessment.findFirst({
          where: { id: created.id, schoolId: input.schoolId },
          select: assessmentSelect,
        });
        if (!fullRecord)
          throw storeError("NOT_FOUND", "The assessment was not found after creation.");
        return mapAssessment(fullRecord, { total: candidates.length, entered: 0 });
      }),
    );
  }

  async updateDraftAssessment(input: UpdateDraftAssessmentInput): Promise<AssessmentRecord | null> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await lockAssessment(tx, input.schoolId, input.assessmentId);
        await requireActiveSchool(tx, input.schoolId);
        const current = await tx.assessment.findFirst({
          where: { schoolId: input.schoolId, id: input.assessmentId },
          select: { id: true, status: true },
        });
        if (!current) return null;
        if (!assessmentCanEdit(current.status)) {
          throw storeError("INVALID_STATUS", "Only draft assessments can be edited.");
        }
        await lockGradingScaleForShare(tx, input.schoolId, input.gradingScaleId);
        const dates = validateDates(input.startsOn, input.endsOn);
        const [term, academicClass, assignment, scale] = await Promise.all([
          tx.term.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.termId,
              academicYearId: input.academicYearId,
              status: "ACTIVE",
              startsOn: { lte: dates.startsOn },
              endsOn: { gte: dates.endsOn },
            },
            select: { id: true },
          }),
          tx.academicClass.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.classId,
              academicYearId: input.academicYearId,
              status: "ACTIVE",
            },
            select: { id: true },
          }),
          tx.classSubjectAssignment.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.classSubjectAssignmentId,
              classId: input.classId,
              status: "ACTIVE",
              subject: { status: "ACTIVE" },
            },
            select: { id: true },
          }),
          tx.gradingScale.findFirst({
            where: { schoolId: input.schoolId, id: input.gradingScaleId, status: "ACTIVE" },
            select: { id: true },
          }),
        ]);
        const year = await tx.academicYear.findFirst({
          where: {
            schoolId: input.schoolId,
            id: input.academicYearId,
            status: "ACTIVE",
            startsOn: { lte: dates.startsOn },
            endsOn: { gte: dates.endsOn },
          },
          select: { id: true },
        });
        if (!year || !term || !academicClass || !assignment || !scale) {
          throw storeError(
            "INVALID_RELATIONSHIP",
            "All academic assessment references must be active in this school.",
          );
        }
        if (input.streamId) {
          const stream = await tx.classStream.findFirst({
            where: {
              schoolId: input.schoolId,
              id: input.streamId,
              classId: input.classId,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          if (!stream)
            throw storeError("INVALID_RELATIONSHIP", "The stream is not active in this class.");
        }
        const maximumScore = positiveScore(input.maximumScore);
        const updated = await tx.assessment.update({
          where: { id: current.id },
          data: {
            academicYearId: input.academicYearId,
            termId: input.termId,
            classId: input.classId,
            streamId: input.streamId ?? null,
            classSubjectAssignmentId: input.classSubjectAssignmentId,
            gradingScaleId: input.gradingScaleId,
            name: input.name.trim(),
            nameKey: normalizeName(input.name),
            startsOn: dates.startsOn,
            endsOn: dates.endsOn,
            maximumScore,
          },
          select: assessmentSelect,
        });
        await tx.assessmentResult.deleteMany({
          where: { schoolId: input.schoolId, assessmentId: current.id },
        });
        const candidates = await tx.studentPlacement.findMany({
          where: {
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            classId: input.classId,
            ...(input.streamId ? { streamId: input.streamId } : {}),
            endedAt: null,
            student: { status: "ACTIVE" },
          },
          select: { studentId: true },
        });
        if (candidates.length === 0) {
          throw storeError(
            "EMPTY_ROSTER",
            "An assessment requires at least one active student placement.",
          );
        }
        await tx.assessmentResult.createMany({
          data: candidates.map(({ studentId }) => ({
            schoolId: input.schoolId,
            assessmentId: current.id,
            studentId,
            maximumScore,
          })),
        });
        await audit(tx, input, "ASSESSMENT_UPDATED", current.id);
        return mapAssessment(updated, { total: candidates.length, entered: 0 });
      }),
    );
  }

  openAssessment(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(
      input,
      [AssessmentStatus.DRAFT],
      AssessmentStatus.OPEN,
      "ASSESSMENT_OPENED",
      async (tx, assessment) => {
        await validateAssessmentConfiguration(tx, input.schoolId, assessment.id);
      },
    );
  }

  submitForModeration(input: AssessmentContext & { assessmentId: string }) {
    return this.transition(
      input,
      [AssessmentStatus.OPEN],
      AssessmentStatus.MODERATION,
      "ASSESSMENT_SUBMITTED_FOR_MODERATION",
    );
  }

  async finalizeAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null> {
    return this.transition(
      input,
      [AssessmentStatus.MODERATION],
      AssessmentStatus.FINALIZED,
      "ASSESSMENT_FINALIZED",
      async (tx, assessment) => {
        const [missing, total] = await Promise.all([
          tx.assessmentResult.count({
            where: { schoolId: input.schoolId, assessmentId: assessment.id, score: null, exempted: false },
          }),
          tx.assessmentResult.count({
            where: { schoolId: input.schoolId, assessmentId: assessment.id },
          }),
        ]);
        if (total === 0)
          throw storeError(
            "EMPTY_ROSTER",
            "An assessment cannot be finalized without eligible students.",
          );
        if (missing > 0) {
          throw storeError(
            "MISSING_RESULTS",
            `Cannot finalize: ${missing} eligible student result(s) are missing.`,
          );
        }
      },
      { finalizedByUserId: input.actorUserId, finalizedAt: new Date() },
    );
  }

  async publishAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null> {
    return this.transition(
      input,
      [AssessmentStatus.FINALIZED],
      AssessmentStatus.PUBLISHED,
      "ASSESSMENT_PUBLISHED",
      async (tx, assessment) => {
        const missing = await tx.assessmentResult.count({
          where: { schoolId: input.schoolId, assessmentId: assessment.id, score: null, exempted: false },
        });
        if (missing > 0) {
          throw storeError(
            "MISSING_RESULTS",
            `Cannot publish: ${missing} eligible student result(s) are missing.`,
          );
        }
      },
      { publishedByUserId: input.actorUserId, publishedAt: new Date() },
    );
  }

  async reopenAssessment(
    input: AssessmentContext & { assessmentId: string },
  ): Promise<AssessmentRecord | null> {
    return this.transition(
      input,
      [AssessmentStatus.FINALIZED, AssessmentStatus.PUBLISHED],
      AssessmentStatus.OPEN,
      "ASSESSMENT_REOPENED_FOR_CORRECTION",
      undefined,
      { finalizedByUserId: null, finalizedAt: null, publishedByUserId: null, publishedAt: null },
    );
  }

  async listResults(
    schoolId: string,
    assessmentId: string,
    query: ResultPageQuery,
  ): Promise<ResultPage | null> {
    const assessment = await this.prisma.assessment.findFirst({
      where: { schoolId, id: assessmentId },
      select: { id: true },
    });
    if (!assessment) return null;
    const where = {
      schoolId,
      assessmentId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.missingOnly ? { score: null, exempted: false } : {}),
    };
    const [items, total, missingCount] = await this.prisma.$transaction([
      this.prisma.assessmentResult.findMany({
        where,
        select: resultSelect,
        orderBy: [
          { student: { familyName: "asc" } },
          { student: { givenName: "asc" } },
          { studentId: "asc" },
        ],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.assessmentResult.count({ where }),
      this.prisma.assessmentResult.count({
        where: { schoolId, assessmentId, score: null, exempted: false },
      }),
    ]);
    return { items: items.map(mapResult), total, missingCount };
  }

  async getResult(
    schoolId: string,
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentResultRecord | null> {
    const row = await this.prisma.assessmentResult.findFirst({
      where: { schoolId, assessmentId, studentId },
      select: resultSelect,
    });
    return row ? mapResult(row) : null;
  }

  async enterResults(input: EnterResultsInput): Promise<AssessmentResultRecord[]> {
    if (input.results.length === 0)
      throw storeError("INVALID_SCORE", "At least one result is required.");
    if (new Set(input.results.map((result) => result.studentId)).size !== input.results.length) {
      throw storeError("DUPLICATE", "A student can appear only once in a result submission.");
    }
    return this.guard(() =>
      this.transaction(async (tx) => {
        await lockAssessment(tx, input.schoolId, input.assessmentId);
        await requireActiveSchool(tx, input.schoolId);
        const assessment = await tx.assessment.findFirst({
          where: { schoolId: input.schoolId, id: input.assessmentId },
          select: {
            id: true,
            status: true,
            classSubjectAssignmentId: true,
            gradingScale: {
              select: {
                bands: {
                  orderBy: { position: "asc" },
                  select: { code: true, label: true, lowerPercent: true, upperPercent: true },
                },
              },
            },
          },
        });
        if (!assessment) return [];
        if (!assessmentCanEnterMarks(assessment.status)) {
          throw storeError(
            "INVALID_STATUS",
            "Results can only be entered while the assessment is open or in moderation.",
          );
        }
        const assignedStaff = await tx.staff.findFirst({
          where: {
            schoolId: input.schoolId,
            userId: input.actorUserId,
            status: StaffStatus.ACTIVE,
            subjectAssignments: {
              some: {
                classSubjectAssignmentId: assessment.classSubjectAssignmentId,
                endedAt: null,
              },
            },
          },
          select: { id: true },
        });
        if (!assignedStaff) {
          throw storeError(
            "TEACHER_ASSIGNMENT_REQUIRED",
            "Mark entry requires an active staff account assigned to this class and subject.",
          );
        }
        await lockStaff(tx, input.schoolId, assignedStaff.id);
        const currentAssignment = await tx.staffSubjectAssignment.findFirst({
          where: {
            schoolId: input.schoolId,
            staffId: assignedStaff.id,
            classSubjectAssignmentId: assessment.classSubjectAssignmentId,
            endedAt: null,
          },
          select: { id: true },
        });
        if (!currentAssignment) {
          throw storeError(
            "TEACHER_ASSIGNMENT_REQUIRED",
            "The teacher's class-subject assignment is no longer active.",
          );
        }
        const results: AssessmentResultRecord[] = [];
        for (const mark of input.results) {
          const candidate = await tx.assessmentResult.findFirst({
            where: {
              schoolId: input.schoolId,
              assessmentId: assessment.id,
              studentId: mark.studentId,
            },
            select: { id: true, score: true, maximumScore: true },
          });
          if (!candidate) {
            throw storeError(
              "INVALID_RELATIONSHIP",
              "The student is not in this assessment's eligible roster.",
            );
          }
          if (candidate.score !== null) {
            throw storeError(
              "ALREADY_ENTERED",
              "A result already exists; use the authorized correction workflow.",
            );
          }
          const calculated = calculateGrade(
            mark.score,
            candidate.maximumScore.toFixed(4),
            assessment.gradingScale.bands.map(mapBand),
          );
          const updated = await tx.assessmentResult.updateMany({
            where: {
              id: candidate.id,
              schoolId: input.schoolId,
              assessmentId: assessment.id,
              score: null,
            },
            data: {
              score: new Prisma.Decimal(calculated.score),
              percentage: new Prisma.Decimal(calculated.percentage),
              gradeCode: calculated.gradeCode,
              gradeLabel: calculated.gradeLabel,
              enteredByUserId: input.actorUserId,
              updatedByUserId: input.actorUserId,
              enteredAt: new Date(),
            },
          });
          if (updated.count !== 1)
            throw storeError("ALREADY_ENTERED", "A result was entered concurrently.");
          const row = await tx.assessmentResult.findFirst({
            where: { id: candidate.id, schoolId: input.schoolId },
            select: resultSelect,
          });
          if (!row) throw storeError("NOT_FOUND", "The result was not found after entry.");
          results.push(mapResult(row));
        }
        await audit(tx, input, "ASSESSMENT_RESULTS_ENTERED", assessment.id, {
          resultCount: input.results.length,
        });
        return results;
      }),
    );
  }

  async correctResult(input: CorrectAssessmentResultInput): Promise<AssessmentResultRecord | null> {
    return this.guard(() =>
      this.transaction(async (tx) => {
        await lockAssessment(tx, input.schoolId, input.assessmentId);
        await requireActiveSchool(tx, input.schoolId);
        const assessment = await tx.assessment.findFirst({
          where: { schoolId: input.schoolId, id: input.assessmentId },
          select: {
            id: true,
            status: true,
            gradingScale: {
              select: {
                bands: {
                  orderBy: { position: "asc" },
                  select: { code: true, label: true, lowerPercent: true, upperPercent: true },
                },
              },
            },
          },
        });
        if (!assessment) return null;
        if (!assessmentCanEnterMarks(assessment.status)) {
          throw storeError(
            "INVALID_STATUS",
            "Reopen a finalized assessment before correcting results.",
          );
        }
        const result = await tx.assessmentResult.findFirst({
          where: {
            schoolId: input.schoolId,
            assessmentId: assessment.id,
            studentId: input.studentId,
          },
          select: resultSelect,
        });
        if (!result) return null;
        if (result.score === null) {
          throw storeError(
            "INVALID_STATUS",
            "Use mark entry for a result that has not been entered.",
          );
        }
        const calculated = calculateGrade(
          input.score,
          result.maximumScore.toFixed(4),
          assessment.gradingScale.bands.map(mapBand),
        );
        const beforeData = resultSnapshot(result);
        const updated = await tx.assessmentResult.update({
          where: { id: result.id },
          data: {
            score: new Prisma.Decimal(calculated.score),
            percentage: new Prisma.Decimal(calculated.percentage),
            gradeCode: calculated.gradeCode,
            gradeLabel: calculated.gradeLabel,
            exempted: false,
            exemptionReason: null,
            updatedByUserId: input.actorUserId,
          },
          select: resultSelect,
        });
        await tx.assessmentResultRevision.create({
          data: {
            schoolId: input.schoolId,
            resultId: result.id,
            beforeData,
            afterData: resultSnapshot(updated),
            actorUserId: input.actorUserId,
            requestId: input.requestId,
          },
        });
        await audit(tx, input, "ASSESSMENT_RESULT_CORRECTED", result.id);
        return mapResult(updated);
      }),
    );
  }

  async exemptResult(input: ExemptResultInput): Promise<AssessmentResultRecord | null> {
    if (!input.exemptionReason || input.exemptionReason.trim().length === 0) {
      throw storeError("INVALID_SCORE", "An exemption reason is required.");
    }
    if (input.exemptionReason.trim().length > 200) {
      throw storeError("INVALID_SCORE", "Exemption reason must not exceed 200 characters.");
    }
    return this.guard(() =>
      this.transaction(async (tx) => {
        await lockAssessment(tx, input.schoolId, input.assessmentId);
        await requireActiveSchool(tx, input.schoolId);
        const assessment = await tx.assessment.findFirst({
          where: { schoolId: input.schoolId, id: input.assessmentId },
          select: { id: true, status: true },
        });
        if (!assessment) return null;
        if (!assessmentCanEnterMarks(assessment.status)) {
          throw storeError(
            "INVALID_STATUS",
            "Exemptions can only be set while the assessment is open or in moderation.",
          );
        }
        const result = await tx.assessmentResult.findFirst({
          where: {
            schoolId: input.schoolId,
            assessmentId: assessment.id,
            studentId: input.studentId,
          },
          select: resultSelect,
        });
        if (!result) return null;
        const beforeData = resultSnapshot(result);
        const updated = await tx.assessmentResult.update({
          where: { id: result.id },
          data: {
            exempted: true,
            exemptionReason: input.exemptionReason.trim(),
            score: null,
            percentage: null,
            gradeCode: null,
            gradeLabel: null,
            updatedByUserId: input.actorUserId,
          },
          select: resultSelect,
        });
        await tx.assessmentResultRevision.create({
          data: {
            schoolId: input.schoolId,
            resultId: result.id,
            beforeData,
            afterData: resultSnapshot(updated),
            actorUserId: input.actorUserId,
            requestId: input.requestId,
          },
        });
        await audit(tx, input, "ASSESSMENT_RESULT_EXEMPTED", result.id, {
          exemptionReason: input.exemptionReason.trim(),
        });
        return mapResult(updated);
      }),
    );
  }

  async reportCard(
    schoolId: string,
    studentId: string,
    query: { academicYearId: string; termId: string },
  ): Promise<ReportCardItem[] | null> {
    const student = await this.prisma.student.findFirst({
      where: { schoolId, id: studentId },
      select: { id: true },
    });
    if (!student) return null;
    const rows = await this.prisma.assessmentResult.findMany({
      where: {
        schoolId,
        studentId,
        score: { not: null },
        percentage: { not: null },
        gradeCode: { not: null },
        gradeLabel: { not: null },
        assessment: {
          status: AssessmentStatus.PUBLISHED,
          academicYearId: query.academicYearId,
          termId: query.termId,
        },
      },
      select: {
        assessmentId: true,
        score: true,
        maximumScore: true,
        percentage: true,
        gradeCode: true,
        gradeLabel: true,
        assessment: {
          select: {
            name: true,
            termId: true,
            startsOn: true,
            classSubjectAssignment: {
              select: { subjectId: true, subject: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: [{ assessment: { startsOn: "asc" } }, { assessmentId: "asc" }],
    });
    return rows.map((row) => ({
      assessmentId: row.assessmentId,
      assessmentName: row.assessment.name,
      termId: row.assessment.termId,
      subjectId: row.assessment.classSubjectAssignment.subjectId,
      subjectName: row.assessment.classSubjectAssignment.subject.name,
      startsOn: row.assessment.startsOn,
      score: row.score?.toFixed(4) ?? "",
      maximumScore: row.maximumScore.toFixed(4),
      percentage: row.percentage?.toFixed(4) ?? "",
      gradeCode: row.gradeCode ?? "",
      gradeLabel: row.gradeLabel ?? "",
    }));
  }

  async academicSummary(
    schoolId: string,
    query: { academicYearId: string; termId: string; classId?: string },
  ): Promise<AcademicSummary> {
    const rows = await this.prisma.assessment.findMany({
      where: {
        schoolId,
        academicYearId: query.academicYearId,
        termId: query.termId,
        ...(query.classId ? { classId: query.classId } : {}),
      },
      select: { id: true, status: true },
    });
    const counts = await this.resultCounts(
      schoolId,
      rows.map((row) => row.id),
    );
    let eligibleCount = 0;
    let enteredCount = 0;
    for (const item of counts.values()) {
      eligibleCount += item.total;
      enteredCount += item.entered;
    }
    return {
      assessmentCount: rows.length,
      eligibleCount,
      enteredCount,
      missingCount: eligibleCount - enteredCount,
      publishedCount: rows.filter((row) => row.status === AssessmentStatus.PUBLISHED).length,
    };
  }

  private async transition(
    input: AssessmentContext & { assessmentId: string },
    allowedFrom: AssessmentStatus[],
    toStatus: AssessmentStatus,
    eventName: string,
    validate?: (tx: Prisma.TransactionClient, assessment: { id: string }) => Promise<void>,
    extraData: Prisma.AssessmentUncheckedUpdateInput = {},
  ): Promise<AssessmentRecord | null> {
    return this.transaction(async (tx) => {
      await lockAssessment(tx, input.schoolId, input.assessmentId);
      await requireActiveSchool(tx, input.schoolId);
      const current = await tx.assessment.findFirst({
        where: { schoolId: input.schoolId, id: input.assessmentId },
        select: { id: true, status: true },
      });
      if (!current) return null;
      if (
        !allowedFrom.includes(current.status) ||
        !assessmentCanTransition(current.status, toStatus)
      ) {
        throw storeError(
          "INVALID_STATUS",
          `Assessment cannot transition from ${current.status} to ${toStatus}.`,
        );
      }
      if (validate) await validate(tx, current);
      const updated = await tx.assessment.update({
        where: { id: current.id },
        data: { ...extraData, status: toStatus },
        select: assessmentSelect,
      });
      await tx.assessmentEvent.create({
        data: {
          schoolId: input.schoolId,
          assessmentId: current.id,
          actorUserId: input.actorUserId,
          fromStatus: current.status,
          toStatus,
          requestId: input.requestId,
        },
      });
      await audit(tx, input, eventName, current.id);
      const counts = await this.countForAssessment(tx, input.schoolId, current.id);
      return mapAssessment(updated, counts);
    });
  }

  private async resultCounts(
    schoolId: string,
    assessmentIds: string[],
  ): Promise<Map<string, { total: number; entered: number }>> {
    if (assessmentIds.length === 0) return new Map();
    const grouped = await this.prisma.assessmentResult.groupBy({
      by: ["assessmentId"],
      where: { schoolId, assessmentId: { in: assessmentIds } },
      _count: { _all: true, score: true },
    });
    return new Map(
      grouped.map((row) => [
        row.assessmentId,
        { total: row._count._all, entered: row._count.score },
      ]),
    );
  }

  private async countForAssessment(
    tx: Prisma.TransactionClient,
    schoolId: string,
    assessmentId: string,
  ) {
    const [total, entered] = await Promise.all([
      tx.assessmentResult.count({ where: { schoolId, assessmentId } }),
      tx.assessmentResult.count({ where: { schoolId, assessmentId, score: { not: null } } }),
    ]);
    return { total, entered };
  }

  private transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: this.txOptions.maxWait,
      timeout: this.txOptions.timeout,
    });
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AssessmentStoreError) throw error;
      if (error instanceof AssessmentRuleError) throw storeError("INVALID_SCORE", error.message);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002")
          throw storeError("DUPLICATE", "The assessment record conflicts with an existing record.");
        if (error.code === "P2003" || error.code === "P2004") {
          throw storeError(
            "INVALID_RELATIONSHIP",
            "The assessment record violates a data integrity rule.",
          );
        }
      }
      throw error;
    }
  }
}

function assessmentWhere(
  schoolId: string,
  query: AssessmentPageQuery,
): Prisma.AssessmentWhereInput {
  return {
    schoolId,
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.classId ? { classId: query.classId } : {}),
    ...(query.status ? { status: query.status as AssessmentStatus } : {}),
  };
}

function mapAssessment(
  row: Prisma.AssessmentGetPayload<{ select: typeof assessmentSelect }>,
  counts: { total: number; entered: number } = { total: 0, entered: 0 },
): AssessmentRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    termId: row.termId,
    classId: row.classId,
    streamId: row.streamId,
    classSubjectAssignmentId: row.classSubjectAssignmentId,
    subjectId: row.classSubjectAssignment.subjectId,
    subjectName: row.classSubjectAssignment.subject.name,
    gradingScaleId: row.gradingScaleId,
    name: row.name,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    maximumScore: row.maximumScore.toFixed(4),
    status: row.status,
    eligibleCount: counts.total,
    enteredCount: counts.entered,
    missingCount: counts.total - counts.entered,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapScale(
  row: Prisma.GradingScaleGetPayload<{ select: typeof gradingScaleSelect }>,
): GradingScaleRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    bands: row.bands.map((band) => ({
      id: band.id,
      code: band.code,
      label: band.label,
      lowerPercent: band.lowerPercent.toFixed(2),
      upperPercent: band.upperPercent.toFixed(2),
      position: band.position,
    })),
  };
}

function mapResult(
  row: Prisma.AssessmentResultGetPayload<{ select: typeof resultSelect }>,
): AssessmentResultRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    studentAdmissionNumber: row.student.admissionNumber,
    studentGivenName: row.student.givenName,
    studentFamilyName: row.student.familyName,
    score: row.score?.toFixed(4) ?? null,
    maximumScore: row.maximumScore.toFixed(4),
    percentage: row.percentage?.toFixed(4) ?? null,
    gradeCode: row.gradeCode,
    gradeLabel: row.gradeLabel,
    enteredAt: row.enteredAt,
    updatedAt: row.updatedAt,
    exempted: row.exempted,
    exemptionReason: row.exemptionReason,
  };
}

function mapBand(band: {
  code: string;
  label: string;
  lowerPercent: Prisma.Decimal;
  upperPercent: Prisma.Decimal;
}): GradeBandInput {
  return {
    code: band.code,
    label: band.label,
    lowerPercent: band.lowerPercent.toFixed(2),
    upperPercent: band.upperPercent.toFixed(2),
  };
}

function validateBands(
  bands: Array<{
    code: string;
    label: string;
    lowerPercent: Prisma.Decimal;
    upperPercent: Prisma.Decimal;
  }>,
) {
  normalizeGradeBands(bands.map(mapBand));
}

function resultSnapshot(result: {
  score: Prisma.Decimal | null;
  maximumScore: Prisma.Decimal;
  percentage: Prisma.Decimal | null;
  gradeCode: string | null;
  gradeLabel: string | null;
}) {
  return {
    score: result.score?.toFixed(4) ?? null,
    maximumScore: result.maximumScore.toFixed(4),
    percentage: result.percentage?.toFixed(4) ?? null,
    gradeCode: result.gradeCode,
    gradeLabel: result.gradeLabel,
  };
}

function validateDates(startsOn: string, endsOn: string) {
  const starts = dateOnly(startsOn);
  const ends = dateOnly(endsOn);
  if (starts > ends)
    throw storeError(
      "INVALID_DATE_RANGE",
      "Assessment end date must be on or after its start date.",
    );
  return { startsOn: starts, endsOn: ends };
}

function dateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw storeError("INVALID_DATE_RANGE", "The supplied date is invalid.");
  }
  return date;
}

async function validateAssessmentConfiguration(
  tx: Prisma.TransactionClient,
  schoolId: string,
  assessmentId: string,
) {
  const assessment = await tx.assessment.findFirst({
    where: { schoolId, id: assessmentId },
    select: {
      academicYearId: true,
      termId: true,
      classId: true,
      streamId: true,
      classSubjectAssignmentId: true,
      gradingScaleId: true,
      startsOn: true,
      endsOn: true,
    },
  });
  if (!assessment) throw storeError("NOT_FOUND", "The assessment is no longer available.");
  await lockGradingScaleForShare(tx, schoolId, assessment.gradingScaleId);
  const [year, term, academicClass, assignment, scale] = await Promise.all([
    tx.academicYear.findFirst({
      where: {
        schoolId,
        id: assessment.academicYearId,
        status: AcademicRecordStatus.ACTIVE,
        startsOn: { lte: assessment.startsOn },
        endsOn: { gte: assessment.endsOn },
      },
      select: { id: true },
    }),
    tx.term.findFirst({
      where: {
        schoolId,
        id: assessment.termId,
        academicYearId: assessment.academicYearId,
        status: AcademicRecordStatus.ACTIVE,
        startsOn: { lte: assessment.startsOn },
        endsOn: { gte: assessment.endsOn },
      },
      select: { id: true },
    }),
    tx.academicClass.findFirst({
      where: {
        schoolId,
        id: assessment.classId,
        academicYearId: assessment.academicYearId,
        status: AcademicRecordStatus.ACTIVE,
      },
      select: { id: true },
    }),
    tx.classSubjectAssignment.findFirst({
      where: {
        schoolId,
        id: assessment.classSubjectAssignmentId,
        classId: assessment.classId,
        status: AcademicRecordStatus.ACTIVE,
        subject: { status: AcademicRecordStatus.ACTIVE },
      },
      select: { id: true },
    }),
    tx.gradingScale.findFirst({
      where: { schoolId, id: assessment.gradingScaleId, status: AcademicRecordStatus.ACTIVE },
      select: {
        bands: {
          select: { code: true, label: true, lowerPercent: true, upperPercent: true },
        },
      },
    }),
  ]);
  if (!year || !term || !academicClass || !assignment || !scale) {
    throw storeError(
      "INVALID_RELATIONSHIP",
      "The assessment's academic year, term, class, subject assignment, and grading scale must remain active in this school.",
    );
  }
  validateBands(scale.bands);
  if (assessment.streamId) {
    const stream = await tx.classStream.findFirst({
      where: {
        schoolId,
        id: assessment.streamId,
        classId: assessment.classId,
        status: AcademicRecordStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!stream)
      throw storeError("INVALID_RELATIONSHIP", "The assessment stream must remain active.");
  }
}

function positiveScore(value: string): Prisma.Decimal {
  const parsed = new Prisma.Decimal(value);
  if (
    !parsed.isFinite() ||
    parsed.lte(0) ||
    parsed.decimalPlaces() > 4 ||
    parsed.greaterThan("99999999.9999")
  ) {
    throw storeError(
      "INVALID_SCORE",
      "Maximum score must be a positive decimal with at most four places.",
    );
  }
  return parsed;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function storeError(
  code: ConstructorParameters<typeof AssessmentStoreError>[0],
  message: string,
): AssessmentStoreError {
  return new AssessmentStoreError(code, message);
}

async function requireActiveSchool(tx: Prisma.TransactionClient, schoolId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "schools"
    WHERE "id" = ${schoolId}::uuid AND "status" = ${SchoolStatus.ACTIVE}::"SchoolStatus"
    FOR SHARE
  `;
  if (rows.length !== 1) throw storeError("SCHOOL_NOT_FOUND", "The school is not available.");
}

async function lockAssessment(
  tx: Prisma.TransactionClient,
  schoolId: string,
  assessmentId: string,
) {
  await tx.$queryRaw`SELECT id FROM assessments WHERE school_id = ${schoolId}::uuid AND id = ${assessmentId}::uuid FOR UPDATE`;
}

async function lockGradingScaleForShare(
  tx: Prisma.TransactionClient,
  schoolId: string,
  gradingScaleId: string,
) {
  await tx.$queryRaw`SELECT id FROM grading_scales WHERE school_id = ${schoolId}::uuid AND id = ${gradingScaleId}::uuid FOR SHARE`;
}

async function lockGradingScaleForUpdate(
  tx: Prisma.TransactionClient,
  schoolId: string,
  gradingScaleId: string,
) {
  await tx.$queryRaw`SELECT id FROM grading_scales WHERE school_id = ${schoolId}::uuid AND id = ${gradingScaleId}::uuid FOR UPDATE`;
}

async function lockStaff(tx: Prisma.TransactionClient, schoolId: string, staffId: string) {
  await tx.$queryRaw`SELECT id FROM staff WHERE school_id = ${schoolId}::uuid AND id = ${staffId}::uuid FOR UPDATE`;
}

async function audit(
  tx: Prisma.TransactionClient,
  input: AssessmentContext,
  eventType: string,
  targetId: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.securityAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      schoolId: input.schoolId,
      eventType,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: { targetId, ...metadata },
    },
  });
}
