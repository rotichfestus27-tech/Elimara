# Backend architecture

**Status: Blueprint reviewed; backend direction remains subject to joint
architecture approval.** This document incorporates *Elimara Complete Product
Blueprint*, version 1.0 (September 2026), supplied on 2026-10-19. It is a
requirements source, not approval to implement every roadmap item. Detailed
permissions, lifecycles, and operational policies not defined by the blueprint
remain explicit open decisions.

## Goals and non-goals

The backend supports the Elimara vision of a multi-school SaaS platform for
Kenyan schools and potential international expansion. It must preserve strict
school data boundaries and keep business rules on the server. PostgreSQL is
the authoritative data store.

The Phase 02 identity/session baseline, approved subsets of Phases 03 through
10, the selected Phase 11 Library v1 subset, and the Phase 12 platform
administration/metadata subset are implemented. Their
migrations remain unapplied. Remaining domain models and business modules, production
integrations, deployment, and AI features remain out of scope until separately
prioritized and approved. The blueprint explicitly places AI after reliable
core data and permissions; the project instruction keeps it out of the initial
release.

## Blueprint scope and workflow

The blueprint describes these product domains: school administration and
academics; admissions; students, guardians, and staff; attendance and
timetables; assessments, examinations, results, and reports; fees and
reconciliation; communication and user portals; library, transport, boarding,
health, meals, inventory, HR; SaaS subscriptions and tenant operations; and
later analytics/AI. Build progressively rather than treating this full scope
as an MVP.

Key cross-module flows to preserve in future design:

- Admission acceptance links a student and authorized guardian, assigns
  academic placement, makes the student available to attendance/academics, and
  can trigger finance and portal onboarding.
- Attendance corrections, alerts, and reports must use approved school
  policies, authorized relationships, and audit history.
- Assessment entry, moderation, locking, publication, and correction are
  separate controlled transitions with attributable history.
- A payment is verified server-side, idempotently recorded against the correct
  school/student account, receipted, and reconciled; browser claims do not
  establish payment status.
- Notifications are targeted to authorized audiences and retain delivery
  status where the provider supports it.

The blueprint does not specify detailed state machines, legal retention
periods, a permission-by-action matrix, or final MVP acceptance criteria.
Those must be resolved before the corresponding business module is designed.

## Technology direction

- Node.js, Express, and TypeScript in strict mode.
- Zod for request and configuration validation.
- Neon PostgreSQL as the hosted PostgreSQL service and Prisma as the ORM.
- REST APIs documented with OpenAPI.
- Vitest for unit and integration tests; Supertest for HTTP tests.
- pnpm workspaces, consistent with the existing monorepo.

The explicit project technology direction is authoritative where the blueprint
lists alternative implementation suggestions. In particular, the blueprint's
Firebase Authentication, Firestore, and Cloud Functions suggestions do not
replace the agreed local authentication/session design, Neon PostgreSQL,
Prisma, and Express API. Do not add Firebase/Firestore or cloud-provider
dependencies without a separate architecture decision. Runtime support range,
dependency versions, and deployment provider remain subject to approval.

## Architecture style

Start with a **modular monolith**. Keep one deployable API and one authoritative
relational database; do not split into microservices without demonstrated
operational or scaling need.

Use feature-oriented modules with explicit dependencies. The HTTP layer
translates transport inputs into application use cases. Application services
coordinate business operations and transactions. Domain policies enforce
business invariants. Repositories/adapters encapsulate Prisma and external
systems. Controllers must not contain business rules or issue database queries
directly.

### Proposed module structure

```text
apps/api/src/
  app.ts
  server.ts
  config/
  http/
    middleware/
    errors/
    v1/
  modules/
    platform-admin/
    identity/
    schools/
    memberships/
    authorization/
    academics/
    students/
    people/
    attendance/
    assessments/
    finance/
    communication/
    library/
    portals/
    reporting/
    school-operations/
    saas/
    audit/
  infrastructure/
    database/
    logging/
    clock/
    ids/
    integrations/
  test/

packages/database/
  prisma/
    schema.prisma
    migrations/
  src/

packages/shared/
  # Public cross-app contracts only after joint approval.
```

