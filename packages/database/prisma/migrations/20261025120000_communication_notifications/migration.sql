-- Phase 09 notification inbox and provider-neutral delivery queue.
-- No notification templates, providers, or business-event triggers are seeded.

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'FAILED');

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "event_key" VARCHAR(180) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "provider_message_id" VARCHAR(180),
    "failure_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "notifications_title_check" CHECK (NULLIF(BTRIM("title"), '') IS NOT NULL),
    CONSTRAINT "notifications_body_check" CHECK (NULLIF(BTRIM("body"), '') IS NOT NULL)
);

CREATE UNIQUE INDEX "notifications_school_id_id_key" ON "notifications"("school_id", "id");
CREATE UNIQUE INDEX "notifications_school_event_recipient_channel_key"
    ON "notifications"("school_id", "event_key", "recipient_user_id", "channel");
CREATE INDEX "notifications_school_recipient_created_idx"
    ON "notifications"("school_id", "recipient_user_id", "created_at");
CREATE INDEX "notifications_queue_status_next_attempt_idx"
    ON "notifications"("status", "next_attempt_at", "created_at");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_school_membership_fkey"
    FOREIGN KEY ("school_id", "recipient_user_id")
    REFERENCES "school_memberships"("school_id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
