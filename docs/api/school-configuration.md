# School profile and academic configuration API

**Implementation status:** implemented for Phase 03. The authentication and
Phase 03 migrations have not been applied to a database. The endpoint shapes
are published for frontend review; they are not yet approved shared contracts.
Do not mirror them into `packages/shared` until both developers agree.

## Security and tenant context

All paths are under `/api/v1` and require the opaque session cookie (default
name `elimara_session`) and an active school membership. The `schoolId` path
value is an untrusted selector; the server resolves that school against the
authenticated user's membership and permission on every request. A user with
no access receives a non-disclosing `404 SCHOOL_NOT_FOUND`.

Permission requirements:

| Operation | Permission |
| --- | --- |
| Read school profile | `school.profile.read` |
| Update school profile | `school.profile.update` |
| Read/list academic configuration | `academics.configuration.read` |
| Create, update, or deactivate academic configuration | `academics.configuration.manage` |

The Phase 03 migration does not seed roles or permission grants. Consequently,
an active membership alone is not sufficient for these routes; an approved
role grant must contain the exact permission. `POST`, `PATCH`, and deactivation
requests also require the CSRF cookie (default `elimara_csrf`) to match the
`X-CSRF-Token` header. The CSRF cookie is intentionally readable by the
browser; the session cookie is HttpOnly.

## Routes

| Method and path | Purpose | Success |
| --- | --- | --- |
| `GET /schools/{schoolId}` | Read school name and contact fields. | `200` |
| `PATCH /schools/{schoolId}` | Update one or more of `name`, `contactEmail`, `contactPhone`. `null` clears either contact field. | `200` |
| `GET, POST /schools/{schoolId}/academic-years` | List or create academic years. | `200`, `201` |
| `GET, POST /schools/{schoolId}/terms` | List terms for required `academicYearId`, or create a term. | `200`, `201` |
| `GET, POST /schools/{schoolId}/classes` | List classes for required `academicYearId`, or create a year-scoped class. | `200`, `201` |
| `GET, POST /schools/{schoolId}/streams` | List streams for required `classId`, or create a stream. | `200`, `201` |
| `GET, POST /schools/{schoolId}/subjects` | List or create school-owned subjects. | `200`, `201` |
| `GET, POST /schools/{schoolId}/class-subjects` | List assignments for required `classId`, or assign an existing subject to a class. | `200`, `201` |
| `GET /{collection}/{id}` | Read a single record at any academic collection path above. | `200` |
| `PATCH /academic-years/{id}`, `/terms/{id}`, `/classes/{id}`, `/streams/{id}`, `/subjects/{id}` | Update permitted fields. Class-subject assignments are immutable except for deactivation. | `200` |
| `POST /{collection}/{id}/deactivate` | Terminally deactivate academic configuration without deleting it. | `204` |

`{collection}` is prefixed by `/schools/{schoolId}` and is one of
`academic-years`, `terms`, `classes`, `streams`, `subjects`, or
`class-subjects`. Deactivation is idempotent: repeating it on an existing
inactive record returns `204`; it does not emit a second change audit event.

## List query parameters

All list endpoints support `limit` (default 25, range 1–100), `offset`
(default 0, maximum 1,000,000), `status` (`ACTIVE` or `INACTIVE`), `q`
(case-insensitive name substring), `sortBy`, and `sortOrder` (`asc`/`desc`,
default `asc`). Terms and classes require `academicYearId`; streams and
class-subject assignments require `classId`.

Sort keys are allowlisted:

| Collection | `sortBy` values |
| --- | --- |
| Academic years and terms | `name`, `startsOn`, `endsOn`, `createdAt` |
| Classes, streams, subjects | `name`, `createdAt` |
| Class-subject assignments | `createdAt`, `status` |

Lists use stable secondary ordering by ID and return:

```json
{
  "data": [],
  "meta": { "limit": 25, "offset": 0, "total": 0 }
}
```

## Date, relationship, and lifecycle rules

- Period dates are date-only ISO values (`YYYY-MM-DD`), stored as PostgreSQL
  `DATE`. Academic-year and term ranges are inclusive and must not overlap in
  their respective scopes.
- A term must fit within an active academic year. A class must reference an
  active year. A stream and class-subject assignment must reference active
  parent records in the same school.
- Name uniqueness is case-insensitive within the record's approved scope and
  includes inactive history. A server-generated lowercase key enforces this
  with regular Prisma-visible unique constraints.
- Records are not deleted or reactivated. An academic year cannot be
  deactivated while it has active terms or classes; a class cannot be
  deactivated while it has active streams or assignments; a subject cannot be
  deactivated while it has active assignments.
- Writes are transactionally coupled to a `SecurityAuditEvent`. Audit metadata
  stores record IDs and changed field names, not submitted values.
- A suspended or closed school denies school access. Reactivation and
  suspension are not school-administrator endpoints in this phase.

## Response and error examples

Successful create:

```json
{
  "data": {
    "id": "9b2aee6c-6af1-4a6f-b9c3-c9896fb63eab",
    "name": "2026",
    "startsOn": "2026-01-01",
    "endsOn": "2026-12-31",
    "status": "ACTIVE",
    "createdAt": "2026-01-01T12:00:00.000Z",
    "updatedAt": "2026-01-01T12:00:00.000Z"
  }
}
```

Validation and conflict errors use the centralized envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "requestId": "04729b46-746b-4b26-b67a-08a2ca74ac8c",
    "issues": [
      { "path": "endsOn", "code": "custom", "message": "startsOn must be on or before endsOn." }
    ]
  }
}
```

`400` covers invalid request data/relationships, `401` unauthenticated,
`403` missing permission or failed CSRF, `404` missing/inaccessible records,
`409` uniqueness, overlap, lifecycle, or concurrent-write conflicts. Unexpected
errors return a safe `500 INTERNAL_ERROR` response with a request ID.

The machine-readable OpenAPI document is
[`school-configuration.openapi.yaml`](./school-configuration.openapi.yaml).
Examples are illustrative, not generated from a production database.
