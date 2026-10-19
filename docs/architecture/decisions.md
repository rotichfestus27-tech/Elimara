# Backend architecture decisions and open questions

**Status: Blueprint reviewed; some architecture decisions remain open.** The
developer approved the identity/session security baseline on 2026-10-19 for
Phase 02. The supplied *Elimara Complete Product Blueprint* v1.0 (September
2026) is now the primary product-scope source. It informs requirements but
does not by itself approve unmade technical decisions or business-module
implementation. Use [`../decisions/README.md`](../decisions/README.md) to
record approvals.

## Confirmed constraints

These are constraints from the existing project instructions/technology
direction, not resolutions of the open questions below:

- Node.js, Express, TypeScript, Neon PostgreSQL, Prisma, Zod, REST, OpenAPI,
  Vitest, and Supertest are the requested stack.
- PostgreSQL is authoritative; business rules and authorization are enforced
  on the server.
- Prefer normalized relational data, explicit foreign keys, and
  transaction-safe, auditable financial operations.
- Every school-scoped operation must enforce school access boundaries.
- Platform administration is separate from school administration.
- Do not trust client-supplied school IDs, role names, or permissions.
- Begin as a modular monolith; AI is out of scope for initial release.
- Do not add business tables or implement business modules before architecture
  and data model review.

## Decisions required before implementation

| ID | Topic | Current direction | Still requires approval/definition |
| --- | --- | --- | --- |
| D-01 | Product name | **Elimara** is the product name; package/workspace naming remains `elimara`/`@elimara/*`. | Apply this branding consistently; preserve existing package identifiers unless separately reviewed. |
| D-02 | Product scope | Use *Elimara Complete Product Blueprint* v1.0 (September 2026), supplied 2026-10-19, as the primary product requirements source. | Prioritize MVP scope, acceptance criteria, and individual module lifecycles. |
| D-03 | Technology stack | Use the explicitly approved project stack: Express/TypeScript, Neon PostgreSQL, Prisma, Zod, REST/OpenAPI, pnpm. | The blueprint's Firebase Authentication, Firestore, Cloud Functions, and managed-cloud suggestions are alternatives, not selected dependencies. Revisit only through a recorded architecture decision. |
| D-04 | Architecture style | Begin as a modular monolith; keep external integrations behind adapters. | Final module boundaries and cross-module transaction ownership as workflows are designed. |
| D-05 | Platform Super Admin | Separate platform control plane from school membership/roles; Phase 12 backend subset uses out-of-band assignment, mandatory TOTP, recent session-bound step-up, and no impersonation. | Production bootstrap/recovery runbook, break-glass policy, TOTP key custody/rotation, and final joint review of the API/audit contract. No school-side operation may grant platform authority. |
| D-06 | Tenant isolation | **Approved baseline:** server-derived membership context, scoped repository access, and relational constraints; evaluate RLS as defense in depth. | Prove Neon pooled connections and Prisma transaction-local context before enabling RLS. |
| D-07 | Authentication/session | **Approved baseline:** Argon2id local passwords, opaque hashed database sessions, HttpOnly cookies, CSRF protections, expiry/revocation, generic failures, and rate limits. | Production SameSite/domain/proxy topology, exact lifecycle/MFA policy, and recovery provider. |
| D-08 | School role catalogue | Blueprint role names and responsibility summaries are recorded in [`authorization-model.md`](authorization-model.md). | Action-level permission keys, scope/branch inheritance, fixed vs. custom roles, delegation, and grant/revocation workflow. Do not seed roles or expose role administration until reviewed. |
| D-09 | Tenant/domain model | School is tenant root; branches/campuses and academic years/terms/classes/streams/subjects are modeled within school scope. | Which records are school-wide vs. branch-specific; year/class reuse, placement history, and configurable policy inheritance. |
| D-10 | People, privacy, and documents | Global identity is separate from school-scoped student/guardian/staff records; guardian links are individually authorized. | Remaining admissions/enrollment transitions, guardianship authority/consent, detailed HR contracts/leave, document storage, retention, erasure, and jurisdictional review. |
| D-11 | Academic integrity | Configurable assessment, grading, moderation, lock/publication, and correction history are required concepts. | Curriculum mapping, grading rules, marks validation, correction approval, and result lifecycle. |
| D-12 | Finance | Ledger-oriented records, server-verified payments, idempotency, receipts, and reconciliation are required concepts. | Ledger/charge model, currencies, payment/refund/waiver/receipt lifecycle, allocation, duplicate-payment rules, and reconciliation authority. |
| D-13 | Audit | Sensitive changes are auditable; financial/security changes should be transactionally coupled to audit writes where possible. | Event coverage, sensitive-read logging, retention, access/export, immutability, and platform audit separation. |
| D-14 | API/shared contracts | `/api/v1`, OpenAPI, Zod validation, stable errors, bounded pagination, and allowlisted sorting are the current API direction. | Joint frontend/backend approval of response envelope, DTOs, pagination, active-school selection, generated/shared contract workflow. |
| D-15 | Migrations and runtime | Reviewed forward migrations; separate least-privilege runtime/migration access; disposable PostgreSQL integration tests. | Release/rollback process, local DB provisioning, supported Node range, observability/SLOs, and migration approvers. |
| D-16 | Integrations and operations | Provider-neutral boundaries; official M-PESA APIs, SMS/email/WhatsApp, storage, accounting, attendance devices, and calendar sync are potential integrations. | Provider choices, webhook guarantees, consent/opt-out, retries, data residency, RPO/RTO, backup/restore, and incident processes. |
| D-17 | AI and advanced intelligence | Explicitly excluded from the initial release; consider only after core data/permissions are reliable and separately authorized. | Future approval, risk controls, human approval, source attribution, and user-level authorization inheritance. |

