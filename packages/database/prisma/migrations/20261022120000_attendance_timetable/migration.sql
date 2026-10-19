-- Phase 06: attendance registers, recurring timetables, periods, rooms, and availability.
-- Requires the identity, academic configuration, admissions, and staff migrations.

CREATE TYPE "AttendanceRegisterType" AS ENUM ('STUDENT_DAILY', 'STUDENT_LESSON', 'STAFF_DAILY');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EARLY_DEPARTURE');
CREATE TYPE "AttendanceRegisterStatus" AS ENUM ('OPEN', 'FINALIZED');
CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

CREATE TABLE "attendance_absence_reasons" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(300) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "attendance_absence_reasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_absence_reasons_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL)
);

CREATE TABLE "timetable_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(240) NOT NULL,
    "position" INTEGER NOT NULL,
    "starts_at" TIME(6) NOT NULL,
    "ends_at" TIME(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_periods_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
    CONSTRAINT "timetable_periods_position_check" CHECK ("position" > 0),
    CONSTRAINT "timetable_periods_time_check" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "school_rooms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(300) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "school_rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "school_rooms_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
    CONSTRAINT "school_rooms_capacity_check" CHECK ("capacity" > 0)
);

CREATE TABLE "staff_availability_windows" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "starts_at" TIME(6) NOT NULL,
    "ends_at" TIME(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_availability_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_availability_windows_time_check" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "timetables" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(300) NOT NULL,
    "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetables_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
    CONSTRAINT "timetables_publication_state_check" CHECK (
        ("status" = 'DRAFT' AND "published_at" IS NULL)
        OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
    )
);

CREATE TABLE "timetable_lessons" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "timetable_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "stream_id" UUID,
    "class_subject_assignment_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "room_id" UUID,
    "weekday" "Weekday" NOT NULL,
    "start_period_id" UUID NOT NULL,
    "end_period_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "timetable_lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_registers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID,
    "stream_id" UUID,
    "timetable_lesson_id" UUID,
    "type" "AttendanceRegisterType" NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "created_by_user_id" UUID NOT NULL,
    "finalized_by_user_id" UUID,
    "finalized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_registers_scope_check" CHECK (
        ("type" = 'STUDENT_DAILY' AND "class_id" IS NOT NULL AND "timetable_lesson_id" IS NULL)
        OR ("type" = 'STUDENT_LESSON' AND "class_id" IS NOT NULL AND "timetable_lesson_id" IS NOT NULL)
        OR ("type" = 'STAFF_DAILY' AND "class_id" IS NULL AND "stream_id" IS NULL AND "timetable_lesson_id" IS NULL)
    ),
    CONSTRAINT "attendance_registers_stream_check" CHECK ("stream_id" IS NULL OR "class_id" IS NOT NULL),
    CONSTRAINT "attendance_registers_finalization_check" CHECK (
        ("status" = 'OPEN' AND "finalized_by_user_id" IS NULL AND "finalized_at" IS NULL)
        OR ("status" = 'FINALIZED' AND "finalized_by_user_id" IS NOT NULL AND "finalized_at" IS NOT NULL)
    )
);

CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "status" "AttendanceStatus" NOT NULL,
    "reason_id" UUID,
    "arrival_at" TIME(6),
    "departure_at" TIME(6),
    "marked_by_user_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_records_single_attendee_check" CHECK (
        ("student_id" IS NOT NULL) <> ("staff_id" IS NOT NULL)
    ),
    CONSTRAINT "attendance_records_status_data_check" CHECK (
        ("status" = 'LATE' AND "arrival_at" IS NOT NULL AND "departure_at" IS NULL)
        OR ("status" = 'EARLY_DEPARTURE' AND "arrival_at" IS NULL AND "departure_at" IS NOT NULL)
        OR ("status" IN ('PRESENT', 'ABSENT') AND "arrival_at" IS NULL AND "departure_at" IS NULL)
    ),
    CONSTRAINT "attendance_records_reason_check" CHECK ("reason_id" IS NULL OR "status" = 'ABSENT')
);

CREATE FUNCTION "enforce_attendance_register_type"() RETURNS trigger AS $$
DECLARE
    register_type "AttendanceRegisterType";
BEGIN
    SELECT "type" INTO register_type
    FROM "attendance_registers"
    WHERE "school_id" = NEW."school_id" AND "id" = NEW."register_id";

    IF register_type = 'STAFF_DAILY' AND (NEW."staff_id" IS NULL OR NEW."student_id" IS NOT NULL) THEN
        RAISE EXCEPTION 'Staff registers accept only staff attendance records';
    END IF;
    IF register_type IN ('STUDENT_DAILY', 'STUDENT_LESSON')
       AND (NEW."student_id" IS NULL OR NEW."staff_id" IS NOT NULL) THEN
        RAISE EXCEPTION 'Student registers accept only student attendance records';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attendance_records_register_type_trigger"
    BEFORE INSERT OR UPDATE OF "school_id", "register_id", "student_id", "staff_id"
    ON "attendance_records"
    FOR EACH ROW EXECUTE FUNCTION "enforce_attendance_register_type"();

