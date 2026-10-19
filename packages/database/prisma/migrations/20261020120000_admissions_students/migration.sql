-- Phase 04: staff-managed admissions, student records, guardian links, and placements.
-- Historical records are retained; all tenant-owned relationships include school_id.

CREATE TYPE "AdmissionApplicationStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
    'ADMITTED'
);

CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN');

CREATE TABLE "admission_applications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "status" "AdmissionApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "possible_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "admitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardians_contact_required_check" CHECK (
        NULLIF(BTRIM("email"), '') IS NOT NULL OR NULLIF(BTRIM("phone"), '') IS NOT NULL
    )
);

CREATE TABLE "admission_application_guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "existing_guardian_id" UUID,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "relationship" VARCHAR(60) NOT NULL,
    "authorized_access" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "admission_application_guardians_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admission_application_guardians_contact_required_check" CHECK (
        NULLIF(BTRIM("email"), '') IS NOT NULL OR NULLIF(BTRIM("phone"), '') IS NOT NULL
    )
);

CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "admission_application_id" UUID NOT NULL,
    "admission_year_id" UUID NOT NULL,
    "admission_number" VARCHAR(32) NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" VARCHAR(60) NOT NULL,
    "authorized_access" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_placements" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "stream_id" UUID,
    "assigned_by_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "student_placements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admission_number_counters" (
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "admission_number_counters_pkey" PRIMARY KEY ("school_id", "academic_year_id")
);

CREATE TABLE "admission_application_status_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "from_status" "AdmissionApplicationStatus",
    "to_status" "AdmissionApplicationStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(80),
    CONSTRAINT "admission_application_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_status_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "from_status" "StudentStatus",
    "to_status" "StudentStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(80),
    CONSTRAINT "student_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_profile_revisions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(80),
    CONSTRAINT "student_profile_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardian_profile_revisions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(80),
    CONSTRAINT "guardian_profile_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admission_applications_school_id_status_created_at_idx"
ON "admission_applications"("school_id", "status", "created_at");
CREATE UNIQUE INDEX "class_streams_school_class_id_key"
ON "class_streams"("school_id", "class_id", "id");
CREATE UNIQUE INDEX "academic_classes_school_year_id_key"
ON "academic_classes"("school_id", "academic_year_id", "id");
CREATE UNIQUE INDEX "admission_applications_school_id_id_key"
ON "admission_applications"("school_id", "id");
CREATE UNIQUE INDEX "admission_applications_idempotency_key"
ON "admission_applications"("school_id", "created_by_user_id", "idempotency_key");
CREATE INDEX "admission_application_guardians_school_id_application_id_idx"
ON "admission_application_guardians"("school_id", "application_id");
CREATE UNIQUE INDEX "admission_application_guardians_school_id_application_id_id_key"
ON "admission_application_guardians"("school_id", "application_id", "id");
CREATE INDEX "guardians_school_id_family_name_given_name_idx"
ON "guardians"("school_id", "family_name", "given_name");
CREATE UNIQUE INDEX "guardians_school_id_id_key" ON "guardians"("school_id", "id");
CREATE UNIQUE INDEX "students_admission_application_id_key" ON "students"("admission_application_id");
CREATE INDEX "students_school_id_status_family_name_given_name_idx"
ON "students"("school_id", "status", "family_name", "given_name");
CREATE UNIQUE INDEX "students_school_id_id_key" ON "students"("school_id", "id");
CREATE UNIQUE INDEX "students_school_id_admission_application_id_key"
ON "students"("school_id", "admission_application_id");
CREATE UNIQUE INDEX "students_school_year_admission_number_key"
ON "students"("school_id", "admission_year_id", "admission_number");
CREATE INDEX "student_guardians_school_id_guardian_id_authorized_access_idx"
ON "student_guardians"("school_id", "guardian_id", "authorized_access");
CREATE UNIQUE INDEX "student_guardians_school_student_guardian_key"
ON "student_guardians"("school_id", "student_id", "guardian_id");
CREATE INDEX "student_placements_school_id_class_id_started_at_idx"
ON "student_placements"("school_id", "class_id", "started_at");
CREATE UNIQUE INDEX "student_placements_school_student_year_key"
ON "student_placements"("school_id", "student_id", "academic_year_id");
CREATE INDEX "admission_application_status_events_school_id_application_i_idx"
ON "admission_application_status_events"("school_id", "application_id", "occurred_at");
CREATE INDEX "student_status_events_school_id_student_id_occurred_at_idx"
ON "student_status_events"("school_id", "student_id", "occurred_at");
CREATE INDEX "student_profile_revisions_school_id_student_id_recorded_at_idx"
ON "student_profile_revisions"("school_id", "student_id", "recorded_at");
CREATE INDEX "guardian_profile_revisions_school_id_guardian_id_recorded_a_idx"
ON "guardian_profile_revisions"("school_id", "guardian_id", "recorded_at");

