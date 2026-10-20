# Identity, authorization, and tenant boundaries

**Status: Blueprint reviewed; partially approved security baseline, 2026-10-19;
see [`decisions.md`](decisions.md).** The blueprint names the roles below and
describes typical access, but does not define action-level permission keys,
role delegation, branch inheritance, or approval workflows. Record those
gaps for joint review; do not invent grants. Credential/session and
tenant-boundary foundations are implemented. Platform-admin provisioning is out of band and
the Phase 12 platform API requires TOTP step-up. Production key custody,
recovery operations, production cookie attributes, recovery delivery, and RLS
remain pending.

## Principals and trust boundaries

The backend recognizes two distinct authority planes:

1. **Platform control plane:** explicitly provisioned Platform Super Admin
   identities/assignments for platform-wide operational tasks.
2. **School tenant plane:** a global User acting through an active
   SchoolMembership with school-scoped roles and permissions.

Platform Super Admin is not a school role and must not be obtained by
assigning a school role, setting a client-supplied role name, or trusting a
frontend claim. School administrators cannot grant platform privileges.
Platform endpoints and policies should be separate from school endpoints and
policies, and platform actions must be audited independently.

Whether a platform operator may inspect school data, under what support
workflow, and with what notification/approval requirements are unresolved.
Least privilege implies no implicit tenant impersonation.

### Phase 12 platform control-plane boundary

- Platform routes require an active `PlatformAdminAssignment` and a current
  session with a successful TOTP verification from the prior 12 hours. The
  existing school membership and role-grant tables do not confer platform
  access.
- Platform-admin assignment, revocation, factor recovery, and break-glass are
  not API operations. They require a reviewed, out-of-band operator procedure.
- The TOTP factor secret is AES-256-GCM encrypted using
  `PLATFORM_MFA_ENCRYPTION_KEY`; the six-digit 30-second factor is rate-limited,
  audit-recorded, and each accepted time step is consumed once.
- Platform APIs expose school lifecycle/contact metadata, plan/subscription
  metadata, aggregate counts, and platform audit events only. They provide no
  access to student, guardian, staff, or financial records and no impersonation.
- New schools remain suspended until a separately approved owner-invitation and
  school permission workflow is available. No school membership or role grant
  is created by platform onboarding.
- Subscription entitlements are metadata and are not interpreted as
  authorization or usage enforcement. No prices, trials, payments, billing, or
  expiry rules are implemented.

## Identity and membership

- A global User is an identity, not a tenant grant.
- A SchoolMembership joins a User to exactly one School and has an explicit
  active/inactive lifecycle.
- Student, Guardian, and Staff profiles are school-scoped business records.
  They may optionally be associated with a User, but creating a profile does
  not automatically create login access.
- Every school request derives its effective tenant from the authenticated
  principal and an active membership. Any requested school ID is only a
  selector and must be checked on every request.
- Membership termination or suspension takes effect in authorization checks
  and session/token handling according to the approved revocation policy.

## Permission model

Use named server-defined permissions (action + resource), grouped into roles.
School role assignments belong to a membership and may have an approved
school-wide or branch-limited scope. Platform permissions are managed in a
separate control-plane policy and cannot be granted through school roles.

### Blueprint role catalogue

The following are blueprint roles, not currently seeded database records.
Descriptions reproduce the blueprint's responsibility/access intent; they are
not a complete permission matrix.

| Role | Scope | Blueprint responsibility/access intent |
| --- | --- | --- |
| Platform Super Admin | Platform control plane | Tenant onboarding, subscriptions, platform configuration, and support tools. |
| School Owner/Director | School | Strategic oversight and approvals; school-wide dashboards, finance, reports, staff, and settings. |
| Principal/Headteacher | School | Academic and operational leadership; students, teachers, academics, attendance, reports, and announcements. |
| Deputy/Academic Admin | School | Academic coordination; classes, subjects, timetable, assessments, and performance. |
| Bursar/Finance | School | Fee structures, payments, balances, receipts, and finance reports. |
| HR/Admin | School | Staff records and administration; staff, contracts, leave, attendance, and documents. |
| Teacher | School/branch/assignment scope to be defined | Teaching/class responsibilities; assigned classes, attendance, marks, assignments, and messages. |
| Parent/Guardian | Per authorized child | Children, fees, attendance, results, notices, and messages. Access is restricted by each student-guardian relationship. |
| Student | Per own identity/record | Own timetable, results, assignments, attendance, notices, and resources. |
| Librarian | School/branch scope to be defined | Books, borrowing, returns, and fines. |
| Transport Manager | School/branch scope to be defined | Transport routes, vehicles, drivers, and assignments. |
| Kitchen/Meal Manager | School/branch scope to be defined | Meal operations. |
| Accountant/Auditor | School | Financial review/reporting and controlled audit access. |

