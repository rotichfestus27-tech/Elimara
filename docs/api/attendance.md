# Attendance API

**Phase 06 API proposal.** Review with the frontend developer before treating
the DTOs as a shared contract. The matching OpenAPI paths and schemas are in
[`attendance-timetable.openapi.yaml`](attendance-timetable.openapi.yaml).
No frontend or `packages/shared` code is changed.

All routes are under `/api/v1/schools/{schoolId}`. The school selector is
checked against the authenticated user's active membership; records and
relationships are additionally scoped by `schoolId` in the persistence layer
and by composite database foreign keys.

## Permissions

These permission keys are definitions only. The Phase 06 migration does not
grant them to any role.

| Permission | Allowed operations |
| --- | --- |
| `attendance.register.read` | List reasons, registers and records; read summary aggregates. |
| `attendance.register.manage` | Configure absence reasons; create registers and records; finalize registers. |
| `attendance.register.correct` | Correct an existing record in an open or finalized register. Every correction records before/after values and an audit event. |

Mutations require the existing CSRF header. Denial is server-enforced.

## Statuses and register rules

- Supported statuses are exactly `PRESENT`, `ABSENT`, `LATE`, and
  `EARLY_DEPARTURE`. Other values fail request validation.
- An `ABSENT` record may include a school-configured `reasonId`; a reason is
  optional and cannot be attached to another status. Reasons are deactivated,
  not deleted, so prior records remain attributable.
- `LATE` requires an `arrivalAt` local time (`HH:mm`); other statuses reject
  that field. `EARLY_DEPARTURE` requires `departureAt`; other statuses reject
  it.
- Registers are `OPEN` on creation and transition once to `FINALIZED`.
  Finalization prevents additions. Corrections use the separate
  `attendance.register.correct` permission and remain possible after
  finalization. Every correction is transactionally written with a revision
  snapshot and security-audit event.
- A student must have an active placement in the register's school, year,
  class, and (when selected) stream. Staff attendance requires an active staff
  profile in the same school.
- A register date must be inside its active academic year. Lesson registers
  must target a published timetable lesson whose weekday, year, class, and
  stream match the register.
- Partial unique indexes prevent duplicate daily class/stream registers,
  duplicate lesson registers for the same date, and duplicate staff daily
  registers. A record is unique per attendee per register.
- Attendance summary aggregates existing marks only. It does not infer
  missing marks or calculate penalties.

## Routes

| Method and path | Permission | Behavior |
| --- | --- | --- |
| `GET /attendance/reasons` | `attendance.register.read` | List active absence reasons. |
| `POST /attendance/reasons` | `attendance.register.manage` | Create `{ "name": "Medical" }`. |
| `POST /attendance/reasons/{reasonId}/deactivate` | `attendance.register.manage` | Retain historical reason references. |
| `GET /attendance/registers?from=&to=&type=&classId=&limit=25&offset=0` | `attendance.register.read` | Bounded list; date bounds are inclusive. |
| `POST /attendance/registers` | `attendance.register.manage` | Create a student daily, student lesson, or staff daily register. |
| `GET /attendance/registers/{registerId}/records` | `attendance.register.read` | List marked records in the school-scoped register. |
| `POST /attendance/registers/{registerId}/records` | `attendance.register.manage` | Add one attendee record. Duplicate attendee keys return `409 DUPLICATE`. |
| `PATCH /attendance/registers/{registerId}/records/{recordId}` | `attendance.register.correct` | Correct status, reason, or time; attendee identity cannot be changed. |
| `POST /attendance/registers/{registerId}/finalize` | `attendance.register.manage` | Finalize an open register; finalization is terminal. |
| `GET /attendance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&type=&classId=` | `attendance.register.read` | Count records grouped by date and status; maximum range is 366 calendar days. |

Create-register request:

```json
{
  "academicYearId": "b7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "date": "2026-10-19",
  "type": "STUDENT_DAILY",
  "classId": "c7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "streamId": "d7c03023-6909-4ca9-81d7-b7e9e66b4ca5"
}
```

For `STUDENT_LESSON`, include the class and `timetableLessonId`; `streamId`
must exactly match the lesson. For `STAFF_DAILY`, omit class, stream, and
lesson fields. Successful mutations use `{ "data": ... }`; lists use the
existing `{ "data": [], "meta": { "limit": 25, "offset": 0, "total": 0 } }`
envelope where pagination applies. Date-only values are `YYYY-MM-DD` and
times are local school wall-clock `HH:mm`.

Relevant errors include `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
`404 SCHOOL_NOT_FOUND` / `RECORD_NOT_FOUND`, `400 VALIDATION_FAILED` /
`INVALID_RELATIONSHIP`, and `409 DUPLICATE` / `REGISTER_FINALIZED`.

## Not included

No absence penalties, repeated-absence rules, alerts, notifications, guardian
access, automatic register population, attendance-device integration, or
platform-level access is implemented. Daily staff attendance is school-wide;
staff lesson attendance is not included. Role grants, branch-specific
permissions, and record-retention rules remain unapproved.
