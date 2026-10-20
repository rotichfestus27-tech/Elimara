-- Phase 08: append-only school finance records using KES and exact decimals.
-- This migration is authored for review; it has not been applied.

CREATE TYPE "FinancialAdjustmentDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "PaymentReconciliationOutcome" AS ENUM ('MATCHED', 'EXCEPTION');

CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_structures_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "fee_structures_school_id_id_key" ON "fee_structures"("school_id", "id");
CREATE UNIQUE INDEX "fee_structures_school_scope_name_key" ON "fee_structures"("school_id", "academic_year_id", "term_id", "class_id", "name_key");
CREATE INDEX "fee_structures_school_scope_status_idx" ON "fee_structures"("school_id", "academic_year_id", "term_id", "class_id", "status");
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_year_fkey" FOREIGN KEY ("school_id", "academic_year_id") REFERENCES "academic_years"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_year_term_fkey" FOREIGN KEY ("school_id", "academic_year_id", "term_id") REFERENCES "terms"("school_id", "academic_year_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_year_class_fkey" FOREIGN KEY ("school_id", "academic_year_id", "class_id") REFERENCES "academic_classes"("school_id", "academic_year_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fee_structure_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_key" VARCHAR(360) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_structure_items_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "fee_structure_items_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
    CONSTRAINT "fee_structure_items_position_check" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "fee_structure_items_school_id_id_key" ON "fee_structure_items"("school_id", "id");
CREATE UNIQUE INDEX "fee_structure_items_school_structure_name_key" ON "fee_structure_items"("school_id", "fee_structure_id", "name_key");
CREATE UNIQUE INDEX "fee_structure_items_school_structure_position_key" ON "fee_structure_items"("school_id", "fee_structure_id", "position");
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_structure_fkey" FOREIGN KEY ("school_id", "fee_structure_id") REFERENCES "fee_structures"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "student_financial_accounts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "student_financial_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_financial_accounts_school_id_id_key" ON "student_financial_accounts"("school_id", "id");
CREATE UNIQUE INDEX "student_financial_accounts_school_student_key" ON "student_financial_accounts"("school_id", "student_id");
ALTER TABLE "student_financial_accounts" ADD CONSTRAINT "student_financial_accounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_financial_accounts" ADD CONSTRAINT "student_financial_accounts_student_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "student_fee_charges" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "structure_name" VARCHAR(120) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_fee_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_fee_charges_amount_check" CHECK ("total_amount" > 0)
);
CREATE UNIQUE INDEX "student_fee_charges_school_id_id_key" ON "student_fee_charges"("school_id", "id");
CREATE UNIQUE INDEX "student_fee_charges_school_account_id_key" ON "student_fee_charges"("school_id", "account_id", "id");
CREATE UNIQUE INDEX "student_fee_charges_school_account_idempotency_key" ON "student_fee_charges"("school_id", "account_id", "idempotency_key");
CREATE INDEX "student_fee_charges_school_account_created_idx" ON "student_fee_charges"("school_id", "account_id", "created_at");
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_account_fkey" FOREIGN KEY ("school_id", "account_id") REFERENCES "student_financial_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_structure_fkey" FOREIGN KEY ("school_id", "fee_structure_id") REFERENCES "fee_structures"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fee_charge_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "fee_charge_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_charge_items_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "fee_charge_items_position_check" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "fee_charge_items_school_id_id_key" ON "fee_charge_items"("school_id", "id");
CREATE UNIQUE INDEX "fee_charge_items_school_charge_position_key" ON "fee_charge_items"("school_id", "charge_id", "position");
ALTER TABLE "fee_charge_items" ADD CONSTRAINT "fee_charge_items_charge_fkey" FOREIGN KEY ("school_id", "charge_id") REFERENCES "student_fee_charges"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "financial_payments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(120),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,
    CONSTRAINT "financial_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "financial_payments_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "financial_payments_method_check" CHECK (NULLIF(BTRIM("method"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "financial_payments_school_id_id_key" ON "financial_payments"("school_id", "id");
CREATE UNIQUE INDEX "financial_payments_school_account_id_key" ON "financial_payments"("school_id", "account_id", "id");
CREATE UNIQUE INDEX "financial_payments_school_account_idempotency_key" ON "financial_payments"("school_id", "account_id", "idempotency_key");
CREATE UNIQUE INDEX "financial_payments_school_reference_key" ON "financial_payments"("school_id", "reference");
CREATE INDEX "financial_payments_school_account_received_idx" ON "financial_payments"("school_id", "account_id", "received_at");
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_account_fkey" FOREIGN KEY ("school_id", "account_id") REFERENCES "student_financial_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "financial_receipts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_receipts_school_id_id_key" ON "financial_receipts"("school_id", "id");
CREATE UNIQUE INDEX "financial_receipts_school_payment_key" ON "financial_receipts"("school_id", "payment_id");
ALTER TABLE "financial_receipts" ADD CONSTRAINT "financial_receipts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_receipts" ADD CONSTRAINT "financial_receipts_payment_fkey" FOREIGN KEY ("school_id", "payment_id") REFERENCES "financial_payments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "payment_allocations_school_id_id_key" ON "payment_allocations"("school_id", "id");
CREATE UNIQUE INDEX "payment_allocations_school_account_id_key" ON "payment_allocations"("school_id", "account_id", "id");
CREATE UNIQUE INDEX "payment_allocations_school_payment_idempotency_key" ON "payment_allocations"("school_id", "payment_id", "idempotency_key");
CREATE INDEX "payment_allocations_school_charge_idx" ON "payment_allocations"("school_id", "charge_id");
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_account_fkey" FOREIGN KEY ("school_id", "account_id") REFERENCES "student_financial_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_fkey" FOREIGN KEY ("school_id", "account_id", "payment_id") REFERENCES "financial_payments"("school_id", "account_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_fkey" FOREIGN KEY ("school_id", "account_id", "charge_id") REFERENCES "student_fee_charges"("school_id", "account_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_allocation_reversals" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocation_reversals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocation_reversals_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_allocation_reversals_reason_check" CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "payment_allocation_reversals_school_id_id_key" ON "payment_allocation_reversals"("school_id", "id");
CREATE UNIQUE INDEX "payment_allocation_reversals_school_allocation_idempotency_key" ON "payment_allocation_reversals"("school_id", "allocation_id", "idempotency_key");
CREATE INDEX "payment_allocation_reversals_school_allocation_idx" ON "payment_allocation_reversals"("school_id", "allocation_id");
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_allocation_fkey" FOREIGN KEY ("school_id", "allocation_id") REFERENCES "payment_allocations"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "charge_reversals" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "charge_reversals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "charge_reversals_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "charge_reversals_reason_check" CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "charge_reversals_school_id_id_key" ON "charge_reversals"("school_id", "id");
CREATE UNIQUE INDEX "charge_reversals_school_charge_key" ON "charge_reversals"("school_id", "charge_id");
CREATE UNIQUE INDEX "charge_reversals_school_idempotency_key" ON "charge_reversals"("school_id", "idempotency_key");
ALTER TABLE "charge_reversals" ADD CONSTRAINT "charge_reversals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "charge_reversals" ADD CONSTRAINT "charge_reversals_charge_fkey" FOREIGN KEY ("school_id", "charge_id") REFERENCES "student_fee_charges"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "charge_reversals" ADD CONSTRAINT "charge_reversals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "financial_adjustments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "FinancialAdjustmentDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "financial_adjustments_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "financial_adjustments_reason_check" CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "financial_adjustments_school_id_id_key" ON "financial_adjustments"("school_id", "id");
CREATE UNIQUE INDEX "financial_adjustments_school_account_idempotency_key" ON "financial_adjustments"("school_id", "account_id", "idempotency_key");
CREATE INDEX "financial_adjustments_school_account_created_idx" ON "financial_adjustments"("school_id", "account_id", "created_at");
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_account_fkey" FOREIGN KEY ("school_id", "account_id") REFERENCES "student_financial_accounts"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_refunds_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_refunds_reason_check" CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL),
    CONSTRAINT "payment_refunds_reference_check" CHECK (NULLIF(BTRIM("reference"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "payment_refunds_school_id_id_key" ON "payment_refunds"("school_id", "id");
CREATE UNIQUE INDEX "payment_refunds_school_payment_idempotency_key" ON "payment_refunds"("school_id", "payment_id", "idempotency_key");
CREATE UNIQUE INDEX "payment_refunds_school_reference_key" ON "payment_refunds"("school_id", "reference");
CREATE INDEX "payment_refunds_school_payment_created_idx" ON "payment_refunds"("school_id", "payment_id", "created_at");
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_fkey" FOREIGN KEY ("school_id", "payment_id") REFERENCES "financial_payments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_reconciliations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "statement_amount" DECIMAL(14,2) NOT NULL,
    "statement_reference" VARCHAR(120),
    "note" VARCHAR(500) NOT NULL,
    "outcome" "PaymentReconciliationOutcome" NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_reconciliations_statement_amount_check" CHECK ("statement_amount" >= 0),
    CONSTRAINT "payment_reconciliations_note_check" CHECK (NULLIF(BTRIM("note"), '') IS NOT NULL)
);
CREATE UNIQUE INDEX "payment_reconciliations_school_id_id_key" ON "payment_reconciliations"("school_id", "id");
CREATE UNIQUE INDEX "payment_reconciliations_school_payment_idempotency_key" ON "payment_reconciliations"("school_id", "payment_id", "idempotency_key");
CREATE INDEX "payment_reconciliations_school_outcome_created_idx" ON "payment_reconciliations"("school_id", "outcome", "created_at");
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_payment_fkey" FOREIGN KEY ("school_id", "payment_id") REFERENCES "financial_payments"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
