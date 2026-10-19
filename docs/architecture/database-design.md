# Logical database design

**Status: Blueprint-informed logical model.** Reviewed against *Elimara
Complete Product Blueprint*, version 1.0 (September 2026), supplied on
2026-10-19. Phases 03 through 10, the selected Phase 11 Library increment, and the Phase 12
platform administration subset have implemented scoped schema subsets and
unapplied migrations;
database-backed validation remains outstanding. The
remaining entity inventory is planning only. The blueprint establishes
domain concepts and relationships, not exact tables, cardinalities, state
machines, or retention rules.

The Phase 02 developer approval authorized a limited identity/security schema.
Phases 03 through 10, the selected Phase 11 increment, and the bounded Phase
12 increment approved and implemented scoped subsets documented below. All migrations are present but
unapplied. The SQL is hand-authored and requires database-backed migration
review. This does not approve other remaining product entities or modules.

## Implemented Phase 03 subset

| Entity | Purpose and relationships | Tenant scope and constraints | Lifecycle |
| --- | --- | --- | --- |
| **School profile fields** | Extends the tenant root with contact email and phone; the existing name remains editable. | Owned by the addressed school; every endpoint requires active membership and the exact profile permission. | School suspension/closure blocks operations; profile data is retained. |
| **AcademicYear** | School-level academic period; parent of Terms and year-specific Classes. | `school_id` is explicit; school-scoped composite key supports same-school child constraints. Dates use `DATE`; periods cannot overlap; normalized name key is unique per school including inactive rows. | Active or terminally inactive; no deletion or reactivation endpoint. |
| **Term** | Period contained within one AcademicYear. | Composite `(school_id, academic_year_id)` FK; dates must fit its year and not overlap other terms in that year; normalized name unique per year. | Active or terminally inactive; parent cannot be deactivated while active terms remain. |
| **AcademicClass** | School-defined class/grade for exactly one academic year. | Composite FK requires the year to belong to the same school; normalized name unique within year. | Active or terminally inactive; parent year cannot be deactivated while active classes remain. |
| **ClassStream** | Subdivision of a year-scoped class. | Composite `(school_id, class_id)` FK; normalized name unique within class. | Active or terminally inactive; class cannot be deactivated while active streams remain. |
| **Subject** | School-owned subject catalog entry, linked to class through assignments. | School-scoped; normalized name unique within school. | Active or terminally inactive; subject cannot be deactivated while active assignments remain. |
| **ClassSubjectAssignment** | Associates one school subject with one school class. | Composite FKs enforce same-school class and subject; unique class/subject pair. | Active or terminally inactive; preserved for history. |

## Implemented Phase 04 subset

This subset implements the Developer A approvals recorded in
[`decisions.md`](decisions.md). Intake remains staff-only. These models do not
implement staff records, student/guardian portal identities, document
handling, exports, fees, attendance, or assessment results.

| Entity | Purpose and relationships | Tenant scope | Lifecycle and important constraints |
| --- | --- | --- | --- |
| **AdmissionApplication** | Stores applicant names, optional date of birth, creator, workflow timestamps, idempotency fingerprint, duplicate-review flag, and optional resulting Student. | `school_id`; creator is an authenticated User whose active school access is checked by the API. | `DRAFT -> SUBMITTED -> UNDER_REVIEW -> ACCEPTED -> ADMITTED`, or review rejection; withdrawal is allowed before admission; rejected/withdrawn are terminal. Idempotency is unique by school, creator, and key. Potential duplicates are flagged only, never automatically blocked. |
| **AdmissionApplicationGuardian** | Captures each guardian contact/relationship/authorized-access choice against an application; may reference an existing Guardian in the same school. | `school_id` plus composite application and optional guardian FKs. | Snapshot retained after admission; at least one guardian contact method. Duplicate applications do not create a Student. |
| **Guardian** | School-scoped contact record linked to multiple students and applications. | `school_id`; composite references prevent cross-school links. | Names required; email or phone required. Profile edits preserve the prior values in GuardianProfileRevision. No portal account is created. |
| **Student** | Created exactly once from one accepted AdmissionApplication; references the admission AcademicYear and owns guardian links and yearly placements. | `school_id`; unique application and `(school_id, admission_year_id, admission_number)` constraints; same-school academic-year FK. | Begins `ACTIVE`; status can transition once to `TRANSFERRED`, `GRADUATED`, or `WITHDRAWN`. No hard-delete endpoint; profile edits retain prior snapshot. |
| **StudentGuardian** | Many-to-many Student/Guardian relationship containing relationship label and explicit authorized-access flag. | Composite student and guardian FKs include `school_id`. | Unique relationship per student/guardian; access defaults false and can be revoked or restored by an authorized school operator. Link changes are audited. |
| **StudentPlacement** | Records one class and optional stream for a Student in an AcademicYear, assigned by a school user. | Composite school-scoped FKs to Student, AcademicYear, AcademicClass, and optional ClassStream. | Admission requires an active year/class and a stream in that class. One placement per student/year; no within-year reassignment API is enabled. Historical placement rows are retained. |
| **AdmissionNumberCounter** | Serializes number allocation by school and admission year. | Composite primary key `(school_id, academic_year_id)` and same-school year FK. | Incremented under a row lock in the admission transaction. Numbers use the year start's calendar year and a minimum three-digit sequence; unique within the approved school/year scope; committed numbers are never reused. |
| **AdmissionApplicationStatusEvent / StudentStatusEvent** | Append-only application transition and student lifecycle status history with actor and request ID. | School-scoped subject FK; actor User FK. | Inserted in the same transaction as the state change. |
| **StudentProfileRevision / GuardianProfileRevision** | Retains the previous profile before an authorized edit, including the editing actor and request ID. | Composite FK to same-school person record; actor User FK. | Inserted in the same transaction as the edit. History reads use the corresponding profile-read permission. |

