# Provisional backend implementation backlog

**Status: Blueprint-informed planning; business implementation still requires
approval.** This backlog maps the supplied Elimara Complete Product Blueprint
v1.0 into backend order. It is not authorization to implement unapproved
features or invent missing lifecycle/permission rules.

Dependencies are listed explicitly; work within a phase may be parallelized
only after ownership and contracts are agreed.

## P0 — Requirements and architecture approval

1. **Review the supplied blueprint.** Complete; actor catalogue, domains,
   example workflows, technical alternatives, risks, roadmap, and gaps are
   summarized in architecture documentation. No dependency.
2. **Approve remaining architecture decisions.** Resolve permission matrix,
   tenant/group model, lifecycles, privacy/retention, finance invariants,
   platform support, API contract, and migration governance. Depends on 1.
3. **Agree on ownership and operational assumptions.** Node support range,
   disposable PostgreSQL integration setup, module owners, and shared contract
   review. Depends on 1 and 2.

## P1 — Backend technical foundation (no business modules)

4. **API runtime, database package, HTTP conventions, CI, and base test
   harness.** Implemented in Phase 01. Revisit OpenAPI generation and API
   envelope only by recorded decision. Depends on 2 and 3.
5. **Identity/session security baseline.** Implemented provisionally in Phase
   02 (opaque database sessions, Argon2id, CSRF, audit, rate limiting, tenant
   membership guard). Remaining review/testing gates are listed below.

## P2 — Identity, tenancy, and authorization foundation

6. **Review Phase 02 schema and migration.** Review generated SQL and resolve
   case-insensitive account uniqueness, nullable branch-grant uniqueness, and
   other integrity details. Apply only after explicit approval. Depends on 2.
7. **Complete PostgreSQL security integration tests.** Use a designated
   disposable non-production database to test constraints, rate-limit
   upserts, session revocation, and cross-tenant isolation. Depends on 3 and 6.
8. **Approve and implement the role/permission matrix.** Translate blueprint
   role summaries into scoped server permissions; test deny-by-default,
   revocation, delegation, and privilege-escalation cases. Depends on 2 and 7.
9. **Platform-admin bootstrap and operations.** Phase 12 now implements the
   approved separate assignment/TOTP backend boundary, with out-of-band
   provisioning/recovery and no impersonation or student/financial data
   access. Production bootstrap, break-glass, key custody/rotation, audit
   retention/tamper controls, joint API review, and PostgreSQL-backed
   concurrency validation remain required before production use. Depends on
   2 and 7.
10. **Approve recovery and account lifecycle.** Define invitation/activation,
    delivery adapter, suspension/deactivation, and recovery support. Depends
    on 2 and 5.

## P3 — Blueprint-prioritized domain capabilities

11. **School and academic setup:** school profile, academic years/terms,
    year-scoped classes/streams, subjects, and class-subject assignments.
    Phase 03 scoped implementation is in place; review and PostgreSQL-backed
    migration/concurrency tests remain outstanding. Curriculum, teacher
    assignments, branch-specific configuration, and policy settings remain
    deferred. Depends on P2 decisions and role/scope approval.
12. **Admissions and core people records:** the approved Phase 04 subset now
    includes staff-only applications, student conversion, guardian profiles
    and links, initial placement, idempotency, audit/status history, and profile
    revisions. Phase 05 separately implements staff profiles, employment
    episodes, account linkage, and teacher assignments. The Phase 04 and Phase
    05 migrations and database-backed integrity checks remain outstanding.
    Documents, public/guardian intake, portals, exports, payroll, and
    post-admission transfers remain deferred. Depends on 11 and approved data
    lifecycle policies.
13. **Attendance and timetable:** approved Phase 06 student/staff registers,
    corrections, summaries, recurring schedules, availability, capacity,
    conflict checks, and publication are implemented. Migration execution and
    PostgreSQL-backed integrity/concurrency tests remain outstanding.
    Depends on 11, relevant parts of 12, and approved permission grants.
14. **Assessments and results:** Phase 07 implements configurable school
    grading scales, scheduled assessments, frozen eligible rosters, marks,
    missing-mark reporting, moderation, finalization, publication, audited
    corrections, and published report-card data. Curriculum-specific grading,
    weighted calculations, and role grants remain deferred. Migration
    execution and PostgreSQL-backed integrity/concurrency tests remain
    outstanding. Depends on 11, 12, 5, and approved permission grants.
15. **Fees and finance:** The approved Phase 08 KES, explicit charge-posting,
    manually verified payment, manual allocation, append-only correction,
    reconciliation, and permission-definition subset is implemented with an
    unapplied forward migration, API proposal, and focused unit/HTTP tests.
    Provider integrations, waiver/discount policy, financial-period closure,
    formal approval thresholds, receipt numbering, and PostgreSQL-backed
    concurrency validation remain open/deferred.
16. **Communication and portals:** authorized targeting, delivery tracking,
    and role-appropriate self-service. Phase 09 implements only an in-app
    inbox/queue foundation for active school-linked users, without registered
    templates or automatic business-event triggers. Email/SMS providers,
    guardian/student targeting, consent, retention, workflow templates, role
    grants, and joint frontend contract approval remain deferred. The
    migration is unapplied; PostgreSQL-backed delivery-queue tests remain
    outstanding.
17. **Extended operations:** Library v1 is implemented as the first approved
    module in Phase 11: school-wide catalog/copies, configured circulation,
    student/staff loans, FIFO reservations, and a bounded loan report. Its
    migration is authored but unapplied; role grants, PostgreSQL-backed
    integrity/concurrency validation, and joint frontend contract review
    remain outstanding. Transport, boarding, health, meals, inventory, and
    broader HR remain unapproved and must be prioritized separately. Health
    and dietary records need restricted access and explicit retention
    decisions.
18. **Reporting and controlled exports:** Phase 10 implements school-scoped,
    source-service reports for students, attendance, academic completeness,
    finance, and staff; a composed dashboard; privacy-minimized CSV exports;
    and audit events. Excel/PDF, async jobs/private storage, retention,
    schedules, branch/platform scope, and global reports for transport,
    workload, or communication remain deferred pending source modules and
    design approval. The Phase 11 Library module exposes only its own loan
    summary endpoint; it is not added to the Phase 10 dashboard.
19. **SaaS operations:** Phase 12 implements a suspended tenant metadata
    onboarding record, school lifecycle, metadata-only plan catalog and
    subscription history, aggregate counts, and platform audit query. Owner
    invitations/role grants, usage collection/enforcement, prices, trials,
    billing, provider integrations, and support/impersonation tools remain
    deferred. The migration is authored but unapplied; API contract review and
    PostgreSQL-backed tests remain outstanding.

## P4 — External integrations and operations

20. **Add approved provider adapters** for payments/communications only after
    provider selection, contracts, webhook security, retries, and test
    environments are agreed. Depends on the relevant P3 domain and D-16.
21. **Add production-readiness controls** (observability, rate limiting,
    operational runbooks, backup/recovery, data retention enforcement,
    deployment pipeline) after runtime, security, and operations decisions are
    approved. No production connection/deployment is part of this planning
    phase.

## Completion gates

- No business schema/migration before the logical data model and migration
  process are reviewed.
- No shared API contract before both backend and frontend developers agree.
- Each implementation increment has relevant unit, HTTP, integration, security,
  and tenant-isolation tests as applicable.
- Report changed files, commands and results, and unresolved issues for each
  increment.