The blueprint does not resolve whether these are immutable system roles,
customizable school roles, or role templates, nor does it spell out individual
read/write/export/approval permissions. Do not seed roles or grant broad access
from this summary. Define a resource/action/scope matrix and delegation rules
with the owners before enabling school role administration. Platform Super
Admin remains a separate authority plane and cannot be granted through a
school membership or profile update.

Conventions:

- Deny by default; explicitly allow only when a policy grants the named action
  on the requested resource and scope.
- Check authorization in the application use case/service, not only in the
  router or frontend.
- Resolve role grants on the server. Never trust client role names, permission
  arrays, school IDs, branch IDs, or UI visibility.
- Apply the same checks to list, detail, export, mutation, background job, and
  indirect relationship paths. Avoid IDOR by scoping every lookup.
- Prevent privilege escalation: users cannot assign permissions or roles they
  are not authorized to administer; changes to role grants require a distinct
  permission and an audit event.
- Define conflict/deny precedence, custom-role capabilities, and branch
  inheritance explicitly before implementation.
- Use explicit scope types, for example `platform`, `school`, and
  `branch:{id}`; never let null or omitted scope accidentally widen access.

### Phase 03 configuration permission keys

The developer approved these backend permission keys for school configuration
operations. They are not role assignments and the Phase 03 migration must not
seed any role grants:

| Permission key | Operation |
| --- | --- |
| `school.profile.read` | Read the authorized school's profile. |
| `school.profile.update` | Update name and contact fields. |
| `academics.configuration.read` | Read/paginate school academic years, terms, classes, streams, subjects, and class-subject assignments. |
| `academics.configuration.manage` | Create, update, or terminally deactivate those academic configuration records. |

Each request still requires an authenticated active user and active
membership. School selectors are never authority. An active role grant must
contain the exact required permission or the server denies the request. No
Platform Super Admin bypass is added. Role assignment to these permission keys
is deliberately not part of this phase.

## Tenant context and enforcement

### Phase 04 admissions and people permissions

The developer approved these server-side permission keys for Phase 04. They
are definitions only: no migration seeds any grants to roles.

| Permission key | Operation |
| --- | --- |
| `admissions.application.read` | List and read applications, including the manual duplicate-review flag. |
| `admissions.application.create` | Create/edit drafts, submit, and withdraw an application before admission. |
| `admissions.application.review` | Move submitted applications into review, accept, or reject. |
| `admissions.application.admit` | Convert an accepted application into a Student and initial placement. |
| `students.profile.read` | List/read school students, profile history, guardian links, placement history, and status records. |
| `students.profile.update` | Correct a student profile; the prior profile is retained. |
| `students.profile.status` | Perform the one-way active-to-terminal student status transition. |
| `guardians.profile.read` | List/read guardians and guardian profile history. |
| `guardians.profile.manage` | Create or correct school guardian profiles; the prior profile is retained. |
| `students.guardian.manage` | Add a guardian relationship or change its relationship/access flag. |
| `students.placement.manage` | Reserved for the placement boundary; the Phase 04 API only creates initial placement as part of the separately authorized admission transaction. No standalone placement reassignment route is exposed. |

Role names, roles and grants are not created by Phase 04. In particular,
school-level administrators gain no platform capabilities, and Platform Super
Admin access is not a bypass for these school-level operations. Guardian
authorized access is a relationship attribute, not a login or portal grant.
Application, student, guardian, and nested relationship lookups apply an
explicit `school_id` predicate; database composite foreign keys also enforce
school equality for parent references.

### Phase 05 staff permissions

The developer approved these exact backend permission keys on 2026-10-19.
They are definitions only; the Phase 05 migration does not seed grants or
enable role administration.

| Permission key | Operation |
| --- | --- |
| `staff.profile.read` | List/read staff profiles and departments. |
| `staff.profile.manage` | Create/update/deactivate staff profiles and departments. |
| `staff.employment.read` | Read employment episodes. |
| `staff.employment.manage` | Start or end employment episodes. |
| `staff.assignment.read` | Read class/stream and subject assignment history. |
| `staff.assignment.manage` | Create or end class/stream and subject assignments. |

Staff position titles and profile links are not authorization grants. A
linked User must have a membership in the same school, but the profile-link
operation cannot create memberships, roles, or permissions. All staff,
employment, and assignment reads apply school predicates and same-school
database constraints. Permission definitions do not imply a grant to any
blueprint role; missing grants continue to deny access.

### Phase 06 attendance and timetable permissions

Developer A approved these server-side permission keys on 2026-10-19. The
Phase 06 migration defines no role grants.