Admission-number overflow, invalid configuration relationships, duplicate
idempotency keys with different request bodies, and incompatible transitions
fail without partial commits. All records and status changes are written in
transactions. Sensitive audits store record identifiers and changed field
names, not raw personal data.

The normalized name key is generated only by the backend and is not exposed
as an API field. Each write that changes a display name updates the key in the
same transaction. Exact casing and display spelling remain preserved in the
`name` column.

## Implemented Phase 05 subset

The following models cover the approved staff-management increment. They do
not implement payroll, leave, documents, role management, or general HR
workflows.

| Entity | Purpose and relationships | Tenant scope and constraints | Lifecycle |
| --- | --- | --- | --- |
| **StaffDepartment** | School-owned normalized department catalog referenced by Staff profiles. | `school_id`; case-insensitive unique name per school. | Active/inactive; deactivation is terminal and blocked while active staff remain linked. |
| **Staff** | School-specific employment/person profile with staff number, required names/title, optional contact details and department, and optional user account link. | `school_id`; unique normalized staff number; optional `(school_id,user_id)` FK references a membership in the same school. | `ACTIVE`/`INACTIVE`; status changes are recorded by StaffStatusEvent. Deactivation is blocked until current employment and active teaching assignments are ended; reactivation requires an active department or no department link. |
| **StaffEmployment** | Employment episode distinct from profile, user identity, and authorization. | Composite `(school_id,staff_id)` FK; at most one row with null `ends_on` per staff; date check prevents an end before start. | Start/end episodes retained; position and dates only. No compensation or contract/payroll fields. |
| **StaffClassAssignment** | Assigns staff to a class or an optional stream within that class. | Composite staff, class, and optional stream FKs enforce school and class consistency. Partial unique indexes prevent a staff member's duplicate active target while allowing multiple staff to share a target. | `ended_at` closes the assignment; history is retained and a new row may represent a later assignment. |
| **StaffSubjectAssignment** | Links staff to an existing ClassSubjectAssignment. | Composite staff and class-subject FKs enforce school scope. A partial unique index prevents a duplicate active link for the same staff/subject offering. | Ended assignments remain in history; reassignment creates a new row. |
| **StaffStatusEvent** | Attributed append-only staff status history. | Same-school staff FK plus actor User FK; includes request ID. | Written in the same transaction as profile creation or status change. |

Staff account linkage requires an existing membership in that school; it does
not create or grant login access. Staff positions are free-text labels, not
roles. The Phase 05 migration follows Phase 04 because teaching assignments
reference the academic configuration created in Phase 03 and the complete
schema includes all prior migrations.

## Implemented Phase 06 attendance and timetable subset

The Phase 06 defaults and permission keys were approved by Developer A on
2026-10-19. The migration depends on the identity, academic configuration,
admissions, and staff migrations. It is not applied.

| Entity | Purpose and relationships | Tenant scope and constraints | Lifecycle |
| --- | --- | --- | --- |
| **AttendanceAbsenceReason** | School-configured optional reason for an absent mark. | Same-school unique normalized name; composite school key. | Active/inactive; deactivation does not erase references. |
| **AttendanceRegister** | Dated register for student daily, student lesson, or school-wide staff daily attendance. | School, academic year, class, optional stream and optional timetable lesson are constrained by composite FKs. Partial unique indexes prevent duplicate register scopes. | `OPEN` to terminal `FINALIZED`; finalized registers reject new marks. |
| **AttendanceRecord** | One attendance status for exactly one Student or Staff member in a register. | Unique per attendee/register; trigger and composite FKs enforce school and student/staff register kind. Students must have an active same-year placement when marked. | Status is one of `PRESENT`, `ABSENT`, `LATE`, `EARLY_DEPARTURE`; attendance correction is retained as a revision. |
| **AttendanceRecordRevision** | Before/after status, reason, and time data plus actor/request attribution. | Same-school record FK and actor User FK. | Inserted transactionally with each correction; contains no names or contact data. |
| **TimetablePeriod** | School-wide named and ordered local-time interval, reusable by weekly lessons. | Unique name/position per school; positive position and end-after-start checks; application writes prevent overlaps under school-row lock. | No deletion endpoint; lessons refer to periods through same-school FKs. |
| **SchoolRoom** | School-owned room/lab with current capacity. | Unique normalized name per school; capacity must be positive. | Active/inactive catalog state; optional lesson association. |
| **StaffAvailabilityWindow** | Weekly teacher availability window. | Same-school Staff FK and day/time check; writes reject overlaps while staff row-locked. | Windows constrain lessons once configured; no windows means unrestricted. |
| **Timetable** | Named weekly schedule under one academic year. | Composite same-school year key; partial unique index permits one published timetable per school/year. | `DRAFT` or `PUBLISHED`; unpublish before editing; publication events retained. |
| **TimetableLesson** | Weekday class/optional stream, class-subject, staff, optional room, and start/end periods. | Composite FKs enforce same school, class/year, stream/class, and subject/class. App transaction row-locks the timetable for overlap validation. | Draft edits only; publication/unpublication state is recorded on its parent timetable. |
| **TimetableEvent** | Attributed publish/unpublish history. | Same-school timetable FK and actor User FK. | Inserted in the state-change transaction. |