## Phase 03 decisions approved by Developer A

- **2026-10-19 — school configuration permissions:** Use the server-side
  permission keys `school.profile.read`, `school.profile.update`,
  `academics.configuration.read`, and `academics.configuration.manage`.
  Permission definitions do not grant themselves to roles; role assignment
  remains a separate approval. All endpoints deny access without the matching
  active membership and permission.
- **2026-10-19 — academic periods:** Store dates as PostgreSQL `DATE`, require
  `startsOn <= endsOn`, require terms to be within their academic year, and
  reject overlapping academic years within a school and overlapping terms
  within one academic year. Names are unique case-insensitively within their
  parent scope, including inactive history; a server-derived normalized key
  backs a regular composite unique constraint represented in Prisma.
- **2026-10-19 — class and stream lifecycle:** Classes are year-scoped and
  streams belong to a class. Configuration is deactivated, not deleted.
  Deactivation is terminal; names/periods remain reserved for historical
  integrity. No teacher assignment is introduced in this phase.
- **2026-10-19 — school suspension:** A suspended or closed school blocks
  school-level operations while retaining records. Reactivation is an explicit
  platform-level operation; this phase exposes no school-admin suspend or
  reactivate endpoint. Deactivation of academic parents is permitted only
  after active children/assignments are deactivated, with no cascade.
- **2026-10-19 — school profile fields:** The phase exposes school name,
  contact email, and contact phone. Logo upload/storage, branding settings,
  work calendars, holidays, notification preferences, and grading-scale
  configuration are deferred until their storage and policy requirements are
  reviewed.
- **2026-10-19 — class-subject scope:** Implement school-scoped subject
  catalogs and class-subject assignments only. Teacher/class/subject
  assignments await the staff identity and permission model.

## Phase 04 decisions approved by Developer A

- **2026-10-20 — intake and access:** Admission applications are created and
  managed by authenticated, authorized school staff. Public/guardian intake,
  guardian portal accounts, document uploads, exports, and public lookups are
  out of scope. Permission definitions do not grant themselves to roles; no
  role grants are seeded.
- **2026-10-20 — permissions:** Use
  `admissions.application.read/create/review/admit`,
  `students.profile.read/update/status`, `guardians.profile.read/manage`,
  `students.guardian.manage`, and `students.placement.manage`. Each endpoint
  requires the exact permission documented in the admissions OpenAPI contract.
- **2026-10-20 — application workflow:** Allow `DRAFT -> SUBMITTED ->
  UNDER_REVIEW -> ACCEPTED` or `REJECTED`; admission is a separate conversion
  from `ACCEPTED`. Withdrawal is allowed before admission. Rejected and
  withdrawn applications are terminal. Repeated equivalent transitions and
  admission requests are idempotent; incompatible repeats conflict.
