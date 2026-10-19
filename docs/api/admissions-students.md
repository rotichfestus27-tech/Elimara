# Admissions and student records API

**Phase:** 04 implementation proposal, pending database-backed validation and
joint frontend review. The endpoints are under `/api/v1`; no interfaces have
been added to `packages/shared`.

## Security and permissions

Every route requires an authenticated user and active membership in the
requested school. `schoolId` is an untrusted selector, never proof of access.
The API checks the permission named in the route table for each request. The
Phase 04 migration does not seed role grants; an active membership without the
exact grant remains denied. Mutations require the session's CSRF cookie to
match the `X-CSRF-Token` header.

| Permission | Use |
| --- | --- |
| `admissions.application.read` | List or read applications and their potential-duplicate flag. |
| `admissions.application.create` | Create/edit drafts, submit, or withdraw applications. |
| `admissions.application.review` | Start review, accept, or reject applications. |
| `admissions.application.admit` | Convert an accepted application to student/guardian/placement records. |
| `students.profile.read` | List/read students, placement history, linked guardians, and profile history. |
| `students.profile.update` | Correct a student profile; the old profile is retained. |
| `students.profile.status` | Move an active student to a terminal status. |
| `guardians.profile.read` | List/read guardians and profile history. |
| `guardians.profile.manage` | Create or correct guardian profiles; the old profile is retained. |
| `students.guardian.manage` | Create a student-guardian link or change its relationship/access flag. |
| `students.placement.manage` | Reserved for future placement operations; initial placement is created only through admission and requires `admissions.application.admit`. |

There is no Platform Super Admin bypass for these school-level operations.
Guardian links do not create accounts or portal access. Public intake,
documents, exports, deletion, and public lookups are not implemented.

## Routes

`{schoolId}`, `{id}`, and `{guardianId}` are UUIDs. Lists accept `limit`
(default 25, 1–100), `offset` (default 0, maximum 1,000,000), and allowlisted
`sortBy` / `sortOrder` values. `q` is an optional case-insensitive substring
search. Responses use `{ "data": ... }`; paginated responses include
`meta: { limit, offset, total }`.

| Method and path | Required permission | Behavior |
| --- | --- | --- |
| `POST /schools/{schoolId}/admission-applications` | `admissions.application.create` | Create a staff-entered draft. Requires `Idempotency-Key` (max 100 chars), names, at least one guardian, and at least one contact method per new guardian. Same key and same request replays the original; same key and different request returns `409 IDEMPOTENCY_KEY_REUSED`. |
| `GET /schools/{schoolId}/admission-applications` | `admissions.application.read` | Paginated list; optional `status`, `q`; sort by `createdAt`, `updatedAt`, or `status`. |
| `GET /schools/{schoolId}/admission-applications/{id}` | `admissions.application.read` | Read one application and guardian snapshots. |
| `PATCH /schools/{schoolId}/admission-applications/{id}` | `admissions.application.create` | Replace draft applicant/guardian details; draft only. |
| `POST /schools/{schoolId}/admission-applications/{id}/transitions` | Depends on transition | Body `{"transition":"submit" \| "review" \| "accept" \| "reject" \| "withdraw"}`. Submit/withdraw require `admissions.application.create`; review/accept/reject require `admissions.application.review`. |
| `POST /schools/{schoolId}/admission-applications/{id}/admit` | `admissions.application.admit` | Body requires `academicYearId`, `classId`, optional `streamId`. Atomically creates the student, admission number, initial placement, guardian records/links, history, audit events, and marks the application admitted. Identical retries return the same student; conflicting placement retries return `409`. |
| `GET /schools/{schoolId}/students` | `students.profile.read` | Paginated list; optional status and search; sort by `admissionNumber`, `familyName`, or `createdAt`. |
| `GET /schools/{schoolId}/students/{id}` | `students.profile.read` | Read a school-scoped student profile. |
| `PATCH /schools/{schoolId}/students/{id}` | `students.profile.update` | Correct given/middle/family names or date of birth. At least one field is required; prior values are retained in profile history. |
| `POST /schools/{schoolId}/students/{id}/status` | `students.profile.status` | Body is one of `TRANSFERRED`, `GRADUATED`, `WITHDRAWN`; only an active student can transition. |
| `GET /schools/{schoolId}/students/{id}/profile-history` | `students.profile.read` | Read prior student profile snapshots, newest first; paginated. |
| `GET /schools/{schoolId}/students/{id}/guardians` | `students.profile.read` and `guardians.profile.read` | List linked guardians and each relationship's explicit authorized-access flag. |
| `POST /schools/{schoolId}/students/{id}/guardians` | `students.guardian.manage` | Link an existing same-school guardian, with relationship and access flag. |
| `PATCH /schools/{schoolId}/students/{id}/guardians/{guardianId}` | `students.guardian.manage` | Update relationship or revoke/restore authorized access. No delete operation. |
| `GET /schools/{schoolId}/students/{id}/placements` | `students.profile.read` | Read placement history. Admission creates one placement per student and year. |
| `GET /schools/{schoolId}/guardians` | `guardians.profile.read` | Paginated school guardian search; sort by `familyName` or `createdAt`. |
| `POST /schools/{schoolId}/guardians` | `guardians.profile.manage` | Create a guardian with names and at least one contact method. |
| `GET /schools/{schoolId}/guardians/{guardianId}` | `guardians.profile.read` | Read one guardian profile. |
| `PATCH /schools/{schoolId}/guardians/{guardianId}` | `guardians.profile.manage` | Correct profile fields; at least one contact method must remain. Prior values are retained. |
| `GET /schools/{schoolId}/guardians/{guardianId}/profile-history` | `guardians.profile.read` | Read prior guardian snapshots, newest first; paginated. |

