# Development workflow

## Before implementation

1. Read [`../../AGENTS.md`](../../AGENTS.md), this document, and the relevant
   architecture, collaboration, and decision documentation.
2. Confirm the task is authorized and fits the approved architecture.
3. If a required design choice is not approved, record it in
   [`../decisions/README.md`](../decisions/README.md) and obtain agreement
   before implementation.
4. Check ownership and coordinate changes to shared contracts before editing.

## Local setup

- Use Node.js with Corepack and the pnpm version pinned in the root
  `package.json`.
- Run `corepack pnpm install` from the repository root after dependencies are
  introduced.
- Copy `.env.example` to a local, untracked `.env` and use only a designated
  non-production PostgreSQL database. The API and database package scripts are
  defined in their package manifests; see the root README for commands.
- The supported Node.js version is not yet agreed; do not establish a CI
  runtime constraint until developers approve it.

## Safe development

- Use only local or explicitly designated non-production services and data.
- Never connect to a production database or service, even for read-only
  development work.
- Never put credentials, tokens, or personal data in source control, logs, or
  documentation. Keep local secrets out of tracked files.
- Do not deploy from this foundation.
- Do not add features outside the approved phase scope, AI capabilities, or
  database tables/migrations without authorization.
- Any future migration must be visible in the change, reviewed, and explicitly
  reported; do not silently change or apply migrations.
- The Phase 02 authentication, Phase 03 school-configuration, and Phase 04
  admissions/student-record migrations, plus the Phase 05 staff migration, are
  present but unapplied. Review them in order before applying to a disposable
  development/test database. Never use production credentials or destructive
  schema commands.

## Validation and reporting

- Add relevant tests for behavior changes and run the smallest applicable
  checks, plus any required broader checks.
- PostgreSQL-backed tests must use a designated disposable test database;
  otherwise report database integration coverage as outstanding.
- Report all changed files, the exact validation commands, their results, and
  unresolved issues.
- Never automatically push or merge changes.
