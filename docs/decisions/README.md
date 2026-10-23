# Architecture and technical decisions

Use this directory to record decisions that affect architecture, shared
contracts, security, data, or cross-developer workflows.

## Decision process

1. Describe the context and the decision that needs to be made.
2. List viable options, trade-offs, and impacts on both developers.
3. Obtain agreement from the affected owners; shared-contract decisions require
   both developers' approval.
4. Record the selected option, rationale, owners, and date in a dedicated
   decision record before relying on it in implementation.

Do not treat a proposal, unresolved item, or implementation detail as approved
without explicit developer agreement.

## Open decisions

The following items require developer agreement before the corresponding
choices are relied on:

- **Product naming:** Elimara is the confirmed product name. Keep existing
  workspace/package identifiers unless a separate technical need and review
  justify changing them.
- **Supported Node.js version:** agree on the development and CI runtime range.
- **Tenant isolation:** validate the implemented application-level membership
  checks and database constraints with PostgreSQL integration tests; decide
  whether and how RLS can safely operate with Neon pooled connections.
- **Authentication operations:** the approved credential/session baseline is
  implemented. Decide production cookie/proxy topology, account enrollment,
  recovery delivery, privileged-account MFA, and platform-admin bootstrap.
- **Role and permission matrix:** translate the blueprint's role summaries to
  explicit actions, scopes, delegation, and audit requirements before seeding
  roles or enabling role administration.
- **Database and migration conventions:** agree on schema ownership,
  migration review, disposable PostgreSQL test setup, and financial data
  lifecycle before adding business tables or migrations.
- **School/group/branch and academic models:** define tenant/group boundaries,
  branch inheritance, academic year/class reuse, and student placement history
  before implementing school configuration features.
- **Privacy and retention:** obtain jurisdictional review and decide data
  retention, consent, erasure, document access, and sensitive health/dietary
  data policies.
- **Finance and integrations:** define ledger/payment invariants, select
  providers, and approve webhook, reconciliation, retry, consent, and data
  residency policies before integration work.
- **Shared API and type contracts:** agree jointly on each contract before
  adding it to `packages/shared` or using it across application boundaries.

This list is a record of unresolved topics, not an authorization to implement
them.

## Approved decisions

- [`2026-10-23-database-recovery-and-pitr.md`](2026-10-23-database-recovery-and-pitr.md):
  Continuous Neon point-in-time recovery (PITR) strategy, non-destructive restore
  drills on isolated branches, automated verification via `db:verify:restore`,
  and disaster recovery runbook.
- [`2026-10-23-automated-encrypted-offsite-backups.md`](2026-10-23-automated-encrypted-offsite-backups.md):
  Automated client-side AES-256-GCM encrypted offsite backup pipeline targeting
  private S3/Cloudflare R2 storage, tiered retention policy, and non-destructive
  restore verification.
- [`2026-10-26-reporting-indexes-and-baseline-performance.md`](2026-10-26-reporting-indexes-and-baseline-performance.md):
  Optimized composite reporting indexes for whole-school date-range queries across
  attendance, financial payments, fee charges, and library loans, with empirical
  EXPLAIN ANALYZE measurements and concurrent baseline load testing.