CREATE TABLE "attendance_record_revisions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "before_data" JSONB NOT NULL,
    "after_data" JSONB NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_id" VARCHAR(80),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_record_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "timetable_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "timetable_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "request_id" VARCHAR(80),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timetable_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_events_type_check" CHECK ("event_type" IN ('PUBLISHED', 'UNPUBLISHED'))
);

CREATE UNIQUE INDEX "class_subject_assignments_school_class_id_key"
    ON "class_subject_assignments"("school_id", "class_id", "id");

CREATE UNIQUE INDEX "attendance_absence_reasons_school_id_id_key" ON "attendance_absence_reasons"("school_id", "id");
CREATE UNIQUE INDEX "attendance_absence_reasons_school_name_key" ON "attendance_absence_reasons"("school_id", "name_key");
CREATE INDEX "attendance_absence_reasons_school_status_name_idx" ON "attendance_absence_reasons"("school_id", "status", "name");

CREATE UNIQUE INDEX "timetable_periods_school_id_id_key" ON "timetable_periods"("school_id", "id");
CREATE UNIQUE INDEX "timetable_periods_school_name_key" ON "timetable_periods"("school_id", "name_key");
CREATE UNIQUE INDEX "timetable_periods_school_position_key" ON "timetable_periods"("school_id", "position");
CREATE INDEX "timetable_periods_school_time_idx" ON "timetable_periods"("school_id", "starts_at", "ends_at");

CREATE UNIQUE INDEX "school_rooms_school_id_id_key" ON "school_rooms"("school_id", "id");
CREATE UNIQUE INDEX "school_rooms_school_name_key" ON "school_rooms"("school_id", "name_key");
CREATE INDEX "school_rooms_school_status_name_idx" ON "school_rooms"("school_id", "status", "name");

CREATE UNIQUE INDEX "staff_availability_windows_school_id_id_key" ON "staff_availability_windows"("school_id", "id");
CREATE INDEX "staff_availability_school_staff_day_idx"
    ON "staff_availability_windows"("school_id", "staff_id", "weekday", "starts_at", "ends_at");

CREATE UNIQUE INDEX "timetables_school_id_id_key" ON "timetables"("school_id", "id");
CREATE UNIQUE INDEX "timetables_school_year_id_key" ON "timetables"("school_id", "academic_year_id", "id");
CREATE UNIQUE INDEX "timetables_school_year_name_key" ON "timetables"("school_id", "academic_year_id", "name_key");
CREATE UNIQUE INDEX "timetables_one_published_per_year_key"
    ON "timetables"("school_id", "academic_year_id") WHERE "status" = 'PUBLISHED';
CREATE INDEX "timetables_school_year_status_idx" ON "timetables"("school_id", "academic_year_id", "status");

CREATE UNIQUE INDEX "timetable_lessons_school_id_id_key" ON "timetable_lessons"("school_id", "id");
CREATE INDEX "timetable_lessons_school_timetable_day_idx" ON "timetable_lessons"("school_id", "timetable_id", "weekday");
CREATE INDEX "timetable_lessons_school_staff_day_idx" ON "timetable_lessons"("school_id", "staff_id", "weekday");
CREATE INDEX "timetable_lessons_school_class_day_idx" ON "timetable_lessons"("school_id", "class_id", "stream_id", "weekday");
CREATE INDEX "timetable_lessons_school_room_day_idx" ON "timetable_lessons"("school_id", "room_id", "weekday");

CREATE UNIQUE INDEX "attendance_registers_school_id_id_key" ON "attendance_registers"("school_id", "id");
CREATE INDEX "attendance_registers_school_year_date_type_idx"
    ON "attendance_registers"("school_id", "academic_year_id", "date", "type");
CREATE INDEX "attendance_registers_school_class_date_idx"
    ON "attendance_registers"("school_id", "class_id", "stream_id", "date");
CREATE UNIQUE INDEX "attendance_registers_student_daily_class_key"
    ON "attendance_registers"("school_id", "academic_year_id", "class_id", "date")
    WHERE "type" = 'STUDENT_DAILY' AND "stream_id" IS NULL;
CREATE UNIQUE INDEX "attendance_registers_student_daily_stream_key"
    ON "attendance_registers"("school_id", "academic_year_id", "class_id", "stream_id", "date")
    WHERE "type" = 'STUDENT_DAILY' AND "stream_id" IS NOT NULL;
CREATE UNIQUE INDEX "attendance_registers_student_lesson_key"
    ON "attendance_registers"("school_id", "timetable_lesson_id", "date")
    WHERE "type" = 'STUDENT_LESSON';