| Permission key | Operation |
| --- | --- |
| `attendance.register.read` | Read school absence reasons, registers, records, and date-range summaries. |
| `attendance.register.manage` | Manage absence reasons, create registers/records, and finalize registers. |
| `attendance.register.correct` | Correct an attendance record, including one in a finalized register; each change is revisioned and audited. |
| `timetable.read` | Read school periods, rooms, availability, timetables, and lessons. |
| `timetable.manage` | Create periods, rooms, availability windows, timetables, and draft lessons; update draft lessons. |
| `timetable.publish` | Publish and unpublish a timetable. |

All operations still require an authenticated active membership in the
requested school. A Platform Super Admin has no automatic bypass or school
grant. Role assignment and branch-level scope remain separate approvals.

### Phase 07 assessment and result permissions

Developer A approved these permission definitions on 2026-10-19. They are
definitions only; the Phase 07 migration seeds no role grants.

| Permission key | Operation |
| --- | --- |
| `assessments.read` | Read school assessments, grading scales, marks/missing-mark status, academic summaries, and published report-card data. |
| `assessments.manage` | Create immutable grading scales, create/edit draft assessments, open an assessment, and deactivate eligible scales. |
| `results.enter` | Enter a mark into an eligible blank result while open or in moderation. The backend also requires the authenticated user to be linked to an active staff profile with an active assignment to the exact class-subject. |
| `results.correct` | Correct an entered mark while open/moderating, or explicitly reopen a finalized/published assessment for an audited correction cycle. |
| `results.moderate` | Submit an open assessment for moderation. |
| `results.finalize` | Finalize a moderated assessment only after all snapshotted eligible students have a mark. |
| `results.publish` | Publish finalized results only after the missing-mark check passes. |

The proposed actor split is academic administrators for setup, moderation,
and finalization; assigned teachers for their mark entry; and explicitly
authorized school administrators for publication. This is not an approved
role-to-permission grant matrix. Until roles/grants are configured, all these
operations deny access. Platform Super Admin receives no school-data bypass.
Guardian/student portal authorization and teacher read-scope restrictions
remain outside this implementation; report-card reads require an authorized
school membership with `assessments.read`.

### Phase 08 financial permissions

Developer A approved these definitions on 2026-10-19. They are separate
actions, not role grants; no permission grants are seeded. All require
authenticated active school membership and school-scoped access.

| Permission key | Operation |
| --- | --- |
| `finance.fees.read` | Read fee structures and items. |
| `finance.fees.manage` | Create and deactivate fee structures. |
| `finance.accounts.read` | Read student account balances and charge history. |
| `finance.charges.post` | Explicitly post a fee structure as an immutable student charge. |
| `finance.payments.read` | Read payment records and issued receipts. |
| `finance.payments.record` | Record an already verified manual payment; browser claims and provider callbacks are not verification. |
| `finance.payments.reconcile` | Record a manual reconciliation observation and read reconciliation exceptions. |
| `finance.adjustments.manage` | Record attributable debit/credit adjustments and allocation or charge reversals. |
| `finance.refunds.manage` | Record a refund only after independent verification. |
| `finance.reports.read` | Read school-scoped financial summaries and collection reports. |
| `finance.receipts.read` | Read receipt records for posted payments. |

These permission definitions do not grant themselves to roles. Role mappings
remain unconfigured and deny by default. No Platform Super Admin bypass or
guardian/student portal access is added.

### Phase 09 notification permission

The notification foundation defines one permission; the migration does not
seed role grants. All access requires an active authenticated user and active
school membership. No Platform Super Admin bypass or guardian/student profile
targeting is implemented.

| Permission key | Operation |
| --- | --- |
| `communication.notifications.read` | Read and mark read only the authenticated user's in-app notifications in the selected school. |

### Phase 10 report permissions

The Phase 10 permission definitions below do not seed role grants. Each report
request requires both the report permission and its existing source-domain
permission. This avoids using report-only access to bypass student, attendance,
academic, finance, or staff authorization. CSV exports additionally require
`reports.exports.generate`; export operations are audited. Dashboard data is
limited to the attendance, academics, and finance summaries whose source
permissions are all checked.

| Permission key | Operation |
| --- | --- |
| `reports.dashboard.read` | Read the composite school dashboard summary. |
| `reports.students.read` | Read the privacy-minimized student report. Also requires `students.profile.read`. |
| `reports.attendance.read` | Read date/status attendance aggregates. Also requires `attendance.register.read`. |
| `reports.academics.read` | Read academic assessment completeness summaries. Also requires `assessments.read`. |
| `reports.finance.read` | Read the finance summary. Also requires `finance.reports.read`. |
| `reports.staff.read` | Read the privacy-minimized staff report. Also requires `staff.profile.read`. |
| `reports.exports.generate` | Generate an immediate bounded CSV export, in addition to the report and source-domain permissions. |

