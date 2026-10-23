import { type TransactionTimeoutOptions, resolveTransactionOptions } from "./transaction-options.js";
import { NotificationDeliveryStatus, Prisma, type PrismaClient } from "@prisma/client";
import type {
  ClaimedNotification,
  NotificationDeliveryResult,
  NotificationPageQuery,
  NotificationRecord,
  NotificationStore,
  QueueNotificationInput,
} from "./notification-contracts.js";

export class NotificationStoreError extends Error {
  constructor(
    readonly code:
      | "RECIPIENT_NOT_FOUND"
      | "IDEMPOTENCY_CONFLICT"
      | "NOTIFICATION_NOT_FOUND"
      | "DELIVERY_LEASE_LOST",
    message: string,
  ) {
    super(message);
    this.name = "NotificationStoreError";
  }
}

const notificationSelect = {
  id: true,
  schoolId: true,
  recipientUserId: true,
  eventKey: true,
  channel: true,
  title: true,
  body: true,
  status: true,
  attemptCount: true,
  createdAt: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  failureCode: true,
} satisfies Prisma.NotificationSelect;

export class PrismaNotificationStore implements NotificationStore {
  private readonly txOptions: { maxWait: number; timeout: number };

  constructor(
    private readonly prisma: PrismaClient,
    options?: TransactionTimeoutOptions,
  ) {
    this.txOptions = resolveTransactionOptions(options);
  }

  async enqueue(input: QueueNotificationInput): Promise<NotificationRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const member = await tx.schoolMembership.findFirst({
              where: {
                schoolId: input.schoolId,
                userId: input.recipientUserId,
                status: "ACTIVE",
                user: { status: "ACTIVE" },
                school: { status: "ACTIVE" },
              },
              select: { id: true },
            });
            if (!member) {
              throw new NotificationStoreError(
                "RECIPIENT_NOT_FOUND",
                "The notification recipient is not an active user in this school.",
              );
            }

            const prior = await tx.notification.findFirst({
              where: {
                schoolId: input.schoolId,
                eventKey: input.eventKey,
                recipientUserId: input.recipientUserId,
                channel: input.channel,
              },
              select: { ...notificationSelect, requestFingerprint: true },
            });
            if (prior) {
              if (prior.requestFingerprint !== input.requestFingerprint) {
                throw new NotificationStoreError(
                  "IDEMPOTENCY_CONFLICT",
                  "This event key was already used for different notification data.",
                );
              }
              return mapNotification(prior);
            }