CREATE UNIQUE INDEX "attendance_registers_staff_daily_key"
    ON "attendance_registers"("school_id", "academic_year_id", "date")
    WHERE "type" = 'STAFF_DAILY';

CREATE UNIQUE INDEX "attendance_records_school_id_id_key" ON "attendance_records"("school_id", "id");
CREATE UNIQUE INDEX "attendance_records_student_per_register_key"
    ON "attendance_records"("school_id", "register_id", "student_id") WHERE "student_id" IS NOT NULL;
CREATE UNIQUE INDEX "attendance_records_staff_per_register_key"
    ON "attendance_records"("school_id", "register_id", "staff_id") WHERE "staff_id" IS NOT NULL;
CREATE INDEX "attendance_records_school_register_status_idx" ON "attendance_records"("school_id", "register_id", "status");
CREATE INDEX "attendance_records_school_student_marked_at_idx" ON "attendance_records"("school_id", "student_id", "marked_at");
CREATE INDEX "attendance_records_school_staff_marked_at_idx" ON "attendance_records"("school_id", "staff_id", "marked_at");
CREATE INDEX "attendance_record_revisions_school_record_time_idx"
    ON "attendance_record_revisions"("school_id", "record_id", "occurred_at");
CREATE INDEX "timetable_events_school_timetable_time_idx"
    ON "timetable_events"("school_id", "timetable_id", "occurred_at");

ALTER TABLE "attendance_absence_reasons"
    ADD CONSTRAINT "attendance_absence_reasons_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_periods"
    ADD CONSTRAINT "timetable_periods_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_rooms"
    ADD CONSTRAINT "school_rooms_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_availability_windows"
    ADD CONSTRAINT "staff_availability_windows_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_availability_windows"
    ADD CONSTRAINT "staff_availability_windows_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetables"
    ADD CONSTRAINT "timetables_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetables"
    ADD CONSTRAINT "timetables_school_id_academic_year_id_fkey"
    FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_years"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_academic_year_id_timetable_id_fkey"
    FOREIGN KEY ("school_id", "academic_year_id", "timetable_id") REFERENCES "timetables"("school_id", "academic_year_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_academic_year_id_class_id_fkey"
    FOREIGN KEY ("school_id", "academic_year_id", "class_id") REFERENCES "academic_classes"("school_id", "academic_year_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_class_id_stream_id_fkey"
    FOREIGN KEY ("school_id", "class_id", "stream_id") REFERENCES "class_streams"("school_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_class_id_class_subject_assignment_id_fkey"
    FOREIGN KEY ("school_id", "class_id", "class_subject_assignment_id") REFERENCES "class_subject_assignments"("school_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_room_id_fkey"
    FOREIGN KEY ("school_id", "room_id") REFERENCES "school_rooms"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_start_period_id_fkey"
    FOREIGN KEY ("school_id", "start_period_id") REFERENCES "timetable_periods"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_lessons"
    ADD CONSTRAINT "timetable_lessons_school_id_end_period_id_fkey"
    FOREIGN KEY ("school_id", "end_period_id") REFERENCES "timetable_periods"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_school_id_academic_year_id_fkey"
    FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_years"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_school_id_academic_year_id_class_id_fkey"
    FOREIGN KEY ("school_id", "academic_year_id", "class_id") REFERENCES "academic_classes"("school_id", "academic_year_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_school_id_class_id_stream_id_fkey"
    FOREIGN KEY ("school_id", "class_id", "stream_id") REFERENCES "class_streams"("school_id", "class_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_school_id_timetable_lesson_id_fkey"
    FOREIGN KEY ("school_id", "timetable_lesson_id") REFERENCES "timetable_lessons"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_registers"
    ADD CONSTRAINT "attendance_registers_finalized_by_user_id_fkey"
    FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_school_id_register_id_fkey"
    FOREIGN KEY ("school_id", "register_id") REFERENCES "attendance_registers"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_school_id_student_id_fkey"
    FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_school_id_staff_id_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_school_id_reason_id_fkey"
    FOREIGN KEY ("school_id", "reason_id") REFERENCES "attendance_absence_reasons"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_marked_by_user_id_fkey"
    FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_record_revisions"
    ADD CONSTRAINT "attendance_record_revisions_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_record_revisions"
    ADD CONSTRAINT "attendance_record_revisions_school_id_record_id_fkey"
    FOREIGN KEY ("school_id", "record_id") REFERENCES "attendance_records"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_record_revisions"
    ADD CONSTRAINT "attendance_record_revisions_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_events"
    ADD CONSTRAINT "timetable_events_school_id_timetable_id_fkey"
    FOREIGN KEY ("school_id", "timetable_id") REFERENCES "timetables"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_events"
    ADD CONSTRAINT "timetable_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
