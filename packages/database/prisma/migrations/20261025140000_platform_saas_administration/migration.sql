-- Phase 12 platform control plane, MFA state, and non-billing subscription metadata.
-- This migration does not create platform administrators, plans, entitlements, or memberships.

ALTER TABLE "platform_admin_assignments"
    ADD COLUMN "pending_totp_secret_encrypted" VARCHAR(512),
    ADD COLUMN "pending_totp_secret_expires_at" TIMESTAMPTZ(6),
    ADD COLUMN "totp_secret_encrypted" VARCHAR(512),
    ADD COLUMN "totp_enabled_at" TIMESTAMPTZ(6),
    ADD COLUMN "totp_last_used_step" INTEGER,
    ADD CONSTRAINT "platform_admin_totp_state_check"
      CHECK (
        ("totp_enabled_at" IS NULL AND "totp_secret_encrypted" IS NULL)
        OR ("totp_enabled_at" IS NOT NULL AND "totp_secret_encrypted" IS NOT NULL)
      ),
    ADD CONSTRAINT "platform_admin_pending_totp_check"
      CHECK ("totp_enabled_at" IS NULL OR "pending_totp_secret_encrypted" IS NULL),
    ADD CONSTRAINT "platform_admin_pending_totp_expiry_check"
      CHECK (
        ("pending_totp_secret_encrypted" IS NULL AND "pending_totp_secret_expires_at" IS NULL)
        OR ("pending_totp_secret_encrypted" IS NOT NULL AND "pending_totp_secret_expires_at" IS NOT NULL)
      ),
    ADD CONSTRAINT "platform_admin_totp_step_check"
      CHECK ("totp_last_used_step" IS NULL OR "totp_last_used_step" >= 0);

ALTER TABLE "user_sessions"
    ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(6);

CREATE TABLE "saas_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "entitlements" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "saas_plans_code_check" CHECK (NULLIF(BTRIM("code"), '') IS NOT NULL),
    CONSTRAINT "saas_plans_name_check" CHECK (NULLIF(BTRIM("name"), '') IS NOT NULL),
    CONSTRAINT "saas_plans_entitlements_object_check" CHECK (jsonb_typeof("entitlements") = 'object')
);

CREATE UNIQUE INDEX "saas_plans_code_key" ON "saas_plans"("code");
CREATE INDEX "saas_plans_active_name_idx" ON "saas_plans"("active", "name");

CREATE TABLE "school_subscriptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_code" VARCHAR(80) NOT NULL,
    "plan_name" VARCHAR(160) NOT NULL,
    "entitlements" JSONB NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    CONSTRAINT "school_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "school_subscriptions_period_check"
      CHECK ("ended_at" IS NULL OR "ended_at" >= "assigned_at"),
    CONSTRAINT "school_subscriptions_plan_snapshot_check"
      CHECK (NULLIF(BTRIM("plan_code"), '') IS NOT NULL AND NULLIF(BTRIM("plan_name"), '') IS NOT NULL),
    CONSTRAINT "school_subscriptions_entitlements_object_check"
      CHECK (jsonb_typeof("entitlements") = 'object'),
    CONSTRAINT "school_subscriptions_school_fkey"
      FOREIGN KEY ("school_id") REFERENCES "schools"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "school_subscriptions_plan_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "saas_plans"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "school_subscriptions_assigner_fkey"
      FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "school_subscriptions_one_current_per_school_key"
    ON "school_subscriptions"("school_id")
    WHERE "ended_at" IS NULL;
CREATE INDEX "school_subscriptions_school_assigned_idx"
    ON "school_subscriptions"("school_id", "assigned_at", "id");
CREATE INDEX "school_subscriptions_plan_assigned_idx"
    ON "school_subscriptions"("plan_id", "assigned_at");

CREATE INDEX "security_audit_events_platform_type_occurred_idx"
    ON "security_audit_events"("event_type", "occurred_at");
