-- Phase 05: school-scoped staff profiles, employment episodes, and teaching assignments.
-- Requires the identity, school/academic configuration, and admissions migrations.

CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "staff_departments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "staff_departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_departments_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL)
);

CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_number" VARCHAR(80) NOT NULL,
    "staff_number_key" VARCHAR(80) NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "family_name" VARCHAR(100) NOT NULL,
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(40),
    "position_title" VARCHAR(120) NOT NULL,
    "department_id" UUID,
    "user_id" UUID,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "staff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_required_fields_check" CHECK (
        NULLIF(BTRIM("staff_number"), '') IS NOT NULL
        AND NULLIF(BTRIM("staff_number_key"), '') IS NOT NULL
        AND NULLIF(BTRIM("given_name"), '') IS NOT NULL
        AND NULLIF(BTRIM("family_name"), '') IS NOT NULL
        AND NULLIF(BTRIM("position_title"), '') IS NOT NULL
    )
);

CREATE TABLE "staff_employments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "position_title" VARCHAR(120) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_employments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_employments_position_title_check" CHECK (NULLIF(BTRIM("position_title"), '') IS NOT NULL),
    CONSTRAINT "staff_employments_date_range_check" CHECK ("ends_on" IS NULL OR "ends_on" >= "starts_on")
);

CREATE TABLE "staff_status_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "from_status" "StaffStatus",
    "to_status" "StaffStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(80),
    CONSTRAINT "staff_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_class_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "stream_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "staff_class_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_class_assignments_end_after_create_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "created_at")
);

CREATE TABLE "staff_subject_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "class_subject_assignment_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "staff_subject_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_subject_assignments_end_after_create_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "created_at")
);

CREATE UNIQUE INDEX "staff_departments_school_id_id_key" ON "staff_departments"("school_id", "id");
CREATE UNIQUE INDEX "staff_departments_school_name_key" ON "staff_departments"("school_id", "name_key");
CREATE INDEX "staff_departments_school_status_name_idx" ON "staff_departments"("school_id", "status", "name");
CREATE UNIQUE INDEX "staff_school_id_id_key" ON "staff"("school_id", "id");
CREATE UNIQUE INDEX "staff_school_staff_number_key" ON "staff"("school_id", "staff_number_key");
CREATE UNIQUE INDEX "staff_school_user_id_key" ON "staff"("school_id", "user_id");
CREATE INDEX "staff_school_status_name_idx" ON "staff"("school_id", "status", "family_name", "given_name");
CREATE INDEX "staff_school_department_status_idx" ON "staff"("school_id", "department_id", "status");
CREATE UNIQUE INDEX "staff_employments_school_id_id_key" ON "staff_employments"("school_id", "id");
CREATE INDEX "staff_employments_school_staff_starts_on_idx" ON "staff_employments"("school_id", "staff_id", "starts_on");
CREATE UNIQUE INDEX "staff_employments_one_current_per_staff_key"
    ON "staff_employments"("school_id", "staff_id") WHERE "ends_on" IS NULL;
CREATE INDEX "staff_status_events_school_staff_occurred_at_idx" ON "staff_status_events"("school_id", "staff_id", "occurred_at");
CREATE UNIQUE INDEX "staff_class_assignments_school_id_id_key" ON "staff_class_assignments"("school_id", "id");
CREATE INDEX "staff_class_assignments_school_staff_created_at_idx" ON "staff_class_assignments"("school_id", "staff_id", "created_at");
CREATE INDEX "staff_class_assignments_school_class_stream_idx" ON "staff_class_assignments"("school_id", "class_id", "stream_id");
CREATE UNIQUE INDEX "staff_class_assignments_active_class_scope_key"
    ON "staff_class_assignments"("school_id", "staff_id", "class_id")
    WHERE "ended_at" IS NULL AND "stream_id" IS NULL;
CREATE UNIQUE INDEX "staff_class_assignments_active_stream_scope_key"
    ON "staff_class_assignments"("school_id", "staff_id", "class_id", "stream_id")
    WHERE "ended_at" IS NULL AND "stream_id" IS NOT NULL;
CREATE UNIQUE INDEX "staff_subject_assignments_school_id_id_key" ON "staff_subject_assignments"("school_id", "id");
CREATE INDEX "staff_subject_assignments_school_staff_created_at_idx" ON "staff_subject_assignments"("school_id", "staff_id", "created_at");
CREATE INDEX "staff_subject_assignments_school_class_subject_idx" ON "staff_subject_assignments"("school_id", "class_subject_assignment_id");
CREATE UNIQUE INDEX "staff_subject_assignments_active_staff_target_key"
    ON "staff_subject_assignments"("school_id", "staff_id", "class_subject_assignment_id")
    WHERE "ended_at" IS NULL;

CREATE UNIQUE INDEX "class_subject_assignments_school_id_id_key"
    ON "class_subject_assignments"("school_id", "id");

ALTER TABLE "staff_departments"
    ADD CONSTRAINT "staff_departments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff"
    ADD CONSTRAINT "staff_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff"
    ADD CONSTRAINT "staff_school_id_department_id_fkey"
    FOREIGN KEY ("school_id", "department_id") REFERENCES "staff_departments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff"
    ADD CONSTRAINT "staff_school_id_user_id_fkey"
    FOREIGN KEY ("school_id", "user_id") REFERENCES "school_memberships"("school_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_employments"
    ADD CONSTRAINT "staff_employments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_employments"
    ADD CONSTRAINT "staff_employments_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_status_events"
    ADD CONSTRAINT "staff_status_events_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_status_events"
    ADD CONSTRAINT "staff_status_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_class_assignments"
    ADD CONSTRAINT "staff_class_assignments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_class_assignments"
    ADD CONSTRAINT "staff_class_assignments_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_class_assignments"
    ADD CONSTRAINT "staff_class_assignments_school_id_class_id_fkey"
    FOREIGN KEY ("school_id", "class_id") REFERENCES "academic_classes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_class_assignments"
    ADD CONSTRAINT "staff_class_assignments_school_id_class_id_stream_id_fkey"
    FOREIGN KEY ("school_id", "class_id", "stream_id") REFERENCES "class_streams"("school_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_subject_assignments"
    ADD CONSTRAINT "staff_subject_assignments_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_subject_assignments"
    ADD CONSTRAINT "staff_subject_assignments_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_subject_assignments"
    ADD CONSTRAINT "staff_subject_assignments_school_id_class_subject_assignme_fkey"
    FOREIGN KEY ("school_id", "class_subject_assignment_id") REFERENCES "class_subject_assignments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
