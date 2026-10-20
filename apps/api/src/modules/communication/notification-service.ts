import { createHash } from "node:crypto";
import {
  NotificationStoreError,
  type NotificationChannel,
  type NotificationPageQuery,
  type NotificationStore,
} from "@elimara/database";
import { ApiError } from "../../http/errors/api-error.js";
import {
  NotificationTemplateError,
  type NotificationTemplateRegistry,
} from "./notification-templates.js";

export type EnqueueNotificationInput = {
  schoolId: string;
  recipientUserId: string;
  eventKey: string;
  templateKey: string;
  templateData: unknown;
};

export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly templates: NotificationTemplateRegistry,
    private readonly enabledChannels: ReadonlySet<NotificationChannel> = new Set(["IN_APP"]),
  ) {}

  async enqueue(input: EnqueueNotificationInput) {
    try {
      if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,179}$/.test(input.eventKey)) {
        throw new ApiError(
          400,
          "INVALID_NOTIFICATION",
          "A valid notification event key is required.",
        );
      }
      const rendered = this.templates.render(input.templateKey, input.templateData);
      if (!this.enabledChannels.has(rendered.channel)) {
        throw new ApiError(
          503,
          "NOTIFICATION_CHANNEL_UNAVAILABLE",
          "The notification channel is not configured.",
        );
      }
      return await this.store.enqueue({
        schoolId: input.schoolId,
        recipientUserId: input.recipientUserId,
        eventKey: input.eventKey,
        channel: rendered.channel,
        title: rendered.title,
        body: rendered.body,
        requestFingerprint: fingerprint({
          recipientUserId: input.recipientUserId,
          templateKey: input.templateKey,
          channel: rendered.channel,
          title: rendered.title,
          body: rendered.body,
        }),
      });
    } catch (error) {
      if (error instanceof NotificationStoreError) throw mapStoreError(error);
      if (error instanceof NotificationTemplateError) {
        throw new ApiError(400, "INVALID_NOTIFICATION", error.message);
      }
      throw error;
    }
  }

  async listInbox(schoolId: string, userId: string, query: NotificationPageQuery) {
    try {
      return await this.store.listInbox(schoolId, userId, query);
    } catch (error) {
      if (error instanceof NotificationStoreError) throw mapStoreError(error);
      throw error;
    }
  }

  async markRead(schoolId: string, userId: string, notificationId: string) {
    try {
      if (!(await this.store.markRead(schoolId, userId, notificationId))) {
        throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "The notification was not found.");
      }
    } catch (error) {
      if (error instanceof NotificationStoreError) throw mapStoreError(error);
      throw error;
    }
  }
}

function mapStoreError(error: NotificationStoreError): ApiError {
  switch (error.code) {
    case "RECIPIENT_NOT_FOUND":
    case "NOTIFICATION_NOT_FOUND":
      return new ApiError(404, error.code, error.message);
    case "IDEMPOTENCY_CONFLICT":
    case "DELIVERY_LEASE_LOST":
      return new ApiError(409, error.code, error.message);
  }
}

function fingerprint(value: object): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
