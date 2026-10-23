# Database Point-in-Time Recovery and Restore Runbook

This document defines the authoritative operational runbook for executing Point-in-Time Recovery (PITR), isolated restore drills, and disaster recovery procedures for the Elimara School OS PostgreSQL database on Neon Serverless Cloud.

---

## 1. Objective and Recovery Targets

| Metric | Target | Realization Mechanism |
|---|---|---|
| **RPO (Recovery Point Objective)** | **< 5 minutes** (Target: 0s during standard operational branch PITR) | Neon's continuous Write-Ahead Log (WAL) replication across Pageservers and Safekeepers. |
| **RTO (Recovery Time Objective)** | **< 15 minutes** (Operational PITR) / **< 1 hour** (Catastrophic Offsite Restore) | Copy-on-write branch creation takes 2–5 seconds. Validation and secret cutover take 5–10 minutes. |

> [!IMPORTANT]
> **Cardinal Disaster Recovery Principle**: Never treat the existence of cloud backup or point-in-time recovery features as proof that data can be recovered. An untested backup is not a valid backup. Regular, non-destructive restore drills must be executed and logged to guarantee production recoverability.

---

## 2. Roles, Responsibilities, and Authorizations

- **Primary Operator**: Database Administrator (DBA) or Backend Lead (Developer A).
- **Secondary Reviewer**: Frontend/Platform Lead (Developer B).
- **Required Authorizations**:
  - **Drill**: Lead Developer authorization. No production write freeze or downtime required.
  - **Live Production Recovery**: Joint sign-off from Lead Developer and School Operations Director before cutting over production connection strings or freezing tenant writes.

---

## 3. Architecture & Target Isolation

```
Production Environment                     Drill / Recovery Environment
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│ Neon Project (Primary Branch)   │       │ Isolated Recovery Branch        │
│ Branch: main                    │       │ Branch: restore-drill-YYYYMMDD  │
│ Endpoint: ep-prod-...           │       │ Endpoint: ep-drill-...          │
│ Role: elimara_app (pooled)      │       │ Role: elimara_app (pooled)      │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
                 │ Continuous WAL Streaming                │ Copy-on-Write Snapshot
                 ▼                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Neon Storage Engine (Distributed Pageservers & Safekeepers)               │
└───────────────────────────────────────────────────────────────────────────┘
```

### Isolation Guarantees
1. **Zero Impact on Production**: Creating a recovery branch in Neon is a virtual metadata operation. It does not lock tables, flush production connection pools, or consume production compute capacity.
2. **Dedicated Compute Endpoint**: The restored branch receives its own independent compute endpoint (`ep-...`), distinct hostname, and separate pooler.
3. **Strict Prohibition on Overwrite**: Never use destructive commands (`neon branch reset` or `prisma db push`) against the production `main` branch. Recovery verification must always happen in an isolated branch.

---

## 4. Periodic Restore Drill Procedure (Step-by-Step)

Execute this drill monthly or after major schema migrations to verify recovery integrity.

### Step 1: Select the Target Recovery Point
Identify the target recovery timestamp ($T_{recovery}$) in UTC (e.g., 1 hour prior to current time, or a known stable point before a test migration):
```bash
# Example timestamp:
RECOVERY_TIMESTAMP="2026-10-23T10:00:00Z"
DRILL_BRANCH_NAME="restore-drill-$(date +%Y%m%d-%H%M)"
```

### Step 2: Create Isolated Recovery Branch

