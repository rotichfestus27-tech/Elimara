# Collaboration workflow

## Initial ownership

| Area | Initial owner | Coordination |
| --- | --- | --- |
| `apps/api` and backend architecture | Developer A | Coordinate API or contract changes with Developer B |
| `packages/database` and database security | Developer A | Coordinate data-model changes that affect shared contracts |
| `apps/web` and frontend architecture/UI | Developer B | Coordinate API or contract changes with Developer A |
| `packages/shared` and shared contracts | Both developers | Obtain agreement from both before changing a contract |
| `docs/architecture` and decisions | Both developers | Get agreement before treating a new decision as approved |

These are initial boundaries. Developers may agree to feature-level ownership
later; record such changes before work crosses the existing boundaries.

## Coordinating changes

- Keep work scoped to the owned area and avoid editing unrelated modules.
- Discuss API shapes, shared types, and other cross-application contracts with
  both developers before changing them.
- Do not treat a unilateral code change as approval of a shared contract.
- When design choices are unresolved, document the options and obtain agreement
  before implementation rather than choosing silently.
- Keep changes reviewable and include relevant tests.

## Completion and integration

For each completed change, report the files changed, commands run, test and
validation results, and outstanding decisions or risks. Do not automatically
push or merge work. Coordinate integration explicitly with the other developer.
