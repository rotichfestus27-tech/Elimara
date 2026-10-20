import { randomUUID } from "node:crypto";
import {
  NotificationStoreError,
  type ClaimedNotification,
  type NotificationDeliveryResult,
  type NotificationPageQuery,
  type NotificationRecord,
  type NotificationStore,
  type QueueNotificationInput,
} from "@elimara/database";

type StoredNotification = NotificationRecord & { requestFingerprint: string; nextAttemptAt: Date };

export class FakeNotificationStore implements NotificationStore {
  readonly notifications = new Map<string, StoredNotification>();
  readonly eligibleRecipients = new Set<string>();
  readonly fingerprints = new Map<string, string>();

  async enqueue(input: QueueNotificationInput): Promise<NotificationRecord> {
    if (!this.eligibleRecipients.has(`${input.schoolId}:${input.recipientUserId}`)) {
      throw new NotificationStoreError("RECIPIENT_NOT_FOUND", "Inactive recipient.");
    }
    const uniqueKey = `${input.schoolId}:${input.eventKey}:${input.recipientUserId}:${input.channel}`;
    const existingId = this.fingerprints.get(uniqueKey);
    if (existingId) {
      const existing = this.notifications.get(existingId);
      if (!existing || existing.requestFingerprint !== input.requestFingerprint) {
        throw new NotificationStoreError("IDEMPOTENCY_CONFLICT", "Event key conflict.");
      }
      return existing;
    }
    const notification: StoredNotification = {
      id: randomUUID(),
      schoolId: input.schoolId,
      recipientUserId: input.recipientUserId,
      eventKey: input.eventKey,
      channel: input.channel,
      title: input.title,
      body: input.body,
      status: "QUEUED",
      attemptCount: 0,
      createdAt: new Date(),
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failureCode: null,
      requestFingerprint: input.requestFingerprint,
      nextAttemptAt: new Date(0),
    };
    this.notifications.set(notification.id, notification);
    this.fingerprints.set(uniqueKey, notification.id);
    return notification;
  }

  async listInbox(schoolId: string, recipientUserId: string, query: NotificationPageQuery) {
    const all = [...this.notifications.values()]
      .filter(
        (item) =>
          item.schoolId === schoolId &&
          item.recipientUserId === recipientUserId &&
          item.channel === "IN_APP",
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return {
      items: all.slice(query.offset, query.offset + query.limit),
      total: all.length,
    };
  }

  async markRead(schoolId: string, recipientUserId: string, notificationId: string) {
    const notification = this.notifications.get(notificationId);
    if (
      !notification ||
      notification.schoolId !== schoolId ||
      notification.recipientUserId !== recipientUserId ||
      notification.channel !== "IN_APP" ||
      notification.status !== "DELIVERED"
    ) {
      return false;
    }
    notification.readAt ??= new Date();
    return true;
  }

  async claimDue(now: Date, leaseUntil: Date, limit: number, maxAttempts: number) {
    const claimed: ClaimedNotification[] = [];
    for (const notification of this.notifications.values()) {
      const mutable = notification;
      if (
        (mutable.status === "QUEUED" || mutable.status === "RETRYING") &&
        mutable.nextAttemptAt <= now &&
        mutable.attemptCount < maxAttempts &&
        claimed.length < limit
      ) {
        mutable.status = "RETRYING";
        mutable.attemptCount += 1;
        mutable.nextAttemptAt = leaseUntil;
        claimed.push({
          id: mutable.id,
          schoolId: mutable.schoolId,
          recipientUserId: mutable.recipientUserId,
          channel: mutable.channel,
          title: mutable.title,
          body: mutable.body,
          attemptCount: mutable.attemptCount,
        });
      }
    }
    return claimed;
  }

  async completeDelivery(
    notificationId: string,
    result: NotificationDeliveryResult,
    occurredAt: Date,
    attemptCount: number,
  ) {
    const notification = this.requireCurrentAttempt(notificationId, attemptCount);
    notification.status = result.status;
    notification.sentAt = result.status === "SENT" ? occurredAt : null;
    notification.deliveredAt = result.status === "DELIVERED" ? occurredAt : null;
    notification.failureCode = null;
  }

  async recordDeliveryFailure(input: {
    notificationId: string;
    failureCode: string;
    retryAt: Date | null;
    occurredAt: Date;
    attemptCount: number;
  }) {
    const notification = this.requireCurrentAttempt(input.notificationId, input.attemptCount);
    notification.status = input.retryAt ? "RETRYING" : "FAILED";
    notification.failureCode = input.failureCode;
    notification.nextAttemptAt = input.retryAt ?? input.occurredAt;
  }

  private requireCurrentAttempt(notificationId: string, attemptCount: number): StoredNotification {
    const notification = this.notifications.get(notificationId);
    if (
      !notification ||
      notification.attemptCount !== attemptCount ||
      notification.status !== "RETRYING"
    ) {
      throw new NotificationStoreError("DELIVERY_LEASE_LOST", "Lease lost.");
    }
    return notification;
  }
}
