# REST API conventions

**Status: Provisional proposal — pending joint frontend/backend review.** The
product blueprint has been reviewed, but no frontend/backend wire contract is
approved by this document.

## Versioning and route layout

- Put public business routes under `/api/v1`.
- Make only incompatible contract changes require a new major API version.
  Prefer additive, backward-compatible changes within an existing version.
- Publish deprecation and removal timelines before retiring a route or version.
- Keep minimal operational endpoints separate from business routes; do not
  expose credentials, stack traces, or sensitive dependency details.
- Use resource nouns and HTTP methods consistently. Document status codes and
  side effects in OpenAPI.

Example route shapes (illustrative, not approved contracts):

```text
/api/v1/schools/{schoolId}/...
/api/v1/me
/api/v1/platform/...
```

School IDs in routes are selectors, never authority. Platform routes must use
the platform authorization plane, not a school role.

## Validation and serialization

- Validate path params, query parameters, and JSON bodies with Zod at the
  boundary; reject unknown or invalid input according to an explicit schema
  policy.
- Validate configuration at process startup and fail closed on missing or
  invalid required values.
- Do not pass raw request objects into Prisma. Map validated inputs to explicit
  use-case command types and allowlisted database fields.
- Use opaque IDs and ISO-8601 UTC timestamps in public JSON. Never serialize
  Prisma models directly; use explicit response DTO mapping and redact secrets
  and internal fields.
- Define numeric precision, money/currency representation, enum evolution,
  nullability, and date-only semantics in the relevant domain contract.

## Proposed response shapes

The exact envelope requires joint approval. Suggested success shape:

```json
{
  "data": {},
  "meta": {
    "requestId": "opaque-correlation-id"
  }
}
```

Suggested error shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "issues": [],
    "requestId": "opaque-correlation-id"
  }
}
```

Error codes should be stable and machine-readable. Validation issues may
identify fields without echoing unsafe values. Responses must not include
stack traces, SQL, provider secrets, or raw database messages. Use suitable
HTTP status codes consistently; decide whether to adopt RFC 9457 Problem
Details before freezing the contract.

## Pagination, filtering, and sorting

- Set a bounded default and maximum page size.
- Prefer cursor pagination for large or frequently changing collections;
  cursors must be opaque and bound to the filter/sort context. Offset pagination
  may be acceptable for small, stable administrative lists if approved.
- Return explicit pagination metadata and a stable next cursor/page indication.
- Whitelist filter and sort keys per endpoint. Validate direction, operators,
  and values. Never accept arbitrary SQL/Prisma expressions or client field
  names.
- Include tenant and authorization scope in every query before pagination.
  Pagination is not an authorization mechanism.
- Define deterministic tie-breaker ordering to avoid duplicate/missing items
  across pages.
- Report total counts only when needed and authorized; large counts may be
  expensive and should not be computed by default.

## Idempotency and concurrency

For retryable financial or otherwise duplicate-sensitive mutations, require an
idempotency key scoped by school, operation, and authenticated actor or client
as decided by policy. Persist a request fingerprint and outcome with a unique
constraint. Return the prior outcome for a matching retry; reject reuse with a
different request body. Enforce state transitions and uniqueness transactionally
in PostgreSQL, not with a check-then-write in application memory.

Use conditional updates/version checks where concurrent edits can overwrite
meaningful state. Exact conflict response semantics require joint API review.

## Error handling and security

Map known domain, validation, authorization, not-found, conflict, and
dependency errors centrally. Keep internal errors logged with a request ID and
redaction; return safe messages and stable codes. Do not turn unexpected errors
into success responses or hide operational failures.

Authenticate and authorize before returning tenant-owned data. Avoid
distinguishing inaccessible IDs in a way that leaks another school's data.
Apply rate limits and request-size limits. Define CORS, CSRF, content security,
and security-header policies for the actual deployment topology before release.

## OpenAPI and shared frontend contract

OpenAPI is the proposed human- and tool-readable API description. Decide its
source of truth (contract-first vs. generated from route schemas) before adding
contract code. Validate generated/spec output in CI after implementation.

Backend and frontend developers must jointly approve public request/response
DTOs, error envelope, pagination metadata, ID/date conventions, session
lifecycle, active-school selection, and permission/capability summaries.
Frontend capability summaries are presentation aids only; the backend always
rechecks permissions. Do not add or modify `packages/shared` contracts
unilaterally. Generated client/types and Zod schema placement remain open.

### Phase 03 implementation note

The school configuration API is documented in
[`../api/school-configuration.md`](../api/school-configuration.md), with a
machine-readable draft at
[`../api/school-configuration.openapi.yaml`](../api/school-configuration.openapi.yaml).
The current implementation uses `{ data }` for single records and
`{ data, meta: { limit, offset, total } }` for lists. It uses bounded offset
pagination, a stable ID tie-breaker, and exact endpoint-specific sort
allowlists. This publishes behavior for integration review; it does not make
the wire format an approved shared contract.