            const notification = await tx.notification.create({
              data: {
                schoolId: input.schoolId,
                recipientUserId: input.recipientUserId,
                eventKey: input.eventKey,
                requestFingerprint: input.requestFingerprint,
                channel: input.channel,
                title: input.title,
                body: input.body,
              },
              select: notificationSelect,
            });
            return mapNotification(notification);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: this.txOptions.maxWait,
            timeout: this.txOptions.timeout,
          },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !["P2002", "P2034"].includes(error.code)
        ) {
          throw error;
        }
        const concurrent = await this.prisma.notification.findFirst({
          where: {
            schoolId: input.schoolId,
            eventKey: input.eventKey,
            recipientUserId: input.recipientUserId,
            channel: input.channel,
          },
          select: { ...notificationSelect, requestFingerprint: true },
        });
        if (concurrent) {
          if (concurrent.requestFingerprint !== input.requestFingerprint) {
            throw new NotificationStoreError(
              "IDEMPOTENCY_CONFLICT",
              "This event key was already used for different notification data.",
            );
          }
          return mapNotification(concurrent);
        }
        if (attempt === 2 && error.code === "P2034") throw error;
      }
    }
    throw new Error("The notification enqueue retry limit was exceeded.");
  }

  async listInbox(schoolId: string, recipientUserId: string, query: NotificationPageQuery) {
    const where = {
      schoolId,
      recipientUserId,
      channel: "IN_APP" as const,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items: rows.map(mapNotification), total };
  }

  async markRead(schoolId: string, recipientUserId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        schoolId,
        recipientUserId,
        id: notificationId,
        channel: "IN_APP",
        status: "DELIVERED",
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    if (result.count === 1) return true;

    const existing = await this.prisma.notification.findFirst({
      where: { schoolId, recipientUserId, id: notificationId, channel: "IN_APP" },
      select: { id: true, readAt: true },
    });
    if (existing?.readAt) return true;
    return false;
  }

  async claimDue(
    now: Date,
    leaseUntil: Date,
    limit: number,
    maxAttempts: number,
  ): Promise<ClaimedNotification[]> {
    return this.prisma.$transaction(
      async (tx) => {
      await tx.$executeRaw`
        UPDATE notifications AS n
        SET status = 'FAILED'::"NotificationDeliveryStatus",
            failure_code = 'RETRY_LIMIT_EXCEEDED'
        FROM schools AS s
        WHERE n.school_id = s.id
          AND n.status IN ('QUEUED'::"NotificationDeliveryStatus", 'RETRYING'::"NotificationDeliveryStatus")
          AND n.next_attempt_at <= ${now}
          AND n.attempt_count >= ${maxAttempts}
          AND s.status = 'ACTIVE'::"SchoolStatus"
      `;

      const due = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT n.id
        FROM notifications AS n
        INNER JOIN schools AS s ON s.id = n.school_id
        WHERE n.status IN ('QUEUED'::"NotificationDeliveryStatus", 'RETRYING'::"NotificationDeliveryStatus")
          AND n.next_attempt_at <= ${now}
          AND n.attempt_count < ${maxAttempts}
          AND s.status = 'ACTIVE'::"SchoolStatus"
        ORDER BY n.created_at, n.id
        FOR UPDATE OF n SKIP LOCKED
        LIMIT ${limit}
      `;
      const ids = due.map(({ id }) => id);
      if (ids.length === 0) return [];

      await tx.notification.updateMany({
        where: { id: { in: ids } },
        data: {
          status: NotificationDeliveryStatus.RETRYING,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          nextAttemptAt: leaseUntil,
        },
      });
      const claimed = await tx.notification.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          schoolId: true,
          recipientUserId: true,
          channel: true,
          title: true,
          body: true,
          attemptCount: true,
        },
      });
      return claimed.map((entry) => ({
        ...entry,
        channel: entry.channel as ClaimedNotification["channel"],
      }));
    });
  }

  async completeDelivery(
    notificationId: string,
    result: NotificationDeliveryResult,
    occurredAt: Date,
    attemptCount: number,
  ): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: NotificationDeliveryStatus.RETRYING,
        attemptCount,
      },
      data: {
        status: result.status,
        providerMessageId: result.providerMessageId ?? null,
        sentAt: result.status === "SENT" ? occurredAt : null,
        deliveredAt: result.status === "DELIVERED" ? occurredAt : null,
        failureCode: null,
      },
    });
    if (updated.count !== 1) {
      throw new NotificationStoreError(
        "DELIVERY_LEASE_LOST",
        "The notification delivery lease is no longer current.",
      );
    }
  }

  async recordDeliveryFailure(input: {
    notificationId: string;
    failureCode: string;
    retryAt: Date | null;
    occurredAt: Date;
    attemptCount: number;
  }): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: input.notificationId,
        status: NotificationDeliveryStatus.RETRYING,
        attemptCount: input.attemptCount,
      },
      data: {
        status: input.retryAt
          ? NotificationDeliveryStatus.RETRYING
          : NotificationDeliveryStatus.FAILED,
        failureCode: input.failureCode,
        nextAttemptAt: input.retryAt ?? input.occurredAt,
      },
    });
    if (updated.count !== 1) {
      throw new NotificationStoreError(
        "DELIVERY_LEASE_LOST",
        "The notification delivery lease is no longer current.",
      );
    }
  }
}

function mapNotification(
  row: Prisma.NotificationGetPayload<{ select: typeof notificationSelect }> & {
    requestFingerprint?: string;
  },
): NotificationRecord {
  return {
    id: row.id,
    schoolId: row.schoolId,
    recipientUserId: row.recipientUserId,
    eventKey: row.eventKey,
    channel: row.channel,
    title: row.title,
    body: row.body,
    status: row.status,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    readAt: row.readAt,
    failureCode: row.failureCode,
  };
}