This is a proposed target, not a request to scaffold these directories now.
The blueprint domains inform boundaries, but grouping and sequencing require
workflow/data-model review. The API owns transport and use-case orchestration;
the database package owns Prisma schema/client lifecycle and database-specific
code. Do not create placeholder modules or implement future features merely
because they appear in this map.

### Dependency rules

- Modules depend on their own application/domain abstractions and approved
  interfaces, not another module's persistence internals.
- Cross-module operations use an explicit application service or, when
  warranted, a transactional outbox/event boundary. Do not introduce an event
  bus solely for hypothetical future use.
- Keep provider-specific code behind backend-owned adapters. Domain behavior
  must not depend on a vendor SDK or provider data model.
- Keep the frontend out of the authorization trust boundary.
- Do not add shared DTOs or validation schemas to `packages/shared` without
  joint backend/frontend approval.

## Request lifecycle

Proposed request pipeline:

1. Assign or validate a request/correlation ID and apply secure HTTP defaults.
2. Apply request-size limits, content-type rules, and rate limits appropriate
   to the endpoint.
3. Authenticate the request when the route requires an authenticated actor.
4. Resolve the requested school as a selector, then verify the actor's active
   membership and derive a server-owned tenant context.
5. Validate route params, query, and body with the route's Zod schemas.
6. Authorize the named action and resource scope in the use case.
7. Execute the use case, using an explicit database transaction where
   invariants span writes.
8. Map the result to the documented response and handle errors centrally.
9. Emit required audit records in the same transaction as sensitive changes,
   or use an approved reliable outbox pattern.

Public endpoints must opt into public access explicitly. Authentication alone
does not imply authorization.

## Configuration and observability

Validate required environment configuration at process startup; fail startup
with a safe, explicit configuration error. Never print secret values. Use
structured logs with request IDs and redaction for credentials, tokens,
personal data, and payment data. Expose only minimal liveness/readiness status;
do not disclose stack traces, secrets, or internal dependency details to API
clients.

The precise logging, metrics, tracing, retention, and health-check policies
remain open decisions.

## External integration boundaries

Future payment and communication providers should be accessed through
backend-owned interfaces and adapters. Domain modules own validation, state
transitions, and idempotency; adapters translate to provider protocols.
Provider webhooks require signature verification, replay protection, and
deduplication before mutating state. Use bounded retries and a durable outbox
only where delivery guarantees require it.

No provider, credential, production service, or external connection is selected
or created by this plan.

## Backend testing requirements

- **Unit:** application use cases, domain rules, permission decisions, and
  tenant-context derivation.
- **HTTP:** Supertest coverage for routes, Zod validation, authentication and
  authorization middleware, error mapping, and response contracts.
- **Database integration:** use a disposable non-production PostgreSQL
  database to test transactions, constraints, migrations, and (if approved)
  RLS behavior. Do not substitute SQLite for PostgreSQL-specific security
  guarantees.
- **Isolation:** negative tests for cross-school reads/writes, forged school
  and branch selectors, indirect relations, background work, and missing
  tenant context.
- **Authorization:** permission/scope matrix tests, inactive membership,
  privilege escalation attempts, and separation of platform and school
  authority.
- **Financial integrity:** duplicate/idempotent requests, concurrency,
  transaction rollback, provider event replay, and audit assertions.
- **Authentication/session:** expiry, rotation, revocation, CSRF protections,
  and secure cookie behavior after the credential/session model is approved.
- **Migrations:** migrate an empty disposable database and upgrade a prior
  supported schema; review generated SQL and constraints.

Use synthetic fixtures and local/test-only credentials. Never run tests against
production data or production services.

## Related proposals

- [Database design](database-design.md)
- [Authorization model](authorization-model.md)
- [API conventions](api-conventions.md)
- [Proposed decisions](decisions.md)
- [Module ownership](../development/module-ownership.md)
- [Backend implementation backlog](../development/backend-backlog.md)
