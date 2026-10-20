# Module ownership

**Status: Provisional proposal — confirm with both developers.** This
assignment follows the existing collaboration model. The developer approved
the backend identity/session security baseline for Phase 02. The supplied
blueprint now informs the planned role catalogue and domain boundaries, but
does not approve action-level permission grants, shared frontend contracts, or
implementation of school-management modules.

## Initial ownership boundaries

| Area | Initial owner | Responsibilities and coordination |
| --- | --- | --- |
| `apps/api` | Backend developer (Developer A) | Express composition, backend module boundaries, server-side business rules, API implementation, security, backend tests. Coordinate public API changes with frontend developer. |
| `packages/database` | Backend developer (Developer A) | Prisma schema/client lifecycle, migration process, database constraints, tenant isolation and database tests. Migrations require explicit review; no production access. |
| `apps/api/src/modules/identity` | Backend developer (Developer A) | Login/session lifecycle and password recovery boundary. Recovery delivery and enrollment workflows require approved adapters/policies. Session-bound platform MFA enforcement is implemented in Phase 12. |
| `apps/api/src/modules/authorization` | Backend developer (Developer A) | Server-side permission evaluation and tenant-context guards. Blueprint role names are known; action-level permission matrix and delegation policy require joint approval. |
| `apps/web` | Frontend developer (Developer B) | React application and UI. Backend work must not modify this directory. |
| `packages/shared` | Both developers | Shared request/response types, validation schemas, generated clients, and any cross-app contract. Neither owner changes contracts unilaterally. |
| `docs/architecture` and API contracts | Both developers for approval | Backend developer authors proposals; affected owners review. A proposal is not an approved contract until agreement is recorded. |
| Backend feature modules | Backend developer initially | Feature allocation follows approved blueprint and backlog. Later end-to-end ownership can be agreed explicitly. |

## Proposed backend module ownership

These are proposed bounded contexts. Final grouping depends on blueprint
workflows and the reviewed data model.

| Proposed module | Main responsibility | Important boundary |
| --- | --- | --- |
| `platform-admin` | Platform-level operations and Platform Super Admin policy. | Phase 12 backend subset implements TOTP-gated school lifecycle, plan metadata, subscription history, aggregates, and platform audit. Assignment/recovery are out of band; owner membership, permission grants, billing, enforcement, and frontend contract approval remain deferred. |
| `identity` | User identity, credential/session integration, account lifecycle. | Authentication is not tenant authorization; provider choice awaits approval. |
| `schools` | School and branch lifecycle/settings. | Cannot grant platform authority. |
| `memberships` | Invitations, membership status, user-to-school relationship. | Membership is the school access gate, not a user-supplied claim. |
| `authorization` | Permission catalog, role grants, policy evaluation. | Deny by default; all feature modules invoke authorization at use-case boundaries. |
| `academics` | Academic years/terms, classes/streams, subjects and offerings. | Blueprint reviewed; exact lifecycle and curriculum policy require design approval. |
| `admissions` | Staff-only applications, review/admission workflow, and atomic conversion into a student record. | Phase 04 subset implemented under Developer A; intake remains staff-only, and admission contracts require joint frontend review. |
| `students` | Student records, initial placements, profile corrections, status, and guardian relationships. | Phase 04 subset implemented under Developer A; profile history retained, no student login or post-admission placement changes. |
| `people` / `staff` | Guardian records/relationships and school-scoped staff profiles, employment, and teaching assignments. | Guardian Phase 04 and staff Phase 05 subsets are implemented under Developer A. Staff account links do not grant access; payroll, documents, leave, and broader HR remain deferred. Published timetable lessons prevent staff deactivation until unpublished or reassigned. |
| `attendance` | Student daily/lesson and staff daily registers, marks, summaries, and correction history. | Phase 06 implemented under Developer A; school scope and permissions are server-enforced. Penalties, notifications, retention, and branch scopes remain deferred. |
| `timetable` | Weekly periods, rooms, teacher availability, lessons, conflict checks, and publication. | Phase 06 implemented under Developer A; active academic/staff assignments, capacity, tenant constraints, and publish lifecycle are enforced. Branch and calendar rules remain deferred. |
| `assessments` | School-configured grading scales, scheduled assessment lifecycle, eligible roster snapshots, marks, moderation, finalization, publication, corrections, and published report-card data. | Phase 07 implemented under Developer A; teacher entry is constrained to active staff subject assignments. Curriculum-specific rules, weighted summaries, portal access, and role grants remain deferred. |
| `finance` | Fee structures/charges and financial transaction workflows. | Transaction-safe, idempotent, auditable; no provider-specific logic in domain. |
| `communication` | In-app inbox, queue, and provider delivery tracking. | Phase 09 foundation is implemented by Developer A; only in-app delivery is active. Templates, business triggers, email/SMS providers, guardian/student targeting, consent, and retention policies require approval. Public API DTOs require joint frontend review. |
| `reports` | School-scoped dashboard summaries, paginated reports, and controlled exports. | Phase 10 implements summaries from existing source services and bounded CSV responses only. Every report checks its own and source-domain permissions; no role grants are seeded. Excel/PDF, stored background jobs, and retention await approval. |
| `library` | Approved Phase 11 Library v1: catalog, copies, school-wide circulation, FIFO reservations, and loan summary. | Backend Developer A owns the module. Existing Student/Staff records are borrowers; no duplicate people or role grants are created. The migration is unapplied and the API proposal awaits joint frontend review. |
| `school-operations` | Transport, boarding, health, meals, inventory, and broader HR domains. | Each remains unapproved and must be prioritized individually; health and dietary data require restrictive access/retention policies. |
| `reporting` | Operational reports, dashboards, and controlled exports. | Tenant scope, permissions, and audit records apply to every export. |
| `saas` | Tenant onboarding, subscriptions, plans, usage, and platform support. | Platform control-plane access stays separate from school permissions. |
| `audit` | Audit event writing/query policy. | Append-only convention, redaction, access control, and retention are explicit. |

## Cross-module coordination

- Features consume another module through an explicit application interface;
  do not import its Prisma models/repositories directly.
- Shared operations that require atomicity should use one database transaction
  boundary and explicit use-case ownership. Do not imply distributed
  transactions across modules/services.
- API paths, OpenAPI schemas, DTOs, error shapes, and generated types that
  affect both applications require joint review before publication.
- Changes to `apps/web` are outside backend ownership. Changes to
  `packages/shared` require both developers' approval.
- Record any reassignment or end-to-end feature ownership agreement before
  crossing these boundaries.

## Review and change process

The module owner proposes implementation; affected owners review cross-boundary
behavior, security, data model, and contracts. Add relevant tests and report
changed files, validation commands/results, and unresolved decisions. Do not
push or merge automatically.
