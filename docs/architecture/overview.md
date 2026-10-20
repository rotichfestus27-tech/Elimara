# Architecture overview

## Scope and status

This document records the foundation's approved direction and constraints. It
does not authorize implementation of school-management features. Specific
design choices not settled here must be captured for developer approval before
they become implementation assumptions; see
[`../decisions/README.md`](../decisions/README.md).

## Technology direction

- Frontend: React, TypeScript, Vite, and Tailwind CSS in `apps/web`.
- Backend: Node.js, Express, and TypeScript in `apps/api`.
- Database: Neon PostgreSQL with Prisma in `packages/database`.
- Workspace: pnpm-managed GitHub monorepo.

This is a technology direction, not a request to scaffold applications or
connect to external services.

## Repository boundaries

- Keep frontend and backend application code in their respective `apps/`
  directories.
- Put database-specific code in `packages/database`.
- Keep genuinely shared code in `packages/shared`. Shared contracts require
  approval from both developers before changes are implemented.
- Keep architectural, API, workflow, and decision documentation in the
  corresponding `docs/` sections.
- Keep server-side business rules and security enforcement on the backend;
  frontend behavior must not be treated as an authorization boundary.

## Future system requirements

When separately authorized and designed, the system is expected to support:

- Multiple independent schools with school-specific users and records.
- Branch and campus structures within schools.
- Role-based authorization and secure authentication.
- Academic configuration, configurable school policies, and auditable
  sensitive actions.

The identity/session foundation, approved subsets through reports, the
selected Library v1 subset, and the bounded Phase 12 platform
administration/metadata subset are implemented. Other extended operations and
business data models remain unimplemented. Consult the
[Phase 03 API contract](../api/school-configuration.md) and the
blueprint-informed backend architecture, authorization model, and database
design for scope, constraints, and decisions still requiring approval.

## Security and development boundaries

- Never access production databases or production services during development.
- Never expose credentials or bypass authorization.
- Database migrations must be reviewed and must never be modified or applied
  silently.
- Do not add AI integration or advanced intelligence features during the
  foundation phase.
- Do not deploy or create production integrations as part of this foundation.
