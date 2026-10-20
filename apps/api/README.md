# Backend foundation

This package contains the API runtime, the Phase 02 authentication,
authorization, and tenant-security foundation, and the approved Phase 03 school
profile and academic-configuration endpoints. Admissions, attendance,
examinations, and other business modules are not implemented.

## Prerequisites

- Node.js 24 (the runtime used to validate this foundation)
- Corepack
- Access to a non-production Neon development project for readiness/migration
  checks

The supported Node.js range has not yet been formally approved. Until then,
Node.js 24 is the tested baseline, not a promise of compatibility for other
versions.

## Local setup

From the repository root:

```text
corepack pnpm install
Copy-Item .env.example .env
```

On macOS/Linux, use `cp .env.example .env` for the second command.

Edit the root `.env` with credentials from a dedicated development Neon
database. Do not use production credentials. Never commit `.env`; the root
`.gitignore` excludes environment files. The example contains safe placeholders,
not usable credentials.

Start the API from the root:

```text
corepack pnpm dev
```

The API listens on `PORT` (default `3000`). `GET /health/live` checks only that
the process is responding. `GET /health/ready` performs a database query and
returns `503` if the configured database cannot be reached. Readiness does not
run migrations or disclose connection details.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production`; defaults to `development`. |
| `PORT` | No | HTTP port from 1 to 65535; defaults to `3000`. |
| `LOG_LEVEL` | No | Pino level; defaults to `info`. Request logs include request ID, method, and status only. |
| `CORS_ORIGINS` | No | Comma-separated exact HTTP(S) origins; defaults to an empty allowlist. Do not include paths. |
| `SESSION_COOKIE_NAME` | No | HttpOnly session cookie name; defaults to `elimara_session`. |
| `CSRF_COOKIE_NAME` | No | Readable CSRF token cookie name; defaults to `elimara_csrf`. |
| `SESSION_TTL_HOURS` | No | Absolute session expiry from 1 to 168 hours; defaults to 12. |
| `COOKIE_SAME_SITE` | No | `strict`, `lax` (default), or `none`; `none` always sets `Secure`. Confirm deployment topology before changing. |
| `COOKIE_DOMAIN` | No | Cookie domain when explicitly required by deployment topology. |
| `TRUST_PROXY_HOPS` | No | Trusted reverse-proxy hop count used to derive client IP for rate limits; defaults to `0`. Set only for a known proxy topology. |
| `RATE_LIMIT_HMAC_KEY` | Yes | Random secret of at least 32 characters used to pseudonymize login/recovery rate-limit keys. Use a unique secret per environment. |
| `DATABASE_URL` | Yes | Neon pooled PostgreSQL URL for application runtime. Keep credentials secret. |
| `DIRECT_URL` | No for API runtime; required for Prisma CLI operations | Neon direct/unpooled URL for Prisma CLI migration operations where required. Keep credentials secret and out of runtime deployment configuration when not needed. |

Neon pooled URLs commonly use the `-pooler` host and `pgbouncer=true`;
unpooled URLs use the direct host. Copy both from the development project's
connection details and confirm Neon’s current connection guidance. The runtime
client uses only `DATABASE_URL`; Prisma's migration datasource uses
`DIRECT_URL`. Do not expose the migration URL to the runtime deployment unless
operationally required. Do not use a production URL for development or tests.

## Commands

Run from the repository root:

```text
corepack pnpm dev
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm build
```

## Database and migrations

The Prisma schema contains the identity/session foundation and the Phase 03
school profile and academic-configuration models. Generation and validation
do not require connecting to a database:

```text
corepack pnpm --filter @elimara/database db:generate
corepack pnpm --filter @elimara/database db:validate
```

Migration commands are provided for future reviewed schema work:

```text
corepack pnpm --filter @elimara/database db:migrate:dev
corepack pnpm --filter @elimara/database db:migrate:deploy
```

The Phase 02 authentication migration and Phase 03 school-configuration
migration are explicit schema changes. Review both SQL files and obtain
approval before applying them to any database. The Phase 03 SQL is hand-authored
and still needs a PostgreSQL-backed migration review. Never run a migration
against production or run destructive database operations without explicit
approval. `migrate dev` is for local development only; deploy operations
require the project's separately approved release procedure.

## Testing and safety

Unit and HTTP tests use injected repositories and synthetic connection
strings; they do not connect to Neon. The school-configuration HTTP tests use
an in-memory store and verify endpoint validation, policy, tenant boundary, and
lifecycle responses, but do not execute Prisma constraints or migrations
against PostgreSQL.
Database integration tests must use an explicitly designated disposable
non-production PostgreSQL database, never production credentials or real
school data.

The request logger intentionally excludes paths, headers, query strings,
request bodies, and response bodies. Do not add personal data, credentials,
tokens, or connection strings to logs.

## Authentication and authorization

Read [the API contract](../../docs/api/authentication.md) and
[the school configuration contract](../../docs/api/school-configuration.md),
and [the authorization model](../../docs/architecture/authorization-model.md).
The login/session/password-reset endpoints are documented there. The role
catalogue and permission matrix remain pending the Complete Product Blueprint;
no school roles are seeded. Password-reset requests return `503
RECOVERY_UNAVAILABLE` until an approved delivery adapter is configured.
