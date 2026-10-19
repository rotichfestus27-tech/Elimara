# Assessments, grading, and results API

**Phase 07 contract proposal.** Backend behavior is implemented under
`/api/v1`; the frontend must review this document and the adjacent OpenAPI
proposal before treating either as an approved shared contract. No file in
`apps/web` or `packages/shared` was changed.

## Authorization and lifecycle

Every endpoint requires an authenticated user and active membership in the
selected school. `schoolId` is an untrusted selector and all reads/writes use
school-scoped predicates plus same-school foreign keys. No Platform Super
Admin bypass or role grant is created.

| Permission | Endpoints |
| --- | --- |
| `assessments.read` | Read grading scales, assessment lists/details, mark roster/missing counts, academic summary, and published report-card data. |
| `assessments.manage` | Create/deactivate grading scales; create/edit draft assessments; open assessments. |
| `results.enter` | Enter a blank eligible mark while an assessment is open or in moderation. The actor must also be linked to active staff with an active assignment to the exact class-subject. |
| `results.correct` | Correct an entered result while open/moderating; reopen finalized/published assessment for a correction cycle. |
| `results.moderate` | Submit an open assessment for moderation. |
| `results.finalize` | Finalize a moderated assessment only after every snapshotted student has a mark. |
| `results.publish` | Publish finalized results after the missing-mark check. |

These are permission definitions, not role grants. Proposed blueprint actor
mapping is: academic administrators manage, moderate, and finalize; teachers
enter marks for their active class-subject assignments; explicitly authorized
school administrators publish. Actual role grants remain unconfigured and
deny by default.

The only assessment transitions are:

```text
DRAFT -> OPEN -> MODERATION -> FINALIZED -> PUBLISHED
                                  |             |
                                  +-----> OPEN <-+
```

Reopening requires `results.correct`, clears finalization/publication actor
and timestamp fields, and records the event. The assessment must pass
moderation, finalization, and publication again. Finalized/published marks
cannot be changed directly.

## Endpoints