Attendance corrections and sensitive timetable writes also insert
`SecurityAuditEvent` records in the same transaction. The database trigger
ensures a staff register contains staff records and student registers contain
student records. Timetable conflict rules use serialized draft writes rather
than a PostgreSQL exclusion extension.

## Implemented Phase 07 assessment and results subset

Developer A approved the Phase 07 scope and rules on 2026-10-19. The
`20261023120000_assessments_grading_results` migration is hand-authored and
must be reviewed and tested on a designated disposable PostgreSQL database
before application.

| Entity | Purpose and relationships | Tenant scope and constraints | Lifecycle |
| --- | --- | --- | --- |
| **GradingScale** | Named, school-owned immutable grading configuration; created with ordered GradingBands. | Unique normalized name per school; band bounds are exact `DECIMAL(5,2)` percentages. | Active scales may be attached to new assessments; deactivation is blocked while any referencing assessment is unpublished. Create a new scale rather than editing used rules. |
| **GradingBand** | One grade code/label mapped to a percentage interval. | Same-school scale FK, unique code/position within its scale, DB range checks and overlap prevention; API requires complete contiguous 0–100 coverage. | Immutable after creation. Lower bound inclusive, upper bound exclusive except final band includes 100. |
| **Assessment** | Scheduled assessment for one term, class, optional stream, and class-subject assignment, with a selected grading scale and maximum score. | Same-school composite FKs to year, term, class, stream, class-subject, and scale. Dates must fit the term/year; max score is a positive exact decimal. | `DRAFT -> OPEN -> MODERATION -> FINALIZED -> PUBLISHED`. Draft setup only; reopening finalized/published data requires `results.correct` and clears publication state. |
| **AssessmentResult** | One eligible student slot and optional mark; the eligible roster is snapshotted from active placements at assessment creation. Stores exact score/max, calculated percentage, grade code/label snapshots, and entry/update actors. | Unique `(school_id, assessment_id, student_id)`; composite FKs enforce same-school assessment/student and denominator equality; checks enforce score bounds and all-or-none calculated fields. | Missing scores stay null and are reported, never treated as zero. Marks are entered while open/moderating; no mark is deleted. |
| **AssessmentResultRevision** | Before/after mark and calculated grade values with actor, timestamp, and request ID. | Same-school result FK and global actor FK. | Inserted atomically for each correction. |
| **AssessmentEvent** | Actor-attributed assessment state transition history. | Same-school assessment FK and actor FK. | Inserted in the same transaction as each lifecycle transition. |

Marks and maximum scores are decimal strings at the API boundary, stored as
`DECIMAL(12,4)`, and processed with integer arithmetic. Percentages are
rounded half-up to four decimal places for storage/display; grade-band
selection compares the exact score/maximum ratio to configured bounds. No
default/example scale, manual grade override, curriculum-specific rule,
competency score, or grade-points calculation is supplied.

Report-card data contains published results only. Presentation, weighted
totals, term averages, and cross-assessment calculation are not part of this
module. Academic summaries report roster, entered, missing, and published
counts only. Role grants are not seeded; see
[`authorization-model.md`](authorization-model.md). PostgreSQL-backed
migration, concurrency, and tenant-isolation testing remains pending.

## Design principles

- PostgreSQL is authoritative. Prisma is the database access and migration
  tool; it does not replace database constraints.
- Normalize school-owned records and encode important relationships with
  foreign keys and unique constraints.
- A global `User` identity is distinct from school-specific membership and
  student, guardian, or staff profiles.
- Every school-owned record has a non-null `school_id`. Child-to-parent
  references must prove school equality, preferably through composite unique
  keys and composite foreign keys such as `(school_id, branch_id)`.
- A branch may be absent only where the record is intentionally school-wide.
  A supplied branch must belong to the same school. Branch scope must not be
  inferred from nullability alone.
- Tenant-owned uniqueness includes school scope. Never rely on opaque IDs as a
  substitute for tenant predicates or authorization.
- Lifecycle state, retention, deletion, and correction rules need explicit
  domain decisions before schema implementation; approved exceptions are
  recorded in the phase-specific sections above.

## Entity inventory

