export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS";

export type NotificationDeliveryStatus = "QUEUED" | "RETRYING" | "SENT" | "DELIVERED" | "FAILED";

export type NotificationRecord = {
  id: string;
  schoolId: string;
  recipientUserId: string;
  eventKey: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failureCode: string | null;
};

export type NotificationPageQuery = {
  limit: number;
  offset: number;
};

export type QueueNotificationInput = {
  schoolId: string;
  recipientUserId: string;
  eventKey: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  requestFingerprint: string;
};

export type ClaimedNotification = {
  id: string;
  schoolId: string;
  recipientUserId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  attemptCount: number;
};

export type NotificationDeliveryResult = {
  status: "SENT" | "DELIVERED";
  providerMessageId?: string;
};

export type NotificationStore = {
  enqueue(input: QueueNotificationInput): Promise<NotificationRecord>;
  listInbox(
    schoolId: string,
    recipientUserId: string,
    query: NotificationPageQuery,
  ): Promise<{ items: NotificationRecord[]; total: number }>;
  markRead(schoolId: string, recipientUserId: string, notificationId: string): Promise<boolean>;
  claimDue(
    now: Date,
    leaseUntil: Date,
    limit: number,
    maxAttempts: number,
  ): Promise<ClaimedNotification[]>;
  completeDelivery(
    notificationId: string,
    result: NotificationDeliveryResult,
    occurredAt: Date,
    attemptCount: number,
  ): Promise<void>;
  recordDeliveryFailure(input: {
    notificationId: string;
    failureCode: string;
    retryAt: Date | null;
    occurredAt: Date;
    attemptCount: number;
  }): Promise<void>;
};