- **2026-10-20 — admission numbers and duplicate candidates:** Allocate a
  school- and academic-year-scoped `YYYY/NNN` at admission, using the
  academic year's start calendar year. Numbers are never reused. Application
  creation uses a required idempotency key. Matching given/family names
  (case-insensitive), and matching date of birth when supplied, set a
  `possibleDuplicate` review flag; this is not an automatic rejection or
  deduplication rule.
- **2026-10-20 — core people and placement:** A student has required legal
  given/family names and an optional date of birth. A guardian has required
  names and at least one contact method; many-to-many student/guardian
  relationships retain the relationship label and an explicit revocable
  authorized-access flag. Admission requires an active academic year and a
  class belonging to that year; a stream is optional and must belong to that
  class. One placement per student per academic year is currently supported;
  within-year reassignment/transfer is not exposed.
- **2026-10-20 — corrections and status:** Student and guardian profile edits
  preserve the prior profile in a revision record. Student status changes are
  terminal from `ACTIVE` to `TRANSFERRED`, `GRADUATED`, or `WITHDRAWN` and are
  recorded with actor and request context. Application transitions and
  sensitive mutations are audited. Records are not hard-deleted.
- **2026-10-20 — downstream work:** Admission creates only the student,
  guardian links, and required initial placement. It does not create fees,
  attendance, or assessment records. No production service or PostgreSQL
  database has been connected.

### Phase 04 implementation status

- Admissions, student, guardian, placement, status-history, and profile
  revision models; transactional persistence; staff-only REST routes; and a
  forward migration are implemented. The migration is not applied.
- OpenAPI is published as a proposal for frontend review. It is not a jointly
  approved shared contract; `packages/shared` and `apps/web` remain unchanged.
- Permission grants remain deliberately unseeded. PostgreSQL concurrency,
  migration execution, and database-backed tests require a designated
  disposable non-production database and explicit review.

## Phase 05 decisions approved by Developer A

- **2026-10-19 — staff profile and department model:** Staff profiles are
  school-scoped, with required staff number, given/family names, and position
  title; contact email/phone, middle name, department, and account linkage are
  optional. Staff number uniqueness is case-insensitive per school. Departments
  are a school-owned normalized catalog with unique case-insensitive names;
  department deactivation is blocked while active staff remain linked.
- **2026-10-19 — employment records:** Employment episodes are separate from
  staff profiles, user identity, and authorization. Each episode stores
  position title and start/end dates only. At most one episode per staff may
  have no end date. Ended records are retained. Compensation, contracts,
  payroll-ready rules, and payroll integration are excluded; the blueprint
  requires local statutory requirements before full payroll is implemented.
- **2026-10-19 — account linkage:** A staff profile may optionally link to a
  global User only through an existing membership in the same school. Linking
  does not create an account, membership, role, permission, or session.
- **2026-10-19 — teaching assignments:** Subject assignments reference an
  active class-subject configuration. Class assignments reference an active
  class and optional stream within that class. Multiple teachers may share a
  target, but duplicate active assignments for the same staff/target are
  rejected. Ended assignments are retained and reassignment creates a new
  row. Timetable/period conflicts await the timetable model.
- **2026-10-19 — staff lifecycle and permissions:** Staff profiles use
  `ACTIVE`/`INACTIVE` status and retain attributed status history. Deactivation
  is rejected until active employment and teaching assignments are explicitly
  ended; it does not silently end linked records. Reactivation requires an
  active department or an unassigned profile. Use permission keys
  `staff.profile.read/manage`, `staff.employment.read/manage`, and
  `staff.assignment.read/manage`. Define keys without seeding grants. Position
  titles do not grant authorization.

### Phase 05 implementation status

- Staff profiles, departments, employment episodes, status events, class and
  subject assignments, school-scoped REST endpoints, validation, tests, and a
  forward migration are implemented. The migration is unapplied.
- API/OpenAPI documentation is a proposal for frontend review. No
  `packages/shared` or `apps/web` files were changed.
- Database-backed migration, partial-index behavior, and concurrent-write
  validation remain pending; use only an approved disposable, non-production
  PostgreSQL database.

