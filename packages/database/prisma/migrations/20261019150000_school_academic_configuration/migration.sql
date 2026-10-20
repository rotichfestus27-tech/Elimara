-- Phase 03: school profile and year-scoped academic configuration.
-- Existing academic records are retained by deactivation; no business history
-- is deleted by this migration.

CREATE TYPE "AcademicRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "schools"
ADD COLUMN "contact_email" VARCHAR(320),
ADD COLUMN "contact_phone" VARCHAR(40);

CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "academic_years_date_range_check" CHECK ("starts_on" <= "ends_on")
);

CREATE TABLE "terms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "terms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "terms_date_range_check" CHECK ("starts_on" <= "ends_on")
);

CREATE TABLE "academic_classes" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "academic_classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_streams" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "class_streams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_subject_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "class_subject_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academic_years_school_id_id_key"
ON "academic_years"("school_id", "id");
CREATE UNIQUE INDEX "academic_years_school_id_name_key"
ON "academic_years"("school_id", "name_key");
CREATE INDEX "academic_years_school_status_starts_on_idx"
ON "academic_years"("school_id", "status", "starts_on");

CREATE UNIQUE INDEX "terms_school_id_academic_year_id_name_key"
ON "terms"("school_id", "academic_year_id", "name_key");
CREATE INDEX "terms_school_year_status_starts_on_idx"
ON "terms"("school_id", "academic_year_id", "status", "starts_on");

CREATE UNIQUE INDEX "academic_classes_school_id_id_key"
ON "academic_classes"("school_id", "id");
CREATE UNIQUE INDEX "academic_classes_school_id_academic_year_id_name_key"
ON "academic_classes"("school_id", "academic_year_id", "name_key");
CREATE INDEX "academic_classes_school_year_status_idx"
ON "academic_classes"("school_id", "academic_year_id", "status");

CREATE UNIQUE INDEX "class_streams_school_id_class_id_name_key"
ON "class_streams"("school_id", "class_id", "name_key");
CREATE INDEX "class_streams_school_class_status_idx"
ON "class_streams"("school_id", "class_id", "status");

CREATE UNIQUE INDEX "subjects_school_id_id_key"
ON "subjects"("school_id", "id");
CREATE UNIQUE INDEX "subjects_school_id_name_key"
ON "subjects"("school_id", "name_key");
CREATE INDEX "subjects_school_status_name_idx"
ON "subjects"("school_id", "status", "name");

CREATE UNIQUE INDEX "class_subject_assignments_school_class_subject_key"
ON "class_subject_assignments"("school_id", "class_id", "subject_id");
CREATE INDEX "class_subject_assignments_school_class_status_idx"
ON "class_subject_assignments"("school_id", "class_id", "status");
CREATE INDEX "class_subject_assignments_school_subject_status_idx"
ON "class_subject_assignments"("school_id", "subject_id", "status");

ALTER TABLE "academic_years"
ADD CONSTRAINT "academic_years_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "terms"
ADD CONSTRAINT "terms_school_id_academic_year_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id")
REFERENCES "academic_years"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic_classes"
ADD CONSTRAINT "academic_classes_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_classes"
ADD CONSTRAINT "academic_classes_school_id_academic_year_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id")
REFERENCES "academic_years"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_streams"
ADD CONSTRAINT "class_streams_school_id_class_id_fkey"
FOREIGN KEY ("school_id", "class_id")
REFERENCES "academic_classes"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subjects"
ADD CONSTRAINT "subjects_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_subject_assignments"
ADD CONSTRAINT "class_subject_assignments_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_subject_assignments"
ADD CONSTRAINT "class_subject_assignments_school_id_class_id_fkey"
FOREIGN KEY ("school_id", "class_id")
REFERENCES "academic_classes"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_subject_assignments"
ADD CONSTRAINT "class_subject_assignments_school_id_subject_id_fkey"
FOREIGN KEY ("school_id", "subject_id")
REFERENCES "subjects"("school_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
