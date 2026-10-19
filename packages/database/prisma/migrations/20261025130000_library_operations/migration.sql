-- Phase 11 Library v1: catalog, school-wide circulation, reservations, and policy.
-- Fines and branch-scoped circulation are intentionally not included.

CREATE TYPE "LibraryReservationStatus" AS ENUM (
    'QUEUED',
    'READY',
    'FULFILLED',
    'CANCELLED',
    'EXPIRED'
);

CREATE TABLE "library_categories" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(300) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "library_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_categories_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL)
);

CREATE TABLE "library_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "category_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "author" VARCHAR(240),
    "isbn" VARCHAR(24),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_items_title_check" CHECK (NULLIF(BTRIM("title"), '') IS NOT NULL)
);

CREATE TABLE "library_copies" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "library_copies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "library_policies" (
    "school_id" UUID NOT NULL,
    "loan_period_days" INTEGER NOT NULL,
    "max_active_loans" INTEGER NOT NULL,
    "max_renewals" INTEGER NOT NULL,
    "reservation_hold_days" INTEGER NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "library_policies_pkey" PRIMARY KEY ("school_id"),
    CONSTRAINT "library_policies_values_check" CHECK (
        "loan_period_days" > 0
        AND "max_active_loans" > 0
        AND "max_renewals" >= 0
        AND "reservation_hold_days" > 0
    )
);

CREATE TABLE "library_loans" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "copy_id" UUID NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "checked_out_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_on" DATE NOT NULL,
    "returned_at" TIMESTAMPTZ(6),
    "renewal_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "library_loans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_loans_one_borrower_check" CHECK (
        ("student_id" IS NOT NULL AND "staff_id" IS NULL)
        OR ("student_id" IS NULL AND "staff_id" IS NOT NULL)
    ),
    CONSTRAINT "library_loans_renewal_count_check" CHECK ("renewal_count" >= 0)
);

CREATE TABLE "library_reservations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "copy_id" UUID,
    "student_id" UUID,
    "staff_id" UUID,
    "status" "LibraryReservationStatus" NOT NULL DEFAULT 'QUEUED',
    "ready_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "library_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_reservations_one_borrower_check" CHECK (
        ("student_id" IS NOT NULL AND "staff_id" IS NULL)
        OR ("student_id" IS NULL AND "staff_id" IS NOT NULL)
    ),
    CONSTRAINT "library_reservations_ready_check" CHECK (
        ("status" <> 'READY')
        OR ("copy_id" IS NOT NULL AND "ready_at" IS NOT NULL AND "expires_at" IS NOT NULL)
    ),
    CONSTRAINT "library_reservations_queued_check" CHECK (
        ("status" <> 'QUEUED')
        OR ("copy_id" IS NULL AND "ready_at" IS NULL AND "expires_at" IS NULL)
    ),
    CONSTRAINT "library_reservations_completed_check" CHECK (
        ("status" IN ('QUEUED', 'READY') AND "completed_at" IS NULL)
        OR ("status" IN ('FULFILLED', 'CANCELLED', 'EXPIRED') AND "completed_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "library_categories_school_id_id_key"
    ON "library_categories"("school_id", "id");
CREATE UNIQUE INDEX "library_categories_school_name_key"
    ON "library_categories"("school_id", "name_key");
CREATE INDEX "library_categories_school_archived_name_idx"
    ON "library_categories"("school_id", "archived_at", "name");

CREATE UNIQUE INDEX "library_items_school_id_id_key"
    ON "library_items"("school_id", "id");
CREATE INDEX "library_items_school_archived_title_idx"
    ON "library_items"("school_id", "archived_at", "title", "id");
CREATE INDEX "library_items_school_category_idx"
    ON "library_items"("school_id", "category_id");

CREATE UNIQUE INDEX "library_copies_school_id_id_key"
    ON "library_copies"("school_id", "id");
CREATE UNIQUE INDEX "library_copies_school_item_id_key"
    ON "library_copies"("school_id", "item_id", "id");
CREATE INDEX "library_copies_school_item_archived_idx"
    ON "library_copies"("school_id", "item_id", "archived_at");

CREATE UNIQUE INDEX "library_loans_school_id_id_key"
    ON "library_loans"("school_id", "id");
CREATE UNIQUE INDEX "library_loans_active_copy_key"
    ON "library_loans"("school_id", "copy_id")
    WHERE "returned_at" IS NULL;
CREATE INDEX "library_loans_school_student_checkout_idx"
    ON "library_loans"("school_id", "student_id", "checked_out_at");
CREATE INDEX "library_loans_school_staff_checkout_idx"
    ON "library_loans"("school_id", "staff_id", "checked_out_at");
CREATE INDEX "library_loans_school_item_checkout_idx"
    ON "library_loans"("school_id", "item_id", "checked_out_at");

CREATE UNIQUE INDEX "library_reservations_school_id_id_key"
    ON "library_reservations"("school_id", "id");
CREATE UNIQUE INDEX "library_reservations_active_student_item_key"
    ON "library_reservations"("school_id", "item_id", "student_id")
    WHERE "student_id" IS NOT NULL AND "status" IN ('QUEUED', 'READY');
CREATE UNIQUE INDEX "library_reservations_active_staff_item_key"
    ON "library_reservations"("school_id", "item_id", "staff_id")
    WHERE "staff_id" IS NOT NULL AND "status" IN ('QUEUED', 'READY');
CREATE UNIQUE INDEX "library_reservations_ready_copy_key"
    ON "library_reservations"("school_id", "copy_id")
    WHERE "status" = 'READY';
CREATE INDEX "library_reservations_school_queue_idx"
    ON "library_reservations"("school_id", "item_id", "status", "created_at", "id");
CREATE INDEX "library_reservations_school_student_status_idx"
    ON "library_reservations"("school_id", "student_id", "status");
CREATE INDEX "library_reservations_school_staff_status_idx"
    ON "library_reservations"("school_id", "staff_id", "status");

ALTER TABLE "library_categories"
    ADD CONSTRAINT "library_categories_school_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "library_items"
    ADD CONSTRAINT "library_items_school_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_items_category_fkey"
    FOREIGN KEY ("school_id", "category_id")
    REFERENCES "library_categories"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "library_copies"
    ADD CONSTRAINT "library_copies_school_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_copies_item_fkey"
    FOREIGN KEY ("school_id", "item_id")
    REFERENCES "library_items"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "library_policies"
    ADD CONSTRAINT "library_policies_school_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_policies_updated_by_fkey"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "library_loans"
    ADD CONSTRAINT "library_loans_school_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_loans_item_fkey"
    FOREIGN KEY ("school_id", "item_id")
    REFERENCES "library_items"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_loans_copy_fkey"
    FOREIGN KEY ("school_id", "item_id", "copy_id")
    REFERENCES "library_copies"("school_id", "item_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_loans_student_fkey"
    FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_loans_staff_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "library_reservations"
    ADD CONSTRAINT "library_reservations_school_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_reservations_item_fkey"
    FOREIGN KEY ("school_id", "item_id")
    REFERENCES "library_items"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_reservations_copy_fkey"
    FOREIGN KEY ("school_id", "item_id", "copy_id")
    REFERENCES "library_copies"("school_id", "item_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_reservations_student_fkey"
    FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "library_reservations_staff_fkey"
    FOREIGN KEY ("school_id", "staff_id") REFERENCES "staff"("school_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