## Phase 06 decisions approved by Developer A

- **2026-10-19 — attendance scope and status:** Implement student daily and
  lesson registers plus school-wide daily staff registers. Use the fixed
  statuses `PRESENT`, `ABSENT`, `LATE`, and `EARLY_DEPARTURE`; school-specific
  absence reasons are optional and apply only to `ABSENT`. `LATE` requires an
  arrival time and `EARLY_DEPARTURE` requires a departure time.
- **2026-10-19 — register lifecycle and corrections:** Registers start `OPEN`
  and can be finalized once. Finalization blocks new marks. Corrections to
  open or finalized registers require `attendance.register.correct` and write
  before/after revision data and a security-audit event in the same
  transaction.
- **2026-10-19 — timetable model:** Use recurring weekly schedules by weekday
  and school-local wall-clock periods under an academic year. Lessons may span
  adjacent configured periods. Rooms are optional. Enforce overlapping
  teacher, class/stream, and room conflicts; require an active subject
  assignment and active teacher. Enforce configured availability windows and
  check room capacity against current active placement counts.
- **2026-10-19 — publication and permission keys:** Timetables are draft until
  published; unpublish before editing and permit only one published timetable
  per school/year. Define `attendance.register.read/manage/correct` and
  `timetable.read/manage/publish` as backend permission keys. Do not seed role
  grants.
- **Consequences and boundaries:** No automatic penalties, repeated-absence
  alerts, or notifications. Room capacity is checked at schedule-write time,
  not reserved against later admissions. Timezone/holiday calendars,
  branch-specific timetables, personal timetable views, role grants, and
  attendance data retention remain unresolved or deferred.

## Phase 07 decisions approved by Developer A

- **2026-10-19 — academic scope:** An assessment belongs to one active
  academic year, term, class, optional stream, and class-subject assignment.
  Its date range must be contained by the selected term and year. At
  scheduling time, the service snapshots active student placements in the
  selected class/stream as eligible result rows.
- **2026-10-19 — configurable grading:** Store marks and maximum scores as
  exact decimals to four fractional places. Each assessment uses one active,
  school-owned grading scale. Scales are created with complete, contiguous,
  non-overlapping percentage bands; bands are lower-bound inclusive and
  upper-bound exclusive, except that 100 belongs to the final band. No sample
  scale is seeded. Scores are mapped using exact arithmetic; the displayed
  percentage is rounded half-up to four decimal places.
- **2026-10-19 — result lifecycle:** Assessments transition
  `DRAFT -> OPEN -> MODERATION -> FINALIZED -> PUBLISHED`. Missing marks are
  reportable but never treated as zero; finalization and publication are
  blocked while any snapshotted eligible result is missing. Finalized and
  published data are immutable until an authorized `results.correct` action
  explicitly reopens the assessment to `OPEN`; reopening unpublishes it and
  requires moderation, finalization, and publication again. Every transition
  and mark correction is recorded in an event/revision and security audit
  within the same transaction.
- **2026-10-19 — permissions and authority:** Define
  `assessments.read/manage` and
  `results.enter/correct/moderate/finalize/publish`. These definitions do not
  seed role grants. The proposed actor split is academic administrators for
  assessment setup, moderation, and finalization; teachers for entering marks
  only when the authenticated staff profile has an active assignment to the
  assessment's class-subject; and explicitly authorized school
  administrators for publication. Role-to-permission grants remain
  unconfigured and deny by default.
- **Consequences and boundaries:** Curriculum-specific rules, competency
  tracking, manual grade overrides, missing-mark exemptions, weighted
  aggregates, term averages, and report-card layout are deferred. Report-card
  data contains only published assessment results grouped by subject; no
  aggregate score is implied. A frontend/API proposal requires joint review;
  no shared package is modified.

### Phase 03 implementation status

- The approved Phase 03 subset is implemented as a school configuration
  service, REST endpoints, Zod request validation, Prisma models, transactional
  audit writes, and a forward migration. The migration is not applied.
- Role grants for the approved permission keys are intentionally not seeded;
  existing school memberships without those grants remain denied.
- Public response envelopes and OpenAPI examples are documented for
  frontend review, but are not yet approved shared contracts. No
  `packages/shared` interface was changed.
