# Elimara repository instructions

Elimara is a school management system being developed as a pnpm monorepo.
Read the relevant project documentation before implementation, including the
architecture overview, development workflow, collaboration workflow, and any
applicable decision records. If documentation is missing or conflicts, stop and
request clarification rather than inventing an architectural decision.

## Required practices

- Follow the approved architecture and documented decisions. Document
  undecided choices for developer approval before relying on them.
- Respect the ownership boundaries in
  [`docs/workflows/collaboration.md`](docs/workflows/collaboration.md).
- Keep changes scoped to the assigned module; never change unrelated modules.
- Never modify shared contracts without approval from both developers.
- Never expose, commit, or log credentials, tokens, or other secrets.
- Never access production databases or production services during development.
- Never bypass authorization checks. Do not implement authentication or
  authorization until explicitly authorized and designed.
- Never silently modify database migrations. Explain migration changes and get
  the required review before applying them.
- Add relevant tests for every behavior change and run the applicable checks.
- Always report changed files, commands run, test results, and unresolved
  issues.
- Never automatically push or merge changes.
- Never implement future features without explicit authorization.
- Do not build login pages, student-management features, database tables, or
  production integrations as part of the foundation.

## Repository layout

- `apps/api`: Node.js, Express, and TypeScript backend (Developer A initially)
- `apps/web`: React, TypeScript, Vite, and Tailwind frontend (Developer B initially)
- `packages/database`: database architecture and access code (Developer A initially)
- `packages/shared`: shared code and contracts; changes require agreement from
  both developers
- `docs`: approved architecture, API, workflow, and decision documentation

Do not create application scaffolds or business features unless specifically
requested.