| Entity | Purpose and principal relationships | Tenant scope | Lifecycle and important constraints |
| --- | --- | --- | --- |
| **School** | Tenant root; owns branches, memberships, roles, academic configuration, people, operations, and policies. | Root; one record per tenant. | Active, suspended, or closed. School suspension/closure blocks tenant operations; reactivation is platform-controlled. Closure must not cascade-delete history. |
| **Branch** | Campus or branch within exactly one School; referenced by scoped assignments and operational records. | `school_id`; unique within school. | Proposed active/archived states. Composite FK must prevent a branch from another school being referenced. Deletion/transfer rules require approval. |
| **User** | Global login identity; may have memberships in multiple schools and may be associated with person profiles. | Global identity, not itself a school record. | Credential/identity lifecycle depends on selected authentication provider. Avoid storing duplicate school-specific credentials. A global user ID does not grant tenant access. |
| **SchoolMembership** | Joins User to School; carries membership state and the basis for school-level access. | School-scoped, with user reference. | Proposed invited/active/suspended/ended states. Unique `(school_id, user_id)`; inactive membership grants no school permissions. |
| **PlatformAdminAssignment** | Explicit control-plane grant for platform operations; separate from school roles and memberships. | Platform/control-plane scope, not a school tenant role. | Highly restricted, separately granted/revoked, strongly audited. Do not infer from email, school role, or client claim. Exact bootstrap/recovery process is open. |
| **Permission** | Stable server-defined action catalog, such as a named capability on a resource. | Catalog may be global; grants are scoped by role. | Permission keys are server-controlled; clients may display capabilities but cannot supply effective grants. Naming/versioning policy is open. |
| **SchoolRole** | Blueprint-named school roles (for example, Principal, Teacher, or Bursar) assigned to a membership. | School-scoped. | The blueprint does not say whether roles are fixed, custom, or templates. Role labels are not authorization proof; role grants await an approved permission matrix. |
| **RolePermission** | Join between SchoolRole and Permission. | Inherits role's school scope. | Unique role/permission pair. Changes require high privilege and audit; no permissions may cross school scope. |
| **MembershipRoleAssignment** | Assigns one or more roles to a membership, optionally constrained to a branch. | School-scoped. | Composite constraints ensure membership, role, and optional branch all share `school_id`. Effective scope is computed server-side. |
| **AcademicYear** | School academic-year configuration; parent of Terms and year-scoped classes. | School-scoped with a composite key for same-school child references. | Active or terminally inactive; date-only bounds, no school-level overlap, case-insensitive school/name uniqueness including inactive rows. |
| **Term** | Period within an AcademicYear. | School-scoped through a composite year reference. | Date bounds must fit the parent year and cannot overlap terms in that year; inactive history is retained. |
| **AcademicClass** | School-defined academic level or grade grouping for one academic year. | School-scoped and references one same-school year. | Year-scoped; case-insensitive name uniqueness per year; terminal deactivation after active streams and subject assignments are deactivated. No national grade taxonomy is assumed. |
| **ClassStream** | Subdivision of a class or cohort, such as a school-defined section. | School-scoped; references one same-school AcademicClass and inherits its year. | Case-insensitive name uniqueness within its class; terminally deactivated, not deleted. |
| **Subject** | School-owned subject catalog entry linked to classes through assignments. | School-scoped with case-insensitive unique name. | Active or terminally inactive; curriculum codes/grades remain deferred. |
| **ClassSubjectAssignment** | Associates one school subject with one academic class. | School-scoped composite references prevent cross-school links. | Unique class/subject pair retained after deactivation; class and subject must be active at assignment time. Teacher assignment is deferred. |
| **Student** | School-specific student record; may link to a global User but does not require a login. References class/stream placement and student-related operational records. | School-scoped; optional branch and optional User link. | Proposed applicant/enrolled/withdrawn/completed states only if confirmed. Student number uniqueness is within school; history and transfer rules are open. |
| **Guardian** | School-specific guardian/contact profile; may optionally link to a global User. | School-scoped; optional branch only if meaningful. | Proposed active/archived lifecycle. Contact information is sensitive. Profile linkage must not imply access to every linked student's records. |
| **StudentGuardian** | Many-to-many student/guardian relationship; records relationship type and approved contact/collection/portal rights as defined by policy. | School-scoped with composite references. | Unique student/guardian relationship. Consent, legal authority, priority, and permission revocation rules require blueprint/policy decisions. |
| **Staff** | School-specific employment/person record; may link to a global User and membership but these are distinct relationships. | School-scoped; branch/work assignment may be many-to-many if required. | Employment states and history/termination retention must be defined. Staff record alone must not grant login or authorization. |
| **AttendanceSession / AttendanceRecord** | Implemented Phase 06 for daily and lesson student registers, daily staff registers, configured absence reasons, and attributed corrections. | School-scoped and same-school constrained. | See the Phase 06 model above; notifications, penalties, and retention policy are not implemented. |
| **Assessment** | Assessment/examination definition linked to approved academic context and subject offering. | School-scoped; optional branch where appropriate. | Lifecycle and grading scale must be configurable only as the blueprint requires. Must not reference cross-school subject/class/year. |
| **AssessmentResult** | Student's result for an Assessment. | School-scoped through assessment and student. | Unique `(school_id, assessment_id, student_id)` unless blueprint establishes multiple attempts. Score bounds/status and correction history must be enforced. |
| **FeeStructure** | School fee schedule for an academic year, term, and class. | School-scoped; same-school period/class FKs. | Approved Phase 08 subset is immutable after creation and terminally deactivated; do not overwrite a schedule used for charges. |
| **FeeItem** | Named, ordered line and fixed-precision amount within a FeeStructure. | School-scoped through structure. | Posted charge lines snapshot descriptions and amounts. No sample items or prices. |
| **StudentFeeCharge / FeeChargeItem** | Immutable posted invoice/charge copied from one fee structure for one student. | School-scoped account/student and optional source structure. | Explicit staff posting; amount snapshots and idempotency. Corrections use full charge reversal only after net allocations are reversed. |
| **FinancialPayment / FinancialReceipt** | Immutable manually verified payment and one receipt record per payment. | School-scoped account, unique optional payment reference and idempotency key. | KES `DECIMAL(14,2)`; duplicate key plus same request fingerprint replays the existing record. No provider integration or receipt sequence policy. |
| **PaymentAllocation / PaymentAllocationReversal** | Staff-selected partial/full payment-to-charge application and append-only reversal. | School-scoped payment and charge must share one account. | Cannot allocate above remaining payment or charge balance. Reversals are attributable and restore unapplied credit. |
| **ChargeReversal / FinancialAdjustment / PaymentRefund** | Append-only charge reversal, reasoned account debit/credit adjustment, and verified refund. | School-scoped same-account transaction relations. | Refunds cannot exceed unapplied payment funds; allocated funds must first be reversed. No inferred penalties, discount rules, or automatic waiver categories. |
| **PaymentReconciliation** | Append-only manual statement observation against one payment. | School-scoped payment. | Amount mismatches remain reportable exceptions; no provider or statement-file behavior is inferred. |
| **AuditEvent** | Records actor, action, target, scope, outcome, time, and redacted metadata for sensitive operations. | School scope for school operations; separate platform scope for control-plane actions. | Append-only by application convention and DB grants; no secrets or unnecessary sensitive snapshots. Retention/export and sensitive-read coverage require approval. |
| **AdmissionApplication** | Applicant, guardian, review, decision, and collected-document workflow; acceptance can lead to a Student and academic placement. | School-scoped; branch only if the school configures admissions that way. | Application/review/acceptance/rejection states and conversion rules are not specified. Preserve decision and audit history. |
| **StudentEnrollment / ClassPlacement** | Associates a Student with an academic year, class, stream, and optionally house; preserves academic history. | School-scoped; all referenced records must share school scope. | Effective dates, promotion, transfer, and multiple placement rules require definition. |
| **Department / StaffAssignment** | Organizes staff and their department, subject, class, and workload assignments. | School-scoped; branch-scoped where configured. | Employment lifecycle and historical assignment retention need definition. |
| **Timetable / Lesson / Room** | Implemented Phase 06 weekly schedules connect class/stream, subject, teacher, optional room, weekday, and configured periods. | School-scoped; branch scope remains deferred. | See Phase 06 model above; personal timetable views and automatic generation remain deferred. |
| **Assessment / AssessmentResult / GradingScale** | Implemented Phase 07 assessments, roster snapshots, marks, configurable grades, moderation, publication, and correction history. | School-scoped; linked to same-school year, term, class/stream, class-subject assignment, scale, and students. | See Phase 07 model above. Weighted components, curriculum-specific rules, and aggregates are deferred. |
| **StudentAccount / Invoice / InvoiceLine** | Tracks term or other charges and balances for a student. | School-scoped; links only to same-school students, fee structures, and periods. | Lifecycle, charge adjustments, and balance calculation rules require approval; do not overwrite posted financial history. |
| **Credit / Waiver / Refund / Receipt / ReconciliationRecord** | Documents adjustments, refunds, receipts, and matching provider/manual payment events. | School-scoped and linked to the relevant account/transaction. | Keep posted financial events immutable or corrected with traceable reversals; provider status must be verified server-side. |
| **Communication / Notification / DeliveryAttempt** | Stores targeted notices and delivery state for in-app, email, SMS, or future approved channels. | School-scoped; recipients are resolved using authorized memberships/guardian relationships. | Channel provider, consent/opt-out policy, retention, retry, and delivery guarantees require decisions. |
| **DocumentMetadata / ConsentRecord** | References securely stored documents and records consent/approval evidence. | School-scoped; linked to an authorized subject and access policy. | File bytes live behind an approved storage adapter; access URLs, retention, and consent lifecycle need policy. |
| **LibraryCategory / LibraryItem / LibraryCopy / LibraryPolicy / LibraryLoan / LibraryReservation** | Phase 11 Library v1 catalogs titles and physical copies, records school-wide loans and FIFO reservations, and applies an explicitly configured circulation policy. | School-scoped; composite foreign keys tie categories, items, copies, loans, reservations, students, and staff to the same school. Branch scope is deferred. | No values are seeded. Fine assessment/payment, barcode/RFID identifiers, borrower self-service, and branch rules are deferred. History is retained; catalog records are archived, not deleted. |
| **TransportRoute / Vehicle / Driver / Assignment** | Models transport operations and student/route assignments. | School-scoped and branch-scoped if applicable. | Assignment lifecycle, safety controls, and transport-charge linkage require definition. |
| **BoardingHouse / Room / Bed / Allocation** | Represents boarding locations and student allocations/check-ins. | School-scoped, optionally branch-scoped. | Capacity, allocation periods, movements, and sensitive welfare access need definition. |
| **HealthRecord / HealthIncident** | Stores controlled medical and emergency information. | School-scoped with restricted record-level access. | Highly sensitive; separate permissions, minimum data, retention, and access audit are required before implementation. |
| **MealPlan / Menu / DietaryRequirement** | Tracks menus, expected counts, dietary needs, and supplier/stock links. | School-scoped, optionally branch-scoped. | Dietary data is sensitive; purpose, access, and retention need policy. |
| **InventoryItem / Asset / StockMovement / MaintenanceRecord** | Tracks assets, consumables, issue/return, suppliers, and maintenance. | School-scoped, optionally branch-scoped. | Stock movement and asset lifecycle rules require definition. |
| **LeaveRecord / ContractMetadata / PayrollIntegrationReference** | Supports HR lifecycle, leave, contracts, documents, and payroll-ready integration. | School-scoped and optionally branch-scoped. | Full payroll is explicitly deferred until local statutory requirements are defined. |
| **Subscription / Plan / UsageRecord / TenantSupportEvent** | Supports SaaS plans, billing/usage, onboarding, and audited platform support. | Platform scope; subscription and usage refer to a tenant School. | Commercial rules, tenant support access, cross-tenant support workflows, and audit controls are not yet specified. |
| **ReportDefinition / ExportJob** | Runs authorized operational/management reports and controlled CSV/Excel/PDF exports. | School scope for school data; platform scope for platform reporting. | Exports require permission checks and audit events; schedules, retention, and asynchronous execution require design. |

