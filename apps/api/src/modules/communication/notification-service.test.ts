import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "./notification-service.js";
import {
  NotificationTemplateError,
  NotificationTemplateRegistry,
} from "./notification-templates.js";
import {
  InAppNotificationProvider,
  NotificationDeliveryError,
  NotificationWorker,
  type NotificationDeliveryProvider,
} from "./notification-worker.js";
import { FakeNotificationStore } from "./test-support/fake-notification-store.js";

const schoolId = "e1651f0f-9ef3-4a25-889d-cf069ef882a2";
const recipientUserId = "86b866d3-838c-4396-a22f-9d23f069f857";

function setup(channel: "IN_APP" | "EMAIL" = "IN_APP") {
  const store = new FakeNotificationStore();
  store.eligibleRecipients.add(`${schoolId}:${recipientUserId}`);
  const templates = new NotificationTemplateRegistry();
  templates.register({
    key: "test.notice",
    channel,
    input: z.object({ subject: z.string() }),
    render: ({ subject }) => ({ title: subject, body: `Notice: ${subject}` }),
  });
  return { store, templates, service: new NotificationService(store, templates) };
}

describe("notification foundation", () => {
  it("validates template data and rejects unregistered templates", () => {
    const { templates } = setup();
    expect(() => templates.render("missing", {})).toThrow(NotificationTemplateError);
    expect(() => templates.render("test.notice", { subject: 12 })).toThrow(
      "Notification template data is invalid.",
    );
  });

  it("enqueues active recipients idempotently and conflicts on changed event data", async () => {
    const { service, store } = setup();
    const input = {
      schoolId,
      recipientUserId,
      eventKey: "attendance:2026-10-19:register-1",
      templateKey: "test.notice",
      templateData: { subject: "Register updated" },
    };

    const first = await service.enqueue(input);
    const replay = await service.enqueue(input);
    expect(replay.id).toBe(first.id);
    await expect(
      service.enqueue({ ...input, templateData: { subject: "Different content" } }),
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(store.notifications.size).toBe(1);
  });

  it("does not queue inactive or cross-school recipients", async () => {
    const { service } = setup();
    await expect(
      service.enqueue({
        schoolId,
        recipientUserId: "ce569027-4f4e-4a19-8188-cfd18ac43ee0",
        eventKey: "event-1",
        templateKey: "test.notice",
        templateData: { subject: "Private notice" },
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "RECIPIENT_NOT_FOUND" });
    await expect(
      service.enqueue({
        schoolId: "707d9adc-1432-4dd5-a977-b587be10b6d5",
        recipientUserId,
        eventKey: "event-from-other-school",
        templateKey: "test.notice",
        templateData: { subject: "Private notice" },
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "RECIPIENT_NOT_FOUND" });
  });

  it("does not enqueue a channel without an active provider configuration", async () => {
    const { service, store } = setup("EMAIL");
    await expect(
      service.enqueue({
        schoolId,
        recipientUserId,
        eventKey: "event-1",
        templateKey: "test.notice",
        templateData: { subject: "Email notice" },
      }),
    ).rejects.toMatchObject({ statusCode: 503, code: "NOTIFICATION_CHANNEL_UNAVAILABLE" });
    expect(store.notifications.size).toBe(0);
  });

  it("delivers in-app notifications and retries transient provider failures", async () => {
    const { service, store } = setup();
    const queued = await service.enqueue({
      schoolId,
      recipientUserId,
      eventKey: "event-2",
      templateKey: "test.notice",
      templateData: { subject: "A notice" },
    });
    const now = new Date("2026-10-19T12:00:00.000Z");
    let currentTime = now;
    const provider: NotificationDeliveryProvider = {
      channel: "IN_APP",
      deliver: vi
        .fn()
        .mockRejectedValueOnce(new NotificationDeliveryError("TEMPORARY_FAILURE", true))
        .mockResolvedValue({ status: "DELIVERED" }),
    };
    const worker = new NotificationWorker(store, [provider], {
      now: () => currentTime,
      onError: vi.fn(),
    });

    await worker.runOnce();
    expect(store.notifications.get(queued.id)?.status).toBe("RETRYING");
    currentTime = new Date(now.getTime() + 1_001);
    await worker.runOnce();

    expect(provider.deliver).toHaveBeenCalledTimes(2);
    expect(store.notifications.get(queued.id)?.status).toBe("DELIVERED");
  });

  it("stops retrying after a permanent delivery failure", async () => {
    const { service, store } = setup();
    const queued = await service.enqueue({
      schoolId,
      recipientUserId,
      eventKey: "event-3",
      templateKey: "test.notice",
      templateData: { subject: "A notice" },
    });
    const provider: NotificationDeliveryProvider = {
      channel: "IN_APP",
      deliver: vi.fn().mockRejectedValue(new NotificationDeliveryError("PERMANENT_FAILURE", false)),
    };
    const worker = new NotificationWorker(store, [provider], { maxAttempts: 1 });

    await worker.runOnce();

    expect(provider.deliver).toHaveBeenCalledTimes(1);
    expect(store.notifications.get(queued.id)?.status).toBe("FAILED");
    expect(store.notifications.get(queued.id)?.failureCode).toBe("PERMANENT_FAILURE");
  });

  it("stops retrying when the configured attempt limit is reached", async () => {
    const { service, store } = setup();
    const queued = await service.enqueue({
      schoolId,
      recipientUserId,
      eventKey: "event-4",
      templateKey: "test.notice",
      templateData: { subject: "A notice" },
    });
    const provider: NotificationDeliveryProvider = {
      channel: "IN_APP",
      deliver: vi.fn().mockRejectedValue(new NotificationDeliveryError("TEMPORARY_FAILURE", true)),
    };
    const worker = new NotificationWorker(store, [provider], { maxAttempts: 1 });

    await worker.runOnce();

    expect(provider.deliver).toHaveBeenCalledTimes(1);
    expect(store.notifications.get(queued.id)?.status).toBe("FAILED");
    expect(store.notifications.get(queued.id)?.failureCode).toBe("TEMPORARY_FAILURE");
  });

  it("keeps the in-app provider delivery result explicit", async () => {
    const result = await new InAppNotificationProvider().deliver({
      id: "id",
      schoolId,
      recipientUserId,
      channel: "IN_APP",
      title: "Title",
      body: "Body",
      attemptCount: 1,
    });
    expect(result).toEqual({ status: "DELIVERED" });
  });
});