No role grants are inferred. Platform-wide reports, student/guardian portal
access, and branch-specific report scopes are not implemented.

### Phase 11 Library permissions

Developer A approved these school-scoped permission definitions for Library v1
on 2026-10-19. They do not seed role grants; role-to-permission assignment
remains a separate approval. Every route still requires the authenticated
user's active membership in the selected school. There is no Platform Super
Admin bypass or borrower self-service access.

| Permission key | Operation |
| --- | --- |
| `library.catalog.read` | Read categories, catalog items, and copies. |
| `library.catalog.manage` | Create/edit/archive categories, items, and copies. |
| `library.loans.read` | Read school-wide loan records. |
| `library.loans.manage` | Check out, renew, and return copies. |
| `library.reservations.read` | Read school-wide reservations. |
| `library.reservations.manage` | Create and cancel reservations on behalf of borrowers. |
| `library.policy.manage` | Read and update the school-wide circulation policy. |
| `library.reports.read` | Read the bounded school-wide loan summary report. |

The blueprint's Librarian role is a responsibility summary, not an active
database role or grant. No permission is assigned to Librarian, school
administrators, or any other role by this increment. Until role grants are
separately approved, missing grants deny every Library operation.

Create a server-owned tenant context after authentication and membership
verification, conceptually containing actor identity, school membership,
school ID, authorized branch scope, and request ID. It must not be constructible
from unvalidated request data. Pass it explicitly to use cases and data-access
methods; avoid ambient mutable global tenant state.

Layered enforcement proposal:

1. Route policy identifies authentication and required permission.
2. Use case validates membership status and permission against the requested
   operation/resource.
3. Repository APIs require tenant context and include school predicates.
4. Composite database constraints prevent cross-school relationships.
5. PostgreSQL RLS may add defense in depth, subject to proven Neon/Prisma
   transaction-local context and least-privilege connection roles.

School/branch IDs supplied by a client must be treated as untrusted selectors.
The backend must compare them to the authenticated actor's grants and verify
that each record and relationship is in the same authorized school/branch.
Jobs and administrative paths must follow the same rule or use an explicitly
separate, audited system principal.

## Authentication and session design options

The approved baseline uses local password credentials hashed with Argon2id.
The exact Argon2id parameters must be explicit, documented, and calibrated for
the deployment runtime; never silently lower them. Account enrollment,
verification, MFA, and credential lifecycle remain pending blueprint/policy
review.

Approved browser session direction:

- Use opaque, high-entropy session tokens in `HttpOnly`, `Secure` cookies; set
  `SameSite` and cookie domain only after the deployment topology is approved.
- Persist only a cryptographic hash of the session token; store expiry,
  revocation/rotation state, user identity, and minimal security metadata.
- Rotate sessions after authentication and privilege-sensitive events; revoke
  promptly on logout, account compromise, and membership changes according to
  policy.
- Protect cookie-authenticated mutations with CSRF defenses and origin checks.
- Apply rate limits and non-enumerating credential failure responses.
- Never store bearer session secrets in browser local storage, logs, or audit
  metadata.

Cross-origin deployment, cookie domain, MFA, idle/absolute expiry,
concurrent-device policy, and recovery delivery require further approval.
Password reset tokens must be single-use, expiring, and stored only as hashes;
delivery must use an approved adapter and must not expose tokens in logs or API
responses. Until a delivery provider is selected, live recovery delivery
cannot be considered complete.

## Implemented foundation boundary

The initial API implements login/logout, current identity, password-reset
completion behind a delivery adapter boundary, active school membership
context, and a distinct Platform Super Admin guard. It does not implement user
enrollment/invitation, account activation/deactivation administration, role
management endpoints, school business resources, or the blueprint-derived
school role catalogue. No school roles or permission grants are seeded.
Ordinary school operations cannot create or modify
`PlatformAdminAssignment`; the first assignment must be established through a
separately controlled database/bootstrap process pending an approved ceremony.

School data access currently has an application-level membership predicate,
and the schema encodes same-school foreign-key relationships for role grants.
RLS is not enabled. Validate these constraints and the rate-limit SQL against
disposable PostgreSQL integration tests before production use.

## Auditing

Audit platform and school authority separately. Record actor/principal,
effective membership/scope, action, target, outcome, timestamp, and request
correlation ID; redact secrets and unnecessary personal/financial data.
Sensitive role changes, membership changes, financial mutations, and other
approved sensitive operations must write an audit event atomically with the
state mutation where possible. Audit access and export should themselves be
permission-checked and audited.

Coverage, retention, immutability controls, and whether sensitive reads are
logged require product/security review.
