-- Phase 07: school-scoped assessments, configurable grading, and auditable results.
-- Requires all previous Elimara migrations to be reviewed and applied first.

CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'OPEN', 'MODERATION', 'FINALIZED', 'PUBLISHED');

CREATE UNIQUE INDEX "terms_school_year_id_key"
ON "terms"("school_id", "academic_year_id", "id");

CREATE TABLE "grading_scales" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(300) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "grading_scales_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL)
);

CREATE TABLE "grading_bands" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "grading_scale_id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "lower_percent" DECIMAL(5,2) NOT NULL,
    "upper_percent" DECIMAL(5,2) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grading_bands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "grading_bands_bounds_check" CHECK (
        "lower_percent" >= 0 AND "upper_percent" <= 100 AND "lower_percent" < "upper_percent"
    ),
    CONSTRAINT "grading_bands_name_check" CHECK (
        NULLIF(BTRIM("code"), '') IS NOT NULL AND NULLIF(BTRIM("label"), '') IS NOT NULL
    ),
    CONSTRAINT "grading_bands_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "stream_id" UUID,
    "class_subject_assignment_id" UUID NOT NULL,
    "grading_scale_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "maximum_score" DECIMAL(12,4) NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID NOT NULL,
    "finalized_by_user_id" UUID,
    "published_by_user_id" UUID,
    "finalized_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessments_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
    CONSTRAINT "assessments_date_range_check" CHECK ("starts_on" <= "ends_on"),
    CONSTRAINT "assessments_maximum_score_check" CHECK ("maximum_score" > 0),
    CONSTRAINT "assessments_lifecycle_check" CHECK (
        ("status" IN ('DRAFT', 'OPEN', 'MODERATION') AND "finalized_by_user_id" IS NULL AND "finalized_at" IS NULL AND "published_by_user_id" IS NULL AND "published_at" IS NULL)
        OR ("status" = 'FINALIZED' AND "finalized_by_user_id" IS NOT NULL AND "finalized_at" IS NOT NULL AND "published_by_user_id" IS NULL AND "published_at" IS NULL)
        OR ("status" = 'PUBLISHED' AND "finalized_by_user_id" IS NOT NULL AND "finalized_at" IS NOT NULL AND "published_by_user_id" IS NOT NULL AND "published_at" IS NOT NULL)
    )
);

CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "score" DECIMAL(12,4),
    "maximum_score" DECIMAL(12,4) NOT NULL,
    "percentage" DECIMAL(7,4),
    "grade_code" VARCHAR(24),
    "grade_label" VARCHAR(100),
    "entered_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "entered_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_results_maximum_score_check" CHECK ("maximum_score" > 0),
    CONSTRAINT "assessment_results_values_check" CHECK (
        ("score" IS NULL AND "percentage" IS NULL AND "grade_code" IS NULL AND "grade_label" IS NULL AND "entered_by_user_id" IS NULL AND "updated_by_user_id" IS NULL AND "entered_at" IS NULL)
        OR
        ("score" IS NOT NULL AND "score" >= 0 AND "score" <= "maximum_score" AND "percentage" IS NOT NULL AND "percentage" BETWEEN 0 AND 100 AND NULLIF(BTRIM("grade_code"), '') IS NOT NULL AND NULLIF(BTRIM("grade_label"), '') IS NOT NULL AND "entered_by_user_id" IS NOT NULL AND "updated_by_user_id" IS NOT NULL AND "entered_at" IS NOT NULL)
    )
);

CREATE TABLE "assessment_result_revisions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "before_data" JSONB NOT NULL,
    "after_data" JSONB NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_id" VARCHAR(80),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_result_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "from_status" "AssessmentStatus",
    "to_status" "AssessmentStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(80),
    CONSTRAINT "assessment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grading_scales_school_id_id_key"
ON "grading_scales"("school_id", "id");
CREATE UNIQUE INDEX "grading_scales_school_name_key"
ON "grading_scales"("school_id", "name_key");
CREATE INDEX "grading_scales_school_status_name_idx"
ON "grading_scales"("school_id", "status", "name");

CREATE UNIQUE INDEX "grading_bands_school_id_id_key"
ON "grading_bands"("school_id", "id");
CREATE UNIQUE INDEX "grading_bands_school_scale_code_key"
ON "grading_bands"("school_id", "grading_scale_id", "code");
CREATE UNIQUE INDEX "grading_bands_school_scale_position_key"
ON "grading_bands"("school_id", "grading_scale_id", "position");
CREATE INDEX "grading_bands_school_scale_lower_idx"
ON "grading_bands"("school_id", "grading_scale_id", "lower_percent");

