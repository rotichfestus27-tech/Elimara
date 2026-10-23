import { z } from "zod";

const postgresUrl = z
  .url()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "Must be a PostgreSQL connection URL",
  });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .default("elimara_session"),
  CSRF_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .default("elimara_csrf"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_HMAC_KEY: z.string().min(32),
  PLATFORM_MFA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value.trim() === "" ? [] : value.split(",").map((origin) => origin.trim()),
    )
    .pipe(
      z.array(
        z.url().refine((value) => {
          const url = new URL(value);
          return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            url.origin === value &&
            url.pathname === "/" &&
            url.search === "" &&
            url.hash === ""
          );
        }, "Each CORS origin must be an HTTP(S) origin without a path, query, or fragment"),
      ),
    ),
  DATABASE_READY_TIMEOUT_MS: z.coerce.number().int().min(10).max(30_000).default(2_000),
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): AppConfig {
  return environmentSchema.parse(environment);
}