- PostgreSQL-backed migration and concurrency tests remain pending until a
  disposable, non-production test database is designated.

## Blueprint ambiguities and conflicts

- The blueprint recommends Firebase Authentication, Firestore, and Cloud
  Functions as one possible stack, while the project explicitly selected
  Express, Neon PostgreSQL, Prisma, and Zod. This document follows the explicit
  project stack; do not introduce those alternatives without a separate review.
- Blueprint roles have summary-level typical access only; there is no
  per-action permission matrix, scope precedence, or role delegation model.
- “Group of schools” is described as central administration plus branches, but
  the relationship between an independent School tenant and a group-level
  operator is not specified.
- The approved Phase 04 admissions and Phase 05 staff subsets are recorded
  above. Public intake, post-admission transfers, broader HR workflows,
  document handling, exports, and long-term record retention remain undefined
  or deferred. Phase 08 implements only the explicitly approved finance
  subset; broader financial policy remains unresolved.
- The blueprint identifies Kenyan data-protection considerations but does not
  define legal obligations or retention periods. Obtain qualified advice
  before encoding compliance rules.
- The approved Phase 06 model does not define school timezone and work-calendar
  configuration, branch-specific attendance/timetables, exact missing-register
  population, attendance retention, or how enrollment changes after timetable
  publication should affect room capacity. No such rules are inferred.
- Subscription tiers and provider options are illustrative only; prices,
  providers, billing lifecycles, trials, and entitlement enforcement are not
  selected. Phase 12 approves only plan/assignment metadata.
- The blueprint's production roadmap includes AI, while the project requires
  AI remain out of the initial release.
- Shared API contracts still require joint backend/frontend approval.

## Approval record

- **2026-10-19 — Phase 08 finance baseline:** Developer approved KES as the
  school currency for the initial release; fee charges are explicitly posted
  by authorized staff rather than generated automatically; payments are
  manually recorded only after staff verification, with payment-provider
  integrations deferred; allocations are explicitly selected by staff, allow
  partial amounts, and leave excess funds as unapplied student-account credit;
  posted financial records are append-only and corrected through authorized
  compensating reversals; refunds are separately recorded only after
  verification. Define (without seeding role grants) the financial permissions
  `finance.fees.read/manage`, `finance.accounts.read`,
  `finance.charges.post`, `finance.payments.read/record`,
  `finance.payments.reconcile`, `finance.adjustments.manage`,
  `finance.refunds.manage`, `finance.reports.read`, and
  `finance.receipts.read`.
  Fee structures are school/year/term/class scoped as described by the
  blueprint; no charge amounts, discounts, penalties, payment-provider
  behavior, or role grants are seeded. Financial-period closure, formal
  approval thresholds, waiver/discount categories, statement-file matching,
  and receipt-number formatting remain unresolved and are not inferred by
  this phase.
- **2026-10-19 — Phase 08 implementation boundary:** The backend implements
  the approved KES fee structure, explicit charge posting, manually verified
  payment recording, UUID receipts, partial allocation, unapplied credit,
  append-only reversals/adjustments/refunds, manual reconciliation, and
  derived summaries. Financial records and corresponding audit events are
  written transactionally; account mutations use serializable transactions,
  account row locks, and bounded retries. The forward migration is authored
  but unapplied. Permission grants remain unseeded. Provider integration,
  role grants, database-backed concurrency verification, and migration
  execution remain gated on review and an approved disposable non-production
  PostgreSQL database.
- **Phase 09 — notification foundation scope:** The approved active channel is
  in-app only. Email and SMS adapters remain dormant; WhatsApp and push are
  deferred. The implementation is infrastructure only: no business-event
  triggers or production templates are registered. Recipients are restricted
  to active users with an active membership in the selected school; guardian
  and student profile targeting awaits approved identity linkage and access
  policy. A worker in the API process polls the database queue. The inbox
  permission is `communication.notifications.read`, defined without seeded
  grants. No provider, consent, message-content, or retention policy is
  inferred.