## Relationship overview

```text
User 1---many SchoolMembership many---1 School 1---many Branch
SchoolMembership many---many SchoolRole via MembershipRoleAssignment
SchoolRole many---many Permission via RolePermission
User 0..1---many Student / Guardian / Staff profiles (school-scoped profiles)
School 1---many AcademicYear 1---many Term
School 1---many Class 1---many Stream
School 1---many Subject; academic offerings link subject/class/year
Student many---many Guardian via StudentGuardian
AttendanceSession 1---many AttendanceRecord many---1 Student
Assessment 1---many AssessmentResult many---1 Student
FeeStructure 1---many FeeItem; Student 1---many StudentFeeCharge
FinancialTransaction 1---many PaymentAllocation many---1 StudentFeeCharge
All sensitive school operations --- AuditEvent
PlatformAdminAssignment --- separate platform control plane
```

Cardinalities are a design starting point and must be reconciled with owner
decisions and actual workflows. Every tenant-owned relation and join must
enforce same-school consistency. Global identity does not imply access to any
school record.

## Tenant isolation and relational integrity

1. Include `school_id NOT NULL` on each school-owned table, including join and
   audit tables.
2. Add composite unique keys on parent `(school_id, id)` and composite foreign
   keys from children. This makes school equality a database-enforced
   relationship, not just an application convention.
