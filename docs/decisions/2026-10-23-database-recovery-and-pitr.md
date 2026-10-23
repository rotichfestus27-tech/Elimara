# Architecture Decision Record: Database Recovery, Point-in-Time Restore (PITR), and Verification Drills

- **Status**: Approved
- **Date**: 2026-10-23
- **Owners**: Developer A (Backend Lead / DBA), Developer B (Platform / Frontend Lead)
- **Relevant Decisions**: D-03 (Technology Stack), D-15 (Migrations and Runtime), D-16 (Integrations and Operations)

---

## 1. Context

Elimara School OS manages sensitive multi-tenant academic, financial, attendance, and student identity records. Production operations require verifiable data protection and disaster recovery guarantees. Relying solely on cloud provider marketing or the nominal availability of backup features without empirical validation introduces critical operational risk.

We need an authoritative strategy for:
1. Primary continuous Point-in-Time Recovery (PITR) on Neon Serverless PostgreSQL.
2. Scheduled, non-destructive restore drills that validate data integrity without interrupting live production.
3. Procedures for handling split-brain or newer production writes during an emergency disaster recovery scenario.

---

## 2. Options Considered

### Option 1: Nightly `pg_dump` Only
- **Pros**: Portable across any PostgreSQL hosting provider.
- **Cons**: RPO of up to 24 hours (unacceptable for financial payments and attendance logs); high compute overhead on active database during dumps; prone to silent backup script failure if unmonitored.

### Option 2: Continuous Neon WAL PITR + Branching (Selected)
- **Pros**:
  - Near-zero RPO (< 5 minutes continuously streamed WALs).
  - Copy-on-write virtual branching enables instant restoration (< 15 minutes RTO) without duplicating storage bytes.
  - Verification drills can be executed completely out-of-band on an ephemeral branch without locking production tables or risking data overwrite.
- **Cons**: Tied to Neon's cloud infrastructure. Mitigated by supplementing with secondary scheduled offsite logical exports for disaster recovery across providers.

---

## 3. Decision

1. **Adopt Neon Point-in-Time Recovery (PITR) as Primary Operational Recovery**:
   - Continuous WAL archiving with a minimum 14-day PITR retention window.
   - Point-in-time recovery realized via Neon copy-on-write branching (`restore-drill-YYYYMMDD` or `prod-recovered-YYYYMMDD`).
2. **Mandatory Non-Destructive Restore Drill Requirement**:
   - Restore drills must **never** overwrite, reset, or restore over the production `main` branch.
   - All recovery verifications must occur on isolated branches with separate compute endpoints.
3. **Automated Verification Gate (`db:verify:restore`)**:
   - Provide an automated test script (`packages/database/scripts/verify-restore-drill.cjs`) to empirically validate connectivity, migration history, core tables, permissions catalog, compound foreign keys, triggers, and multi-tenant isolation.
4. **Authoritative Runbook**:
   - Store detailed operator runbooks in [`docs/workflows/database-restore-runbook.md`](../workflows/database-restore-runbook.md).

---

## 4. Consequences & Impact

- **Operational Safety**: Eliminates the risk of catastrophic accidental data overwrites during recovery drills.
- **Developer Workflow**: Developers and operators can execute automated validation commands (`pnpm --filter @elimara/database run db:verify:restore`) against any restored branch to confirm schema and data integrity within seconds.
- **Auditability**: All drill executions and recovery points are recorded in a permanent audit ledger.