- **Phase 09 — implementation boundary:** The API exposes a school-scoped
  recipient inbox and mark-read operation. Queue records are idempotent,
  school-membership constrained, and delivered with bounded retries. The
  migration is authored but unapplied; provider integrations, templates,
  automatic event triggers, shared frontend types, and guardian/student
  targeting remain deferred. Review the proposed contract in
  [`../api/notifications.md`](../api/notifications.md).
- **Phase 10 — reports implementation boundary:** Implement school-scoped
  reports only for existing student, attendance, assessment, finance, and
  staff source records. The dashboard composes attendance, academic, and
  finance summaries; it does not infer KPI formulas or use the blueprint's
  example percentages. Each report requires a report-specific permission and
  its source-domain permission; no role grants are seeded. CSV is the only
  active export, returned synchronously with `private, no-store`, formula
  protection, minimized fields, and a 5,000-row ceiling for student/staff
  exports. Larger exports fail rather than being queued without approved
  storage. Excel/PDF, background job lifecycle, private file storage,
  retention, scheduled reports, branch/platform scopes, and unsupported
  transport/workload/retention/communication metrics remain deferred. The
  Phase 11 Library module adds only its own loan-summary endpoint; Library is
  not composed into the Phase 10 dashboard.
  The API proposal is documented in [`../api/reports.md`](../api/reports.md).
- **2026-10-19 — Phase 11 Library v1 scope and circulation:** Developer A
  approved Library as the first extended-operations module, school-wide only
  (branch support is deferred), with existing active Student and Staff records
  as borrowers and no duplicate people records. A school-wide circulation
  policy must be configured before checkout or reservation; no loan duration,
  active-loan limit, renewal limit, or hold duration is seeded. Reservation
  queues are FIFO by title with one active reservation per borrower/title;
  ready-hold expiry uses the configured policy and is reconciled during the
  next circulation mutation. Borrower self-service and fines are deferred;
  fines will not post to Finance in this increment. Catalog and circulation
  records are never hard-deleted; titles/copies may be archived only when the
  title has no active loan or reservation. Library permission definitions are
  documented in [`authorization-model.md`](authorization-model.md), with no
  role grants seeded. The forward migration is authored but unapplied; the
  proposed frontend API contract remains pending joint review at
  [`../api/library.md`](../api/library.md).
- **2026-10-19 — Phase 02 security baseline:** Developer approved the proposed
  Argon2id/local-password, opaque hashed database session/cookie, CSRF,
  single-use hashed recovery-token, separately provisioned platform-admin,
  tenant-scoped enforcement, RLS evaluation, and rate-limiting approach,
  subject to the pending items above. This approval does not approve school
  role names/permissions, shared frontend contracts, a recovery provider, or
  enabling RLS.
- **2026-10-19 — implementation limits:** Phase 02 code was authorized without
  a blueprint and therefore contains no seeded school roles/permission keys,
  role-administration endpoints, or platform-admin assignment endpoint. The
  blueprint has since been supplied and reviewed; it informs future design but
  does not retrospectively approve those implementation choices.
- **2026-10-20 — Phase 12 backend implementation approval (Developer A):**
  Implement platform-only school metadata/lifecycle operations behind the
  existing separate `PlatformAdminAssignment`, with no API for granting or
  revoking platform authority. Require six-digit TOTP on a session-bound
  step-up for platform operations; encrypt factor secrets with AES-256-GCM
  using a 32-byte environment key, rate-limit attempts, consume each TOTP
  step once, and require out-of-band provisioning/recovery. Do not implement
  impersonation or tenant student/financial data access. Create onboarded
  school records suspended and without owner memberships/role grants until
  invitations and the school permission matrix are approved. The only
  subscription scope is metadata: plan catalog, scalar entitlement metadata,
  and a historical school-plan assignment with snapshots; do not add prices,
  trials, billing, provider integration, or runtime entitlement enforcement.
  Status changes retain school data and active sessions; they block school
  requests through existing status checks and pause unclaimed school
  notifications. Record platform writes transactionally and expose only
  platform audit events. The API contract is a proposal pending Developer B
  review; the migration remains unapplied. Remaining operational review
  includes break-glass, production key custody/rotation/recovery runbooks,
  audit retention/tamper controls, and PostgreSQL-backed concurrency tests.

Update this file only after the owners explicitly approve a further decision,
recording date, participants, rationale, and consequences.