#### Option A: Via Neon Web Console
1. Log in to the [Neon Console](https://console.neon.tech).
2. Select the **Elimara** project.
3. Navigate to **Branches** -> click **New Branch**.
4. Configure branch settings:
   - **Branch Name**: `restore-drill-YYYYMMDD-HHMM` (e.g., `restore-drill-20261023-1400`).
   - **Parent Branch**: `main`.
   - **Create from**: Select **Point in time**.
   - **Timestamp**: Enter `$RECOVERY_TIMESTAMP` in UTC.
   - **Compute**: Select minimal compute (0.25 CU, auto-suspend enabled after 5 minutes).
5. Click **Create Branch**.

#### Option B: Via Neon CLI (`neonctl`)
```bash
neonctl branches create \
  --project-id <PROJECT_ID> \
  --name "$DRILL_BRANCH_NAME" \
  --parent main \
  --type time \
  --timestamp "$RECOVERY_TIMESTAMP"
```

### Step 3: Obtain Restored Branch Connection String
In the Neon Console under the new branch dashboard:
1. Select the connection details widget.
2. Select database `neondb` and role `elimara_app` (or `neondb_owner` for initial drill inspection).
3. Enable **Connection pooling** for pooled URL, or toggle direct compute for direct migration verification.
4. Export the connection URL to an environment variable in your terminal session:
```bash
export RESTORED_DATABASE_URL="postgresql://elimara_app:<PASSWORD>@<ep-drill-id>-pooler.<region>.aws.neon.tech/neondb?sslmode=require"
```

### Step 4: Run Automated Restore Validation Suite
Run the dedicated Elimara restore validation suite from the monorepo root:
```bash
RESTORED_DATABASE_URL="$RESTORED_DATABASE_URL" \
  pnpm --filter @elimara/database run db:verify:restore
```

The validation suite verifies:
1. **Connectivity**: Database engine responsiveness, server timestamp, and role context.
2. **Migration Ledger**: Completeness and consistency of the `_prisma_migrations` table against repository migration definitions.
3. **Core Table Inventory**: Confirms all 75+ core tables exist (users, schools, academic years, classes, finance, library, etc.).
4. **Authoritative Permissions**: Validates all 31 authoritative permissions from `SYSTEM_PERMISSIONS` are intact.
5. **Compound Foreign Keys & Multi-Tenant Constraints**: Verifies composite `(school_id, ...)` foreign keys on library, attendance, assessment, and student domains.
6. **Performance & Partial Unique Indexes**: Validates active partial indexes (e.g., active subscriptions, active staff employment, active library loans).
7. **Custom PostgreSQL Triggers**: Validates business rule triggers (`enforce_attendance_register_type`, `prevent_overlapping_grading_bands`, `check_assessment_result_consistency`).
8. **Multi-Tenant Data Isolation Smoke Tests**: Queries real tenant records and executes cross-tenant rejection checks.

### Step 5: Post-Drill Teardown & Cleanup
Once the drill verification passes:
1. Delete the ephemeral drill branch to release cloud compute resources:
   - In Neon Console: **Branches** -> select `$DRILL_BRANCH_NAME` -> **Delete Branch**.
   - Via Neon CLI:
     ```bash
     neonctl branches delete "$DRILL_BRANCH_NAME" --project-id <PROJECT_ID>
     ```
2. Record the drill execution in the **Restore Drill Audit Log** (Section 6).

---

## 5. Live Production Incident Recovery (Disaster Recovery Runbook)

When an actual disaster occurs (accidental data corruption, catastrophic table drop, rogue migration):

### Phase A: Incident Containment & Write Protection
1. **Determine Incident Timestamp ($T_{incident}$)**: Identify the exact timestamp when corruption began.
2. **Freeze Production Writes**: To prevent dirty writes or split-brain records from compounding the incident:
   ```sql
   -- Connect as neondb_owner to production main branch:
   ALTER DATABASE neondb SET default_transaction_read_only = true;
   -- Terminate active write sessions:
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE datname = 'neondb' AND pid <> pg_backend_pid() AND state = 'active';
   ```
3. Inform stakeholders that Elimara is in emergency read-only maintenance mode.

### Phase B: Point-in-Time Branch Creation
1. Set safe recovery point $T_{safe} = T_{incident} - \text{60 seconds}$.
2. Create production recovery branch `prod-recovered-YYYYMMDD-HHMM` from `main` at $T_{safe}$.

### Phase C: Reconcile Delta Writes
If legitimate business transactions occurred between $T_{safe}$ and the write freeze:
1. Connect in read-only mode to `main`.
2. Extract audit logs and payment receipts created during the delta window:
   ```sql
   SELECT * FROM financial_payments WHERE created_at >= '$T_safe';
   SELECT * FROM security_audit_events WHERE created_at >= '$T_safe';
   ```
3. Stage and verify delta records for replay after recovery validation.

### Phase D: Validate & Promote Recovered Branch
1. Run `pnpm --filter @elimara/database run db:verify:restore` against the recovery branch.
2. Apply delta writes.
3. Update production deployment secrets (`DATABASE_URL` and `DIRECT_URL`) to point to the new recovery branch endpoints.
4. Restart application server containers.
5. Verify `/health/ready` and execute smoke tests on live school portals.
6. Once stability is confirmed, archive the corrupted branch for post-mortem analysis.

---

## 6. Restore Drill Audit Log

| Drill ID | Date & Time (UTC) | Recovery Point | Duration | Operator | Validation Status | Evidence / Notes |
|---|---|---|---|---|---|---|
| `DRILL-202610-01` | 2026-10-23 11:00 UTC | `2026-10-23T10:00:00Z` | — | Ops / DBA | **BLOCKED** | Runbook & validation script authored; awaiting operator branch creation & URL input. |
