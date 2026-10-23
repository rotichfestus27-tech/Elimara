# @elimara/database

Database access layer, schema definitions, and migration management for Elimara School OS.

## Technology Stack

- **ORM**: Prisma 6.19.0
- **Database Engine**: PostgreSQL (Neon Serverless Cloud PostgreSQL)
- **Language**: TypeScript

---

## Least-Privilege Database Role Architecture

Elimara enforces a strict separation of privileges between database migrations and application runtime traffic to prevent unauthorized DDL operations, accidental table drops, or privilege escalations.

| Role | Target Endpoint | Connection String | Permitted Operations | Denied Operations |
|---|---|---|---|---|
| **`neondb_owner`** | Direct compute (port `5432`) | Admin console / Break-glass only | Initial database creation, extension provisioning, role creation. | Normal application runtime, CI test traffic. |
| **`elimara_migrator`** | Direct compute (port `5432`) | `DIRECT_URL` | Schema DDL (`CREATE`, `ALTER`, `DROP` tables/indexes/triggers), migration ledger writes (`_prisma_migrations`). | Unpooled high-concurrency runtime queries. |
| **`elimara_app`** | Pooled endpoint (port `6543`, `pgbouncer`) | `DATABASE_URL` | Application DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on business tables, sequence usage. | Schema changes (`CREATE`, `DROP`, `ALTER`, `TRUNCATE`), accessing `_prisma_migrations`. |

> [!CAUTION]
> **Production Rule**: Never use `neondb_owner` for `DATABASE_URL` or `DIRECT_URL` in production or staging deployments. The API server runtime must always run under `elimara_app`.

---

## Environment Variables & Connection Strings

Elimara uses two distinct PostgreSQL connection strings:

### 1. `DATABASE_URL` (Runtime Pooled Connection)
- **Role**: `elimara_app`
- **Target**: Neon Connection Pooler endpoint (port `6543`, `pgbouncer=true`, hostname includes `-pooler`).
- **Characteristics**: Uses transaction-mode pooling to allow thousands of concurrent short-lived connections from the API without exhausting database resources.
- **Security Boundary**: Strictly denied DDL permissions; attempts to execute `CREATE TABLE`, `DROP TABLE`, or `ALTER TABLE` will fail with PostgreSQL error `42501` (`insufficient_privilege`).

```env
DATABASE_URL="postgresql://elimara_app:APP_PASSWORD@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require"
```

### 2. `DIRECT_URL` (Prisma CLI Direct Migration Connection)
- **Role**: `elimara_migrator`
- **Target**: Direct Compute endpoint (port `5432`, direct non-pooled compute host).
- **Characteristics**: Maintains a dedicated, persistent session required by Prisma Migrate to obtain advisory locks (`pg_advisory_lock`) and safely manage migration history in the `_prisma_migrations` table.

```env
DIRECT_URL="postgresql://elimara_migrator:MIGRATOR_PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require"
```

---

## Operator Runbook: Neon Role Provisioning, Rotation & Rollback

### 1. Provisioning Roles in Neon

Run the provisioning script [`packages/database/scripts/neon-roles-provisioning.sql`](scripts/neon-roles-provisioning.sql) in the Neon Console SQL Editor or via `psql` as `neondb_owner`:

```bash
# Automated provisioning via pnpm script:
ADMIN_DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require" \
  pnpm --filter @elimara/database run db:roles:provision
```

### 2. Zero-Downtime Credential Rotation

To rotate passwords for `elimara_app` or `elimara_migrator` without service interruption:
1. Generate a new strong random password for the target role.
2. Update the role password in Neon:
   ```sql
   ALTER ROLE elimara_app WITH PASSWORD 'NEW_STRONG_APP_PASSWORD';
   ```
3. Update the deployment environment variable (`DATABASE_URL` for `elimara_app`, `DIRECT_URL` for `elimara_migrator`) in your cloud provider's secret manager or platform settings.
4. Trigger a rolling restart of the API service containers. Active connections will complete cleanly while new connections authenticate with the new password.

### 3. Emergency Rollback Procedure

If a deployment or privilege issue occurs:
1. Re-run `scripts/neon-roles-provisioning.sql` using `neondb_owner` to re-apply any missing default privileges.
2. If immediate temporary fallback is required during an incident, update `DATABASE_URL` to point to a temporary backup role while investigating, then restore least-privilege roles once resolved.
3. Never drop or revoke privileges from `elimara_migrator` until replacement roles have been verified with `pnpm test:integration`.

---

## Developer Commands

Run from monorepo root or inside `packages/database`:

```bash
# 1. Validate Prisma schema syntax
pnpm --filter @elimara/database run db:validate

# 2. Generate Prisma Client
pnpm --filter @elimara/database run db:generate

# 3. Build database package (generates client & compiles TypeScript)
pnpm --filter @elimara/database run build

# 4. Typecheck database package
pnpm --filter @elimara/database run typecheck

# 5. Provision least-privilege roles (elimara_migrator and elimara_app)
ADMIN_DATABASE_URL="$ADMIN_URL" pnpm --filter @elimara/database run db:roles:provision

# 6. Apply migrations in deployment/CI using elimara_migrator (never use db push)
pnpm --filter @elimara/database run db:migrate:deploy

# 7. Verify migration status ledger
pnpm --filter @elimara/database run db:migrate:status

# 8. Check for unexpected schema drift against PostgreSQL
pnpm --filter @elimara/database run db:drift:check

# 9. Verify database integrity, permissions, triggers, and tenant constraints
pnpm --filter @elimara/database run db:verify:integrity

# 10. Validate isolated restored database / Point-in-Time Recovery branch
RESTORED_DATABASE_URL="$RESTORE_URL" pnpm --filter @elimara/database run db:verify:restore

# 11. Trigger encrypted offsite backup to Cloudflare R2 / AWS S3
pnpm --filter @elimara/database run db:backup:create

# 12. Verify integrity and SHA-256 digest of latest offsite backup in S3
pnpm --filter @elimara/database run db:backup:verify

# 13. Restore an offsite backup into an isolated target database
TARGET_DATABASE_URL="$RESTORE_URL" pnpm --filter @elimara/database run db:backup:restore
```

---

## Disaster Recovery & Backup Runbooks

- Point-in-Time Recovery (PITR) & Restore Drills: 👉 [`docs/workflows/database-restore-runbook.md`](../../docs/workflows/database-restore-runbook.md)
- Automated Encrypted Offsite Backups (S3/R2): 👉 [`docs/workflows/offsite-backup-runbook.md`](../../docs/workflows/offsite-backup-runbook.md)

> [!WARNING]
> **Strict Migration Rule**: Never run `prisma db push`. Elimara's migrations utilize custom PostgreSQL triggers (`enforce_attendance_register_type`, `prevent_overlapping_grading_bands`, `check_assessment_result_consistency`) and partial unique indexes (`WHERE ends_on IS NULL`, `WHERE ended_at IS NULL`) that Prisma's schema definition language cannot express. Running `db push` will silently drop or corrupt these custom database constraints. Always use `prisma migrate deploy`.
