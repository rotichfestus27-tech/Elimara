# Staff management API

**Phase 05 contract proposal.** Implemented for frontend integration review;
the response envelope and DTOs are not yet a jointly approved shared contract.
The matching OpenAPI document is
[`staff-management.openapi.yaml`](staff-management.openapi.yaml). No types were
added to `packages/shared`.

All routes are under `/api/v1/schools/{schoolId}`. Requests require an
authenticated session with an active school membership and the exact
permission shown below. Mutating requests also require the established CSRF
header. The path school ID selects a tenant; the server validates membership,
and all staff, department, employment, and assignment queries are scoped to
that school.

## Permission keys

These keys are checked server-side and are **not granted to any role** by this
phase. No role-administration endpoint or Platform Super Admin bypass is
introduced.

| Permission | Routes |
| --- | --- |
| `staff.profile.read` | List/read staff and departments |
| `staff.profile.manage` | Create/update/deactivate staff profiles and departments |
| `staff.employment.read` | Read employment history |
| `staff.employment.manage` | Create or end employment episodes |
| `staff.assignment.read` | Read teaching assignment history |
| `staff.assignment.manage` | Create or end class, stream, and subject assignments |

## Staff profiles and departments

- `GET /departments?limit=25&offset=0&status=ACTIVE&q=...&sortOrder=asc`
  lists school departments. Pagination is bounded at 100; the response is
  `{ "data": [], "meta": { "limit": 25, "offset": 0, "total": 0 } }`.
- `POST /departments` creates a department with `{ "name": "Academics" }`.
  Names are unique case-insensitively per school.
- `PATCH /departments/{id}` renames an active department. Department
  deactivation is terminal; it is blocked while active staff still reference
  it. Reassign those staff first.
- `POST /departments/{id}/deactivate` deactivates the department without
  deleting it.
- `GET /staff` supports bounded `limit`/`offset`, `status`, `departmentId`,
  `q`, `sortBy` (`staffNumber`, `familyName`, or `createdAt`), and `sortOrder`.
- `POST /staff` creates a profile. Required fields are `staffNumber`,
  `givenName`, `familyName`, and `positionTitle`. Optional fields are
  `middleName`, `contactEmail`, `contactPhone`, `departmentId`, and `userId`.
  Staff numbers are unique case-insensitively per school.
- `GET /staff/{id}` and `PATCH /staff/{id}` read and correct an existing
  profile. Updates accept only allowlisted profile fields and must contain at
  least one field.
- `PATCH /staff/{id}/status` accepts `{ "status": "ACTIVE" | "INACTIVE" }`.
  Status changes are recorded with actor and request ID. Before changing a
  profile to `INACTIVE`, explicitly end its current employment and active
  teaching assignments; the request is rejected   while any remain. Reactivation
  does not create employment or authorization and requires the profile's
  department to remain active (or to be cleared/reassigned first).

Example `POST /staff` response:

```json
{
  "data": {
    "id": "9f8e3dd1-ef9d-4bef-bdc4-d323f5ef8d4b",
    "staffNumber": "EMP-0042",
    "givenName": "Wanjiku",
    "middleName": null,
    "familyName": "Kamau",
    "contactEmail": "wanjiku@example.test",
    "contactPhone": null,
    "positionTitle": "Teacher",
    "departmentId": null,
    "department": null,
    "userId": null,
    "status": "ACTIVE",
    "createdAt": "2026-10-19T12:00:00.000Z",
    "updatedAt": "2026-10-19T12:00:00.000Z"
  }
}
```

The `userId` link is optional and requires a membership for that same school.
It links a person record only: it does not create a User, membership, session,
role, or permission. Position titles are data, not authorization roles.

## Employment history

- `GET /staff/{staffId}/employments?limit=25&offset=0` returns retained
  episodes, newest start date first, with pagination metadata.
- `POST /staff/{staffId}/employments` accepts
  `{ "positionTitle": "Teacher", "startsOn": "2026-01-05" }`.
- `POST /staff/{staffId}/employments/{employmentId}/end` accepts
  `{ "endsOn": "2026-12-18" }`.

An episode's `endsOn: null` means current. At most one current episode per
staff member is allowed. End dates cannot precede start dates. Ended records
are retained and cannot be ended a second time. Compensation, contract terms,
leave, payroll-ready data, and payroll integration are not part of this phase.

## Teaching assignments

- `GET /staff/{staffId}/assignments?limit=25&offset=0` returns class/stream and
  subject assignment history with pagination metadata.
- `POST /staff/{staffId}/class-assignments` accepts
  `{ "classId": "<uuid>", "streamId": "<uuid>" }`; `streamId` is optional and,
  when supplied, must belong to the selected active class.
- `POST /staff/{staffId}/subject-assignments` accepts
  `{ "classSubjectAssignmentId": "<uuid>" }` referencing an active, same-school
  class-subject configuration.
- End an assignment with
  `POST /staff/{staffId}/class-assignments/{assignmentId}/end` or
  `POST /staff/{staffId}/subject-assignments/{assignmentId}/end`.

Only active staff can receive assignments. The same staff member cannot have
the same active target twice; ended links remain in history and may be
reassigned as a new record. Multiple teachers may share one class/subject
target. Timetable and period overlap checks are deferred until the timetable
model and conflict rules are defined.
An active subject assignment cannot be ended while an assessment for its
class-subject target remains unpublished; this preserves the mark-entry
authorization required to complete that assessment.

## Common behavior and errors

Responses use `{ "data": ... }`; lists include `meta`. Date-only values use
`YYYY-MM-DD`, and timestamps are ISO-8601 UTC. Errors use the established
`error` envelope with stable codes. Relevant codes include:

- `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 SCHOOL_NOT_FOUND` or
  `RECORD_NOT_FOUND`
- `400 VALIDATION_FAILED`, `INVALID_RELATIONSHIP`, or `INVALID_DATE_RANGE`
- `409 DUPLICATE`, `RECORD_INACTIVE`, `ACTIVE_STAFF_REMAINS`,
  `ACTIVE_EMPLOYMENT_REMAINS`, `ACTIVE_ASSIGNMENTS_REMAIN`, or `ALREADY_ENDED`

Audit events record actor, school, request ID, target ID, event type, and
changed field names. Personal contact values and credentials are not copied
into audit metadata or request logs.

## Database and rollout status

`20261021120000_staff_management` depends on the identity, Phase 03 academic
configuration, and Phase 04 admissions migrations. It adds composite
school-scoped foreign keys, unique staff-number/department constraints,
single-current-employment and active-assignment uniqueness, and date checks.
It has **not** been applied. Review and validate the ordered migrations only
against an explicitly designated disposable, non-production PostgreSQL
database.