## Workflow and integrity rules

- Applications begin as `DRAFT`. Allowed progression is `SUBMITTED`,
  `UNDER_REVIEW`, `ACCEPTED`, and then separate admission to `ADMITTED`;
  `UNDER_REVIEW` may instead become `REJECTED`. Withdrawal is allowed before
  admission; rejected and withdrawn are terminal.
- Repeated equivalent transitions are idempotent. Other invalid transitions
  return `409 INVALID_TRANSITION`.
- Potential duplicates are flagged when given and family names match
  case-insensitively and, when supplied, the date of birth also matches. The
  flag is only for staff review; it does not block submission or admission.
- Admission number is `YYYY/NNN` (three-digit minimum, not a maximum), with
  `YYYY` from the academic year's start date. The school/year counter is
  locked and incremented in the same serializable transaction as admission.
  Numbers are unique within the school and selected academic year. Committed
  numbers are not reused. Exhaustion returns a conflict.
- Admission requires an active academic year and class in that year. Optional
  stream must be active and belong to that class. A student may have one
  placement per academic year. No reassignment or transfer workflow is exposed.
- One student is created per application. Admissions do not create fee,
  attendance, or assessment records. Guardians can be linked to multiple
  students; each link's authorized-access flag is explicit and revocable.
- Student and guardian profile edits preserve the prior snapshot in a
  same-school revision table. Revision history accepts `limit` and `offset`
  using the common pagination bounds. Student status changes and application
  transitions have actor/request-linked history. Audit metadata avoids raw
  personal details.

## Example requests and responses

Create a draft:

```http
POST /api/v1/schools/4e5a10cf-542d-4299-b46c-274f4ef20629/admission-applications
Idempotency-Key: 8b12c2fe-admission-draft-2026-001
X-CSRF-Token: <session csrf token>
Content-Type: application/json
```

```json
{
  "givenName": "Amina",
  "middleName": null,
  "familyName": "Otieno",
  "dateOfBirth": "2017-03-14",
  "guardians": [
    {
      "givenName": "Grace",
      "familyName": "Otieno",
      "phone": "+254700000000",
      "relationship": "Parent",
      "authorizedAccess": true
    }
  ]
}
```

Admission returns:

```json
{
  "data": {
    "id": "d70749da-2427-4b6c-a166-1445a91c4e1f",
    "admissionNumber": "2026/001",
    "admissionYearId": "d56d6242-b5f9-45c7-81eb-0642562b01a2",
    "admissionApplicationId": "e5701583-d1c2-45b7-8629-dad0fe699e44",
    "givenName": "Amina",
    "middleName": null,
    "familyName": "Otieno",
    "dateOfBirth": "2017-03-14",
    "status": "ACTIVE",
    "createdAt": "2026-10-20T10:00:00.000Z",
    "updatedAt": "2026-10-20T10:00:00.000Z"
  },
  "meta": { "replayed": false }
}
```

Errors follow the shared API format:

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "The application cannot transition from its current status.",
    "requestId": "request-id"
  }
}
```

Other expected errors include `401 UNAUTHENTICATED`, `403 FORBIDDEN`, the
non-disclosing `404 SCHOOL_NOT_FOUND` / `404 RECORD_NOT_FOUND`,
`400 VALIDATION_FAILED`, `409 CONFIGURATION_CONFLICT`,
`409 IDEMPOTENCY_KEY_REUSED`, and `409 CONCURRENT_CHANGE`. No password,
session token, guardian contact, or student record is returned in an error.

## Integration status

The Prisma migration is unapplied. TypeScript/schema/build and HTTP tests are
local checks; database migration execution, real PostgreSQL constraints, and
concurrent allocation require an approved disposable non-production database.
Treat this document and the OpenAPI file as a proposal until both developers
approve the request/response contract.