CREATE UNIQUE INDEX "assessments_school_id_id_key"
ON "assessments"("school_id", "id");
CREATE UNIQUE INDEX "assessments_school_year_id_key"
ON "assessments"("school_id", "academic_year_id", "id");
CREATE UNIQUE INDEX "assessments_school_id_assessment_maximum_key"
ON "assessments"("school_id", "id", "maximum_score");
CREATE UNIQUE INDEX "assessments_school_term_subject_name_key"
ON "assessments"("school_id", "term_id", "class_subject_assignment_id", "name_key");
CREATE INDEX "assessments_school_term_date_idx"
ON "assessments"("school_id", "academic_year_id", "term_id", "starts_on");
CREATE INDEX "assessments_school_class_status_idx"
ON "assessments"("school_id", "class_id", "stream_id", "status");

CREATE UNIQUE INDEX "assessment_results_school_id_id_key"
ON "assessment_results"("school_id", "id");
CREATE UNIQUE INDEX "assessment_results_school_assessment_student_key"
ON "assessment_results"("school_id", "assessment_id", "student_id");
CREATE INDEX "assessment_results_school_student_time_idx"
ON "assessment_results"("school_id", "student_id", "entered_at");
CREATE INDEX "assessment_results_school_assessment_score_idx"
ON "assessment_results"("school_id", "assessment_id", "percentage");
CREATE INDEX "assessment_result_revisions_school_result_time_idx"
ON "assessment_result_revisions"("school_id", "result_id", "occurred_at");
CREATE INDEX "assessment_events_school_assessment_time_idx"
ON "assessment_events"("school_id", "assessment_id", "occurred_at");

ALTER TABLE "grading_scales"
ADD CONSTRAINT "grading_scales_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grading_scales"
ADD CONSTRAINT "grading_scales_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "grading_bands"
ADD CONSTRAINT "grading_bands_school_id_grading_scale_id_fkey"
FOREIGN KEY ("school_id", "grading_scale_id")
REFERENCES "grading_scales"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_academic_year_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id")
REFERENCES "academic_years"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_academic_year_id_term_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id", "term_id")
REFERENCES "terms"("school_id", "academic_year_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_academic_year_id_class_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id", "class_id")
REFERENCES "academic_classes"("school_id", "academic_year_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_class_id_stream_id_fkey"
FOREIGN KEY ("school_id", "class_id", "stream_id")
REFERENCES "class_streams"("school_id", "class_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_class_id_subject_assignment_id_fkey"
FOREIGN KEY ("school_id", "class_id", "class_subject_assignment_id")
REFERENCES "class_subject_assignments"("school_id", "class_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_school_id_grading_scale_id_fkey"
FOREIGN KEY ("school_id", "grading_scale_id")
REFERENCES "grading_scales"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_finalized_by_user_id_fkey"
FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_published_by_user_id_fkey"
FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_school_assessment_maximum_fkey"
FOREIGN KEY ("school_id", "assessment_id", "maximum_score")
REFERENCES "assessments"("school_id", "id", "maximum_score")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_school_student_id_fkey"
FOREIGN KEY ("school_id", "student_id")
REFERENCES "students"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_entered_by_user_id_fkey"
FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_result_revisions"
ADD CONSTRAINT "assessment_result_revisions_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_result_revisions"
ADD CONSTRAINT "assessment_result_revisions_school_result_id_fkey"
FOREIGN KEY ("school_id", "result_id")
REFERENCES "assessment_results"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_result_revisions"
ADD CONSTRAINT "assessment_result_revisions_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_events"
ADD CONSTRAINT "assessment_events_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_events"
ADD CONSTRAINT "assessment_events_school_assessment_id_fkey"
FOREIGN KEY ("school_id", "assessment_id")
REFERENCES "assessments"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_events"
ADD CONSTRAINT "assessment_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_overlapping_grading_bands"() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "grading_bands" AS band
        WHERE band."school_id" = NEW."school_id"
          AND band."grading_scale_id" = NEW."grading_scale_id"
          AND band."id" <> NEW."id"
          AND band."lower_percent" < NEW."upper_percent"
          AND NEW."lower_percent" < band."upper_percent"
    ) THEN
        RAISE EXCEPTION 'Grading bands cannot overlap'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "grading_bands_no_overlap"
BEFORE INSERT OR UPDATE ON "grading_bands"
FOR EACH ROW EXECUTE FUNCTION "prevent_overlapping_grading_bands"();

CREATE FUNCTION "check_assessment_result_consistency"() RETURNS trigger AS $$
BEGIN
    IF NEW."score" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "assessments" AS assessment
        WHERE assessment."school_id" = NEW."school_id"
          AND assessment."id" = NEW."assessment_id"
          AND assessment."status" IN ('OPEN', 'MODERATION')
          AND NEW."score" >= 0
          AND NEW."score" <= assessment."maximum_score"
          AND NEW."maximum_score" = assessment."maximum_score"
    ) THEN
        RAISE EXCEPTION 'Assessment result is inconsistent with its assessment'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assessment_results_consistency"
BEFORE INSERT OR UPDATE ON "assessment_results"
FOR EACH ROW EXECUTE FUNCTION "check_assessment_result_consistency"();
