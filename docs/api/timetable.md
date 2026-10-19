# Timetable API

**Phase 06 API proposal.** Review with the frontend developer before treating
the DTOs as a shared contract. The matching OpenAPI paths and schemas are in
[`attendance-timetable.openapi.yaml`](attendance-timetable.openapi.yaml).
No frontend or `packages/shared` code is changed.

All routes are under `/api/v1/schools/{schoolId}`. Timetable data is school
scoped and tied to one academic year. The year/class/stream, class-subject,
staff, room, and period relationships are constrained to the same school.

## Permissions

These permission keys are definitions only; no role grants are seeded.

| Permission | Allowed operations |
| --- | --- |
| `timetable.read` | List periods, rooms, availability, timetables, and lessons. |
| `timetable.manage` | Create periods, rooms, availability windows, timetables, and draft lessons; update draft lessons. |
| `timetable.publish` | Publish and unpublish a timetable. |

Mutations require the existing CSRF header.

## Scheduling rules

- A timetable is a weekly recurring schedule for one active academic year.
  Weekdays are `MONDAY` through `SUNDAY`; periods are school-wide local
  wall-clock intervals.
- Periods have a unique school name and position, a positive sequence position,
  and non-overlapping `HH:mm` start/end times. A lesson references a start and
  end period. Multi-period lessons are allowed only when every intervening
  position exists and adjacent periods meet exactly at their boundaries.
- A lesson requires an active class, an optional active stream of that class,
  an active class-subject assignment for that class, and an active staff member
  with an active assignment to that class-subject. Rooms are optional.
- When any availability windows exist for a teacher on a weekday, the complete
  lesson interval must fit inside one of those windows. No configured windows
  means no availability restriction. Overlapping availability windows are
  rejected.
- If a room is selected, its active capacity must be at least the current
  count of active students placed in the selected class/stream for that
  academic year. This check occurs when a lesson is created or updated; it is
  not a reservation against later admissions.
- Overlap uses half-open time ranges: touching end/start boundaries do not
  overlap. For the same weekday and timetable, a teacher cannot have
  simultaneous lessons; a class-wide lesson conflicts with every stream in
  that class; two stream-specific lessons in different streams may overlap;
  and a room cannot be double-booked.
- A published timetable is immutable until it is unpublished. Only one
  timetable may be published per school and academic year. Publication and
  unpublication are recorded in timetable event and security-audit history.
- Lesson write operations lock the timetable row while checking conflicts and
  writing. Publication locks the academic-year row and is backed by a partial
  unique index. This keeps concurrent writes from bypassing overlap checks.

## Routes

| Method and path | Permission | Behavior |
| --- | --- | --- |
| `GET /timetable-periods` | `timetable.read` | List ordered school periods. |
| `POST /timetable-periods` | `timetable.manage` | Create `{ "name": "Period 1", "position": 1, "startsAt": "08:00", "endsAt": "08:40" }`. |
| `GET /rooms` | `timetable.read` | List active rooms. |
| `POST /rooms` | `timetable.manage` | Create `{ "name": "Science Lab", "capacity": 35 }`. |
| `GET /staff/{staffId}/availability` | `timetable.read` | List a staff member's weekly availability. |
| `POST /staff/{staffId}/availability` | `timetable.manage` | Add `{ "weekday": "MONDAY", "startsAt": "08:00", "endsAt": "12:00" }`. |
| `GET /academic-years/{academicYearId}/timetables` | `timetable.read` | List year timetables. |
| `POST /academic-years/{academicYearId}/timetables` | `timetable.manage` | Create a draft timetable using `{ "name": "2026 Weekly Timetable" }`. |
| `GET /timetables/{timetableId}/lessons` | `timetable.read` | List lessons. |
| `POST /timetables/{timetableId}/lessons` | `timetable.manage` | Create a draft lesson. |
| `PATCH /timetables/{timetableId}/lessons/{lessonId}` | `timetable.manage` | Replace the draft lesson assignment/time. |
| `POST /timetables/{timetableId}/publish` | `timetable.publish` | Publish if no other timetable for the year is published. |
| `POST /timetables/{timetableId}/unpublish` | `timetable.publish` | Return to draft so lessons may be changed. |

Lesson request:

```json
{
  "classId": "c7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "streamId": "d7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "classSubjectAssignmentId": "e7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "staffId": "f7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "roomId": "a7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "weekday": "MONDAY",
  "startPeriodId": "b7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
  "endPeriodId": "c7c03023-6909-4ca9-81d7-b7e9e66b4ca5"
}
```

Successful mutations use `{ "data": ... }`. Times are school-local
`HH:mm`; API DTO IDs are opaque UUIDs. Relevant errors include
`401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 SCHOOL_NOT_FOUND` /
`RECORD_NOT_FOUND`, `400 VALIDATION_FAILED` / `INVALID_RELATIONSHIP`, and
`409 TIMETABLE_CONFLICT`, `STAFF_UNAVAILABLE`, `ROOM_CAPACITY`,
`TIMETABLE_PUBLISHED`, or `ALREADY_PUBLISHED`.

## Not included or unresolved

This increment does not define branch-specific schedules, holidays, term
exceptions, timezone configuration, automatic schedule generation, teacher or
student personal timetable views, room-type taxonomies, or schedule deletion.
Period and room endpoints currently create/list; availability is append-only.
Capacity is checked against current enrollment only; admissions integration
must decide how later enrollment changes should be handled. A teacher with no
availability rows is unrestricted. No role grants are enabled.