ALTER TABLE "admission_applications"
ADD CONSTRAINT "admission_applications_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_applications"
ADD CONSTRAINT "admission_applications_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardians"
ADD CONSTRAINT "guardians_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_application_guardians"
ADD CONSTRAINT "admission_application_guardians_school_id_application_id_fkey"
FOREIGN KEY ("school_id", "application_id") REFERENCES "admission_applications"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_application_guardians"
ADD CONSTRAINT "admission_application_guardians_school_id_existing_guardia_fkey"
FOREIGN KEY ("school_id", "existing_guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students"
ADD CONSTRAINT "students_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students"
ADD CONSTRAINT "students_school_id_admission_application_id_fkey"
FOREIGN KEY ("school_id", "admission_application_id") REFERENCES "admission_applications"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students"
ADD CONSTRAINT "students_school_id_admission_year_id_fkey"
FOREIGN KEY ("school_id", "admission_year_id") REFERENCES "academic_years"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_guardians"
ADD CONSTRAINT "student_guardians_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_guardians"
ADD CONSTRAINT "student_guardians_school_id_student_id_fkey"
FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_guardians"
ADD CONSTRAINT "student_guardians_school_id_guardian_id_fkey"
FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_placements"
ADD CONSTRAINT "student_placements_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_placements"
ADD CONSTRAINT "student_placements_school_id_student_id_fkey"
FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_placements"
ADD CONSTRAINT "student_placements_school_id_academic_year_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_years"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_placements"
ADD CONSTRAINT "student_placements_school_id_academic_year_id_class_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id", "class_id") REFERENCES "academic_classes"("school_id", "academic_year_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_placements"
ADD CONSTRAINT "student_placements_school_id_class_id_stream_id_fkey"
FOREIGN KEY ("school_id", "class_id", "stream_id") REFERENCES "class_streams"("school_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_placements"
ADD CONSTRAINT "student_placements_assigned_by_user_id_fkey"
FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_number_counters"
ADD CONSTRAINT "admission_number_counters_school_id_fkey"
FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_number_counters"
ADD CONSTRAINT "admission_number_counters_school_id_academic_year_id_fkey"
FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_years"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_application_status_events"
ADD CONSTRAINT "admission_application_status_events_school_id_application__fkey"
FOREIGN KEY ("school_id", "application_id") REFERENCES "admission_applications"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_application_status_events"
ADD CONSTRAINT "admission_application_status_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_status_events"
ADD CONSTRAINT "student_status_events_school_id_student_id_fkey"
FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_status_events"
ADD CONSTRAINT "student_status_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_profile_revisions"
ADD CONSTRAINT "student_profile_revisions_school_id_student_id_fkey"
FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_profile_revisions"
ADD CONSTRAINT "student_profile_revisions_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardian_profile_revisions"
ADD CONSTRAINT "guardian_profile_revisions_school_id_guardian_id_fkey"
FOREIGN KEY ("school_id", "guardian_id") REFERENCES "guardians"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardian_profile_revisions"
ADD CONSTRAINT "guardian_profile_revisions_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