3. Add tenant predicates to repository queries even when IDs are globally
   unique. A lookup by record ID alone is not an acceptable school-scoped
   access path.
4. Derive the school context from the authenticated actor and validated active
   membership. A request school ID selects a context; it does not prove
   access.
5. Evaluate PostgreSQL Row-Level Security (RLS) as additional defense in
   depth. If selected, use transaction-local tenant settings and a runtime DB
   role without owner or `BYPASSRLS` privileges. Validate Neon connection
   pooling and Prisma transaction behavior in PostgreSQL integration tests.
   RLS is proposed, not yet an approved sole or mandatory enforcement layer.
6. Ensure jobs, migrations, administration paths, and platform operations have
   explicit scope. No background task may silently run without tenant context
   when touching tenant data.

## Financial integrity

Use explicit database transactions for state changes spanning charges,
allocations, payment records, and audit. Require school-scoped idempotency
keys plus request fingerprints for retryable writes. Lock affected accounts,
payments, and charges to handle concurrency. All amounts are KES
`DECIMAL(14,2)` and use exact decimal arithmetic, never binary floats.

### Phase 08 approved finance subset

Developer A approved KES, explicit staff posting of charges, manually
verified staff-recorded payments, staff-selected partial allocations,
unapplied excess as account credit, append-only corrections, verified refunds,
and separate financial permission definitions on 2026-10-19. Fee structures
are school/year/term/class scoped. No automatic billing on admission or term
change, payment-provider integration, default prices, penalties, or discount
rules are included.

A student account is created with its first charge or payment. Balances are
derived from immutable charges less reversals, payments less refunds,
debit/credit adjustments, and allocation/reversal status. Positive net is due;
negative net is credit. Allocations do not alter account net but determine
charge-level outstanding amounts and unapplied payment credit. Payment refunds
cannot exceed the payment's unapplied amount; reverse allocations first.
Charge reversals are full and require all allocations to be reversed. Account
adjustments are explicit, reasoned debit/credit entries.

