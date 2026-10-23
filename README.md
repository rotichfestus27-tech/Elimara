# Elimara

Elimara is a school management system being developed as a pnpm monorepo for
parallel backend and frontend work. The initial technology direction is React,
TypeScript, Vite, and Tailwind CSS for the frontend; Node.js, Express, and
TypeScript for the backend; and Neon PostgreSQL with Prisma for the database.

This repository contains the Elimara frontend, backend, Prisma data layer, and
the currently implemented school-management APIs. Consult the module API
contracts for precise feature coverage; an item in frontend navigation is not
an indication that an API workflow is available.
Read the project guidance before starting work:

- [Architecture overview](docs/architecture/overview.md)
- [Development workflow](docs/workflows/development.md)
- [Collaboration workflow](docs/workflows/collaboration.md)
- [Open decisions](docs/decisions/README.md)

## Repository layout

- `apps/api` — backend application, initially owned by Developer A
- `apps/web` — frontend application, initially owned by Developer B
- `packages/database` — database package, initially owned by Developer A
- `packages/shared` — shared code and contracts; both developers must approve
  contract changes
- `docs/architecture`, `docs/api`, `docs/workflows`, `docs/decisions` —
  project documentation
- `docs/development` — developer setup, ownership, and implementation planning

## Development setup

Use Node.js and Corepack. The root manifest pins pnpm 12.14.0; install
dependencies from the repository root with:

```text
corepack pnpm install
```

The backend runtime foundation and its setup instructions are in
[`apps/api/README.md`](apps/api/README.md). It requires non-production
development database URLs for startup and readiness; the repository contains
only safe placeholders. Node.js 24 is the current tested baseline; the
supported version range still requires developer approval. Never connect
development workflows to production services or databases. See the
[development workflow](docs/workflows/development.md) for safety requirements.

Run both applications in development from separate terminals:

```text
corepack pnpm dev
corepack pnpm dev:web
```

Or start both with `corepack pnpm dev:all`. The web app proxies `/api` to
`http://127.0.0.1:3000` by default. Configure `VITE_API_PROXY_TARGET` for a
different local API address. `VITE_API_BASE_URL` is intended for a frontend
built against an explicitly configured API origin. The frontend uses secure
session cookies and does not store authentication tokens in browser storage.

Authentication endpoint contracts are documented in
[`docs/api/authentication.md`](docs/api/authentication.md). The supplied
Elimara Complete Product Blueprint has been reviewed and informs the
architecture, role catalogue, and logical data model. Action-level permissions,
business lifecycles, shared frontend contracts, and several deployment/security
decisions still require review.

The Phase 03 school configuration routes and examples are documented in
[`docs/api/school-configuration.md`](docs/api/school-configuration.md), with a
draft OpenAPI specification beside it. Its migration is not applied, and the
frontend/backend contract still requires joint approval.

The Phase 04 admissions and student-record routes are documented in
[`docs/api/admissions-students.md`](docs/api/admissions-students.md), with a
proposed OpenAPI specification beside it. Its migration is not applied;
database-backed validation and joint frontend/backend contract approval remain
outstanding.

The Phase 05 staff profiles, employment episodes, and teaching assignments
are documented in [`docs/api/staff-management.md`](docs/api/staff-management.md)
with a proposed OpenAPI contract. Phase 06 attendance and timetable routes are
documented in [`docs/api/attendance.md`](docs/api/attendance.md) and
[`docs/api/timetable.md`](docs/api/timetable.md), with a combined proposed
OpenAPI contract. Phase 07 assessments, grading, and results are documented in
[`docs/api/assessments-results.md`](docs/api/assessments-results.md) with a
proposed OpenAPI contract. Phase 05, Phase 06, and Phase 07 migrations are
unapplied; permission grants remain unseeded. Payroll, curriculum-specific
grading, weighted academic aggregates, and automatic attendance penalties or
notifications are out of scope.

## Contribution expectations

Read [AGENTS.md](AGENTS.md) and the relevant documentation before implementing.
Respect module ownership, obtain both developers' approval for shared-contract
changes, add relevant tests, and report changed files and validation results.
Do not push or merge automatically.
