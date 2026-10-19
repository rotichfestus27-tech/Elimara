import type { z } from "zod";
import type { NotificationChannel } from "@elimara/database";

export type RenderedNotification = {
  title: string;
  body: string;
};

export type NotificationTemplate<Data> = {
  key: string;
  channel: NotificationChannel;
  input: z.ZodType<Data>;
  render: (data: Data) => RenderedNotification;
};

type RegisteredTemplate = {
  channel: NotificationChannel;
  render: (input: unknown) => RenderedNotification;
};

export class NotificationTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationTemplateError";
  }
}

export class NotificationTemplateRegistry {
  private readonly templates = new Map<string, RegisteredTemplate>();

  register<Data>(template: NotificationTemplate<Data>): void {
    if (!/^[a-z][a-z0-9._-]{0,79}$/.test(template.key)) {
      throw new NotificationTemplateError(
        "Notification template keys must be stable lowercase identifiers.",
      );
    }
    if (this.templates.has(template.key)) {
      throw new NotificationTemplateError(
        `Notification template "${template.key}" is already registered.`,
      );
    }
    this.templates.set(template.key, {
      channel: template.channel,
      render: (input) => {
        const result = template.input.safeParse(input);
        if (!result.success) {
          throw new NotificationTemplateError("Notification template data is invalid.");
        }
        return template.render(result.data);
      },
    });
  }

  render(key: string, input: unknown): { channel: NotificationChannel } & RenderedNotification {
    const template = this.templates.get(key);
    if (!template)
      throw new NotificationTemplateError("The notification template is not available.");
    const rendered = template.render(input);
    const title = rendered.title.trim();
    const body = rendered.body.trim();
    if (!title || title.length > 120 || !body || body.length > 4000) {
      throw new NotificationTemplateError("The rendered notification content is invalid.");
    }
    return { channel: template.channel, title, body };
  }

  has(key: string): boolean {
    return this.templates.has(key);
  }
}