Reconciliation is manual: staff record an observed statement amount and
reference against a payment; amount mismatch is an exception, not silently
matched. There is no bank-file/provider matching. Receipt IDs are stable
identifiers; receipt-number sequencing and document rendering are deferred.
Formal approval thresholds, financial-period closure, waiver/discount
categories, currency expansion, and statutory/accounting policy remain
unresolved. See [`decisions.md`](decisions.md).

## Migration and lifecycle rules

- Keep the schema and migration history in `packages/database`.
- Generate and review migrations as explicit changes. Never edit an already
  applied migration; add a follow-up.
- Review foreign keys, tenant composites, unique constraints, indexes, RLS,
  grants, locks, and rollout/rollback strategy.
- Test empty-database setup and supported upgrade paths against disposable
  non-production PostgreSQL.
- Do not apply migrations silently or use production databases in development.

## Phase 02 schema currently implemented

The initial authentication/security schema contains:

- `User` with normalized-at-write email expectation, Argon2id password hash,
  verification timestamp, and pending/active/deactivated/suspended status.
- `UserSession` with only a hash of the opaque session token, a hash of the
  associated CSRF token, absolute expiry, and revocation timestamp.
- `AccountActionToken` with purpose, hashed token, expiry, and single-use
  marker. Password reset is implemented; delivery requires a configured
  adapter. Account activation issuance/administration is not implemented.
- `School`, `Branch`, and `SchoolMembership`; membership is unique by
  `(school_id, user_id)` and must be active for school context.
- `SchoolRole`, `Permission`, `SchoolRolePermission`, and
  `MembershipRoleGrant`; composite foreign keys bind a role grant and optional
  branch to the same school. Blueprint role names are documented in the
  authorization model, but no role/permission values are seeded until the
  permission matrix and role administration are approved.
- `PlatformAdminAssignment`, separate from school memberships and roles.
  There is no API to grant platform authority.
- `SecurityAuditEvent` for authentication/security events and
  `RateLimitBucket` with HMACed keys for shared database-backed counters.

RLS policies are not present or enabled. The generated migration in
`prisma/migrations/20261019130000_auth_foundation` has not been run against any
database and requires review and explicit approval before application.
- Prefer archival/state transitions over cascading deletion for records with
  financial, academic, or audit value. Exact retention and erasure rules are
  unresolved.

## Decisions still required after blueprint review

Post-admission transfers/reassignment and enrollment history; broader HR
employment contracts, leave, documents, and branch assignments; guardian
consent/legal authority and future portal access; configurable attendance
status and correction; curriculum-specific grading, competency tracking,
weighted assessments and aggregates; invoice,
credit, refund, payment allocation and reconciliation invariants; data
retention/erasure and document storage; school/branch policy inheritance;
report export permissions; health/dietary data access; SaaS plan and tenant
support lifecycle; and which catalogs are global versus school-owned.

## Phase 03 approved logical subset

The developer approved the following limited school/academic configuration
subset on 2026-10-19. It does not authorize admissions, student/guardian/staff
records, attendance, examinations/results, or financial models.

| Entity | Relationships and scope | Lifecycle and constraints |
| --- | --- | --- |
| **School profile** | Existing tenant root; includes name, contact email, and contact phone. | Profile edits require `school.profile.update`; school suspension/closure is platform-controlled and blocks school operations. Branding assets and calendars are deferred. |
| **AcademicYear** | Belongs to one School; parent of Terms and year-scoped Classes. | Date-only start/end, start not after end, case-insensitive school/name uniqueness, and no date overlap within one school. Deactivate only after active Terms and Classes are inactive; history is retained. |
| **Term** | Belongs to one AcademicYear and the same School. | Date-only bounds must fit the year; no overlapping terms within that year; case-insensitive name uniqueness within the year. Inactivation is terminal and does not delete results (future result entities). |
| **AcademicClass** | Belongs to one AcademicYear and School; parent of Streams and class-subject assignments. | Year-scoped, case-insensitive name uniqueness. May be deactivated only after its active Streams and class-subject assignments are inactive. |
| **ClassStream** | Belongs to one AcademicClass in the same School. | Case-insensitive name uniqueness within the class; no independent year (inherits from class); deactivation is terminal. |
| **Subject** | School-owned catalog entry; may be assigned to multiple classes. | Case-insensitive name uniqueness within the school; may be deactivated only after active class-subject assignments are deactivated. |
| **ClassSubjectAssignment** | Join between one same-school AcademicClass and Subject. | Unique class/subject pair retained after deactivation; no delete or teacher assignment in this phase. Class and subject must be active when an assignment is created. |

Every school-owned academic foreign key is composite with `school_id` where
needed to prohibit cross-school references. The API applies the approved
permission keys from [`authorization-model.md`](authorization-model.md).
The same rule applies to Phase 04 application, guardian, student, and
placement records. Neither phase seeds permission grants or enables PostgreSQL
row-level security. Related forward migrations remain unapplied pending review
and an explicitly designated disposable test/development database.

## Phase 11 Library v1 approved subset

