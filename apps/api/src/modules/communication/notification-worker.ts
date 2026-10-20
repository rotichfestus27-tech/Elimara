import type {
  ClaimedNotification,
  NotificationChannel,
  NotificationDeliveryResult,
  NotificationStore,
} from "@elimara/database";

const retryDelaysMilliseconds = [1_000, 5_000, 30_000, 300_000] as const;

export class NotificationDeliveryError extends Error {
  constructor(
    readonly failureCode: string,
    readonly retryable: boolean,
  ) {
    if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(failureCode)) {
      throw new TypeError("Notification failure codes must be stable uppercase identifiers.");
    }
    super("Notification delivery failed.");
    this.name = "NotificationDeliveryError";
  }
}

export interface NotificationDeliveryProvider {
  readonly channel: NotificationChannel;
  deliver(notification: ClaimedNotification): Promise<NotificationDeliveryResult>;
}

export class InAppNotificationProvider implements NotificationDeliveryProvider {
  readonly channel = "IN_APP" as const;

  async deliver(): Promise<NotificationDeliveryResult> {
    return { status: "DELIVERED" };
  }
}

export type NotificationWorkerOptions = {
  batchSize?: number;
  leaseMilliseconds?: number;
  maxAttempts?: number;
  pollIntervalMilliseconds?: number;
  now?: () => Date;
  onError?: (errorName: string) => void;
};

export class NotificationWorker {
  private readonly providers: ReadonlyMap<NotificationChannel, NotificationDeliveryProvider>;
  private readonly batchSize: number;
  private readonly leaseMilliseconds: number;
  private readonly maxAttempts: number;
  private readonly pollIntervalMilliseconds: number;
  private readonly now: () => Date;
  private readonly onError: (errorName: string) => void;
  private timer: ReturnType<typeof setInterval> | undefined;
  private activeRun: Promise<void> | undefined;

  constructor(
    private readonly store: NotificationStore,
    providers: NotificationDeliveryProvider[],
    options: NotificationWorkerOptions = {},
  ) {
    const maxAttempts = options.maxAttempts ?? 5;
    if (
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > retryDelaysMilliseconds.length + 1
    ) {
      throw new RangeError("Notification worker maxAttempts must be between 1 and 5.");
    }
    if (!Number.isInteger(options.batchSize ?? 10) || (options.batchSize ?? 10) < 1) {
      throw new RangeError("Notification worker batchSize must be a positive integer.");
    }
    if (
      !Number.isInteger(options.leaseMilliseconds ?? 60_000) ||
      (options.leaseMilliseconds ?? 60_000) < 1
    ) {
      throw new RangeError("Notification worker leaseMilliseconds must be a positive integer.");
    }
    if (
      !Number.isInteger(options.pollIntervalMilliseconds ?? 1_000) ||
      (options.pollIntervalMilliseconds ?? 1_000) < 1
    ) {
      throw new RangeError(
        "Notification worker pollIntervalMilliseconds must be a positive integer.",
      );
    }
    const providerMap = new Map<NotificationChannel, NotificationDeliveryProvider>();
    for (const provider of providers) {
      if (providerMap.has(provider.channel)) {
        throw new RangeError(
          `Only one notification provider may be configured for ${provider.channel}.`,
        );
      }
      providerMap.set(provider.channel, provider);
    }
    this.providers = providerMap;
    this.batchSize = options.batchSize ?? 10;
    this.leaseMilliseconds = options.leaseMilliseconds ?? 60_000;
    this.maxAttempts = maxAttempts;
    this.pollIntervalMilliseconds = options.pollIntervalMilliseconds ?? 1_000;
    this.now = options.now ?? (() => new Date());
    this.onError =
      options.onError ??
      ((errorName) =>
        console.error(
          JSON.stringify({
            level: "error",
            errorName,
            message: "Notification worker failure",
          }),
        ));
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMilliseconds);
    this.timer.unref();
    this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activeRun;
  }

  async runOnce(): Promise<number> {
    const startedAt = this.now();
    const claimed = await this.store.claimDue(
      startedAt,
      new Date(startedAt.getTime() + this.leaseMilliseconds),
      this.batchSize,
      this.maxAttempts,
    );
    const outcomes = await Promise.allSettled(
      claimed.map((notification) => this.deliver(notification)),
    );
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    if (failed.length > 0) {
      this.onError("NotificationStoreError");
    }
    return claimed.length;
  }

  private async deliver(notification: ClaimedNotification): Promise<void> {
    const provider = this.providers.get(notification.channel);
    const occurredAt = this.now();
    if (!provider) {
      await this.store.recordDeliveryFailure({
        notificationId: notification.id,
        failureCode: "CHANNEL_NOT_CONFIGURED",
        retryAt: null,
        occurredAt,
        attemptCount: notification.attemptCount,
      });
      return;
    }

    try {
      const result = await provider.deliver(notification);
      await this.store.completeDelivery(
        notification.id,
        result,
        this.now(),
        notification.attemptCount,
      );
    } catch (error) {
      const deliveryError =
        error instanceof NotificationDeliveryError
          ? error
          : new NotificationDeliveryError("PROVIDER_UNEXPECTED_ERROR", true);
      const retryDelay = retryDelaysMilliseconds[notification.attemptCount - 1];
      const retryAt =
        deliveryError.retryable &&
        notification.attemptCount < this.maxAttempts &&
        retryDelay !== undefined
          ? new Date(this.now().getTime() + retryDelay)
          : null;
      await this.store.recordDeliveryFailure({
        notificationId: notification.id,
        failureCode: deliveryError.failureCode,
        retryAt,
        occurredAt: this.now(),
        attemptCount: notification.attemptCount,
      });
    }
  }

  private tick(): void {
    if (this.activeRun) return;
    this.activeRun = this.runOnce()
      .then(
        () => {},
        (error: unknown) => {
          this.onError(error instanceof Error ? error.name : "UnknownError");
        },
      )
      .finally(() => {
        this.activeRun = undefined;
      });
  }
}