All mutation requests require the existing CSRF cookie/header pair. Mutation
responses and errors use the standard API envelope.

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /schools/{schoolId}/grading-scales` | `assessments.read` | List active and inactive school scales and their immutable bands. |
| `POST /schools/{schoolId}/grading-scales` | `assessments.manage` | Create a scale with a complete set of contiguous bands; no default scale is seeded. |
| `POST /schools/{schoolId}/grading-scales/{gradingScaleId}/deactivate` | `assessments.manage` | Retire a scale; blocked while any assessment using it is unpublished. |
| `GET /schools/{schoolId}/assessments` | `assessments.read` | Filter by academic year, term, class, status; bounded `limit`/`offset`. Includes roster/entered/missing counts. |
| `POST /schools/{schoolId}/assessments` | `assessments.manage` | Schedule an assessment and snapshot its active eligible student roster. |
| `GET /schools/{schoolId}/assessments/{assessmentId}` | `assessments.read` | Read one assessment within the school. |
| `PATCH /schools/{schoolId}/assessments/{assessmentId}` | `assessments.manage` | Replace draft configuration only; roster is rebuilt atomically. |
| `POST /schools/{schoolId}/assessments/{assessmentId}/open` | `assessments.manage` | Open a draft for mark entry. |
| `POST /schools/{schoolId}/assessments/{assessmentId}/submit-for-moderation` | `results.moderate` | Move an open assessment to moderation. |
| `GET /schools/{schoolId}/assessments/{assessmentId}/marks` | `assessments.read` | Page through all eligible students, marks, and missing slots. |
| `POST /schools/{schoolId}/assessments/{assessmentId}/marks` | `results.enter` | Submit 1–500 distinct student marks atomically. Duplicate entered marks are conflicts; corrections use `PATCH`. |
| `PATCH /schools/{schoolId}/assessments/{assessmentId}/marks/{studentId}` | `results.correct` | Correct one existing mark while open/moderating; records before/after history. |
| `POST /schools/{schoolId}/assessments/{assessmentId}/finalize` | `results.finalize` | Finalize from moderation if all eligible results are present. |
| `POST /schools/{schoolId}/assessments/{assessmentId}/publish` | `results.publish` | Publish a finalized assessment after a final missing-mark check. |
| `POST /schools/{schoolId}/assessments/{assessmentId}/reopen-for-correction` | `results.correct` | Reopen finalized/published results; publication is withdrawn until republished. |
| `GET /schools/{schoolId}/students/{studentId}/report-card?academicYearId=&termId=` | `assessments.read` | Return published result rows for the selected student/year/term, grouped by subject. No weighted aggregate is inferred. |
| `GET /schools/{schoolId}/academic-summary?academicYearId=&termId=&classId=` | `assessments.read` | Return assessment, eligible, entered, missing, and published counts. |

## Validation and result semantics

- Dates are ISO calendar dates. `startsOn <= endsOn`, and the complete
  assessment date range must fit inside its active academic year and term.
- The class, optional stream, class-subject assignment, term, and grading
  scale must belong to the same school and selected academic context.
- Each assessment requires an active roster. The roster is snapshotted from
  active student placements when scheduled; later placement changes do not
  silently change eligibility.
- Marks/max scores are decimal **strings** with up to four fractional digits.
  The scale uses percentage boundaries from 0 through 100 with up to two
  fractional digits. Empty scores are represented by a missing roster mark,
  never a zero.
- Grade bands must cover `[0,100]` continuously without overlap or gaps.
  Boundaries are lower-inclusive/upper-exclusive; the final band includes
  100. Grade selection compares exact score/max arithmetic. The stored/display
  percentage is rounded half-up to four places.
- A grading scale is immutable after creation; create a new scale rather than
  altering rules used by assessment history. No sample scale is supplied.
  Deactivation is serialized against assessment creation and opening; an
  unpublished assessment prevents retiring its scale.
- An active staff subject assignment cannot be ended while any assessment for
  its class-subject assignment remains unpublished, so marks entry remains
  possible through publication.
- POST marks rejects duplicate student IDs in one body and conflicts if a
  mark was already entered. PATCH requires an existing result and creates an
  auditable revision. Bulk entry and each lifecycle transition are
  transactionally coupled to audit history.
- Finalization/publication fails with `MISSING_RESULTS` while any roster mark
  is blank. Missing-mark endpoints never create zero marks.
- Report-card data contains published results only; the frontend owns
  presentation. No curriculum-specific grade logic, competency tracking,
  manual grade override, weighted average, term average, or aggregate formula
  is implemented.

## Response examples

Success objects are wrapped in `{ "data": ... }`; paged lists also include
`meta`.

```json
{
  "data": {
    "id": "assessment-uuid",
    "academicYearId": "academic-year-uuid",
    "termId": "term-uuid",
    "classId": "class-uuid",
    "streamId": null,
    "classSubjectAssignmentId": "class-subject-uuid",
    "subjectId": "subject-uuid",
    "subjectName": "School-configured subject",
    "gradingScaleId": "school-scale-uuid",
    "name": "School-defined assessment",
    "startsOn": "2026-10-01",
    "endsOn": "2026-10-02",
    "maximumScore": "100.0000",
    "status": "DRAFT",
    "eligibleCount": 28,
    "enteredCount": 0,
    "missingCount": 28
  }
}
```

```json
{
  "data": [
    {
      "studentId": "student-uuid",
      "studentAdmissionNumber": "SCHOOL-DEFINED",
      "score": "72.5000",
      "maximumScore": "100.0000",
      "percentage": "72.5000",
      "gradeCode": "SCALE-DEFINED",
      "gradeLabel": "SCALE-DEFINED"
    }
  ],
  "meta": { "limit": 25, "offset": 0, "total": 28, "missingCount": 3 }
}
```

Errors use `{ "error": { "code", "message", "requestId" } }`. Relevant
statuses include `400 INVALID_RELATIONSHIP|INVALID_DATE_RANGE|INVALID_SCORE`,
`401 UNAUTHENTICATED`, `403` for missing permission/assignment,
`404 RECORD_NOT_FOUND|SCHOOL_NOT_FOUND`, and `409 DUPLICATE|ALREADY_ENTERED|
INVALID_STATUS|MISSING_RESULTS|EMPTY_ROSTER|SCALE_IN_USE`.

## Open requirements / not implemented

Curriculum-specific rules (including CBC competency/grade policy), exam
components and weights, missing-mark exemptions, correction approvals beyond
the distinct permission, guardian/student portal visibility and consent,
branch-level authority, retention periods, and generated PDF/report-card
presentation need separate product/legal/frontend decisions. No production
database was used and the migration has not been applied.