| Entity | Purpose and relationships | Tenant scope and integrity | Lifecycle |
| --- | --- | --- | --- |
| **LibraryCategory** | School-owned category referenced by zero or more catalog items. | Category name key is unique per school, including archived history. An item may reference only a category in the same school. | Archived rather than deleted; names remain reserved. |
| **LibraryItem** | Book/title metadata (`title`, optional author/ISBN/category); parent of physical copies, loans, and reservations. | School-scoped; category reference is composite with school ID. A title UUID is its internal identifier; no barcode/RFID scheme is in v1. | Metadata can be corrected while active. Archiving is allowed only when the title has no active loan or reservation; its copies are archived in the same transaction. |
| **LibraryCopy** | One physical copy of a title; each copy uses its UUID as its internal identifier. | Composite `(school_id, item_id)` FK prevents a copy from pointing to a title in another school. A partial unique index prevents concurrent active loans for one copy. | Archived rather than deleted. The title cannot be archived while any loan or reservation is active. |
| **LibraryPolicy** | One school-wide policy with loan period, active-loan limit, renewal limit, and reservation hold duration. | One row per school; positive durations/limits (renewal limit may be zero); updates record the actor and an audit event. | No default policy is inserted. Checkout/reservation/renewal require configuration. Policy changes apply to future checkouts, renewals, and ready holds; existing due dates are not rewritten. |
| **LibraryLoan** | A checkout of one copy by exactly one existing Student or Staff profile; retains checkout, due, renewal, and return history. | School-scoped composite FKs tie copy/title/borrower to the same school. Database check requires exactly one borrower; a partial unique index permits at most one unreturned loan per copy. | `returned_at` ends the loan; it is not hard-deleted. Renewals extend the stored due date by the configured loan period and are limited by policy. |
| **LibraryReservation** | FIFO title-level reservation by exactly one existing Student or Staff profile; a ready reservation may hold one physical copy. | School-scoped composite FKs; partial unique indexes prevent duplicate active reservations per borrower/title and prevent multiple ready reservations for one copy. | `QUEUED` becomes `READY`, then `FULFILLED`, `CANCELLED`, or `EXPIRED`. A ready hold expires after the configured hold duration; expiry/promotion is reconciled during a circulation mutation (no background worker in v1). |

Checkout and circulation mutations serialize on the school row, then perform
borrower eligibility, copy availability, active-loan-limit, FIFO promotion,
and audit writes in one database transaction. Only active students and staff
may borrow; guardian borrowers and borrower self-service are out of scope.
Loan due dates are date-only UTC calendar dates. A reservation may be created
only by an authorized staff operation on behalf of its borrower. Fine
calculation, waiver, payment, and Finance-ledger integration are explicitly
deferred. PostgreSQL-backed constraint/concurrency tests must run against a
designated disposable database before the migration is applied.

## Phase 12 platform administration and SaaS metadata subset

| Entity | Purpose and relationships | Scope and integrity | Lifecycle |
| --- | --- | --- | --- |
| **PlatformAdminAssignment MFA fields** | Adds pending and active encrypted TOTP secret state and the last consumed TOTP time step to the separate platform assignment. | Secret encryption key is held in runtime environment configuration; each accepted factor step is consumed once. | Pending setup expires after 15 minutes. Recovery and assignment changes are out-of-band; no API can grant/revoke platform authority. |
| **UserSession MFA state** | `mfa_verified_at` records the time a session completed platform TOTP step-up. | Platform routes require an active platform assignment and verification within 12 hours. | A new normal session is not MFA-verified; logout/session expiry clears access naturally. |
| **SaasPlan** | Non-billing plan catalog with unique code, name, optional description, active state, and JSON entitlement metadata. | Entitlement payload is a JSON object; API limits keys and scalar values. No prices, trials, provider data, or policy interpretation are stored. | Deactivated plans cannot be newly assigned; catalog and assignment history are retained. |
| **SchoolSubscription** | Historical association of a School to a SaasPlan, with assigning user, start/end timestamps, and plan code/name/entitlement snapshot. | Foreign keys restrict deletion; a partial unique index allows one current assignment per school. Assignment mutation serializes on the School row. | Reassignment ends the prior row and inserts a snapshot; ending does not alter school access or imply a billing outcome. |
| **SecurityAuditEvent platform events** | Existing audit entity stores platform actor, event name, request ID, outcome, timestamp, and minimized metadata. | Platform audit queries include only `PLATFORM_` events without a school data scope. Sensitive values and TOTP/password inputs are excluded. | Writes are transactionally coupled to platform mutations; retention, tamper resistance, and audit key management remain operational review items. |

School onboarding creates a school record in `SUSPENDED` status and no
membership, account invitation, or school-role grant. This avoids granting
unreviewed school permissions. Platform status transitions are
`ACTIVE -> SUSPENDED/CLOSED`, `SUSPENDED -> ACTIVE/CLOSED`, and
`CLOSED -> ACTIVE`; data and memberships are preserved. Existing school access
checks reject non-active schools. Notification queue claiming pauses while a
school is suspended/closed, with in-flight delivery calls allowed to finish.

PostgreSQL-backed uniqueness, locking, migration, and concurrency checks for
these models remain outstanding pending an approved disposable database.
