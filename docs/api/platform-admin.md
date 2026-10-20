# Platform administration and SaaS metadata API

**Status:** Backend implementation proposal for Phase 12. The API contract
requires frontend-owner review before adoption in `packages/shared`. The
forward migration is authored but unapplied.

## Security boundary

All routes require the opaque session cookie, an active `PlatformAdminAssignment`,
and a TOTP verification on the current session within the preceding 12 hours.
Platform authority is not a school role and cannot be granted by an API,
membership, profile update, or client-supplied role. Assignments and recovery
are out-of-band operator procedures.

Mutations require the CSRF cookie/header pair. The first TOTP enrollment
requires the current password, returns the authenticator secret once with
`Cache-Control: no-store`, and expires its pending enrollment after 15 minutes.
TOTP uses six digits, a 30-second period, an adjacent-step clock tolerance,
and one-time step consumption. Factor secrets are AES-256-GCM encrypted in the
database using `PLATFORM_MFA_ENCRYPTION_KEY`, a 32-byte hexadecimal key. Never
log or commit this key or an enrollment secret. Losing/rotating the key
requires the out-of-band recovery/re-enrollment procedure and revocation of
existing sessions.

Platform reports expose school, plan, and subscription metadata and aggregate
counts only. There is no tenant impersonation, student/guardian/staff data
access, financial-record access, or export endpoint.

## Routes

All routes use `/api/v1`.

| Method and path | Required state | Purpose |
| --- | --- | --- |
| `GET /platform/mfa/status` | Authenticated session, active platform assignment | Return whether TOTP is enrolled and whether the current session is stepped up. |
| `POST /platform/mfa/enrollment` | Authenticated session, active platform assignment, CSRF, current password | Begin first TOTP enrollment; secret is returned once. |
| `POST /platform/mfa/enrollment/confirm` | Authenticated session, active platform assignment, CSRF | Confirm enrollment and step up the current session. |
| `POST /platform/mfa/verify` | Authenticated session, active platform assignment, CSRF | Step up a session using the enrolled factor. |
| `GET /platform/summary` | Platform admin + recent MFA | Counts of schools by status, active plans, and current subscription assignments. |
| `GET, POST /platform/schools` | Platform admin + recent MFA; CSRF for POST | List or create a school tenant record. New schools are created `SUSPENDED`. |
| `GET /platform/schools/{schoolId}` | Platform admin + recent MFA | Read school metadata. |
| `PATCH /platform/schools/{schoolId}` | Platform admin + recent MFA; CSRF | Update school name and contact metadata; nullable contact fields may be cleared. |
| `PATCH /platform/schools/{schoolId}/status` | Platform admin + recent MFA; CSRF | Activate, suspend, or close a school. |
| `GET, POST /platform/plans` | Platform admin + recent MFA; CSRF for POST | List or create metadata-only plans. |
| `GET, PATCH /platform/plans/{id}` | Platform admin + recent MFA; CSRF for PATCH | Read or update plan metadata; deactivate with `active: false`. |
| `GET /platform/schools/{schoolId}/subscriptions` | Platform admin + recent MFA | List assignment history. |
| `PUT /platform/schools/{schoolId}/subscription` | Platform admin + recent MFA; CSRF | Assign an active plan; repeat assignment to the current plan is idempotent. |
| `POST /platform/schools/{schoolId}/subscription/end` | Platform admin + recent MFA; CSRF | End the current metadata assignment; repeated end is idempotent. |
| `GET /platform/audit-events` | Platform admin + recent MFA | Paginated platform-only audit events. |

All list queries use `limit` (default 25, range 1–100) and `offset` (default
0, maximum 1,000,000). School lists optionally filter by `status` and `search`;
plan lists optionally filter by `active` and `search`.

## School lifecycle and suspension

The allowed status transitions are:

- `ACTIVE -> SUSPENDED` or `CLOSED`
- `SUSPENDED -> ACTIVE` or `CLOSED`
- `CLOSED -> ACTIVE`

Repeating the current status is a no-op. All other transitions return
`409 INVALID_TRANSITION`. State updates lock the school row and append an audit
event transactionally. No school, membership, or tenant-owned record is
deleted.

School metadata updates are audited transactionally using changed field names
only; submitted contact values are not copied into audit metadata. An empty
update request is rejected.

Onboarding creates only a school tenant record, initially `SUSPENDED`. It does
not create a user, invite a school owner, activate an account, or grant a
school role. Those actions remain deferred until the account invitation and
school permission matrix are jointly approved.

Suspension/closure blocks new school-scoped API requests through existing
server-side school-status checks. Existing global user sessions remain usable
for other active schools; no session or membership is deleted. The in-process
notification worker stops claiming queued/retrying notifications for inactive
schools. In-flight provider calls may finish; queued notifications are retained
and become eligible again after reactivation. This phase adds no other
school-scoped scheduler.

## Plan and subscription metadata

Plans contain a unique code, name, optional description, active flag, and up to
100 named entitlement metadata entries. Each value is a string, boolean, or
non-negative number. No entitlements are seeded or interpreted by runtime
authorization or usage checks.

Each school has at most one current plan assignment. Assigning a different
plan atomically closes the prior assignment and creates a new history record.
The record snapshots plan code, name, and entitlements at assignment time, so
later catalog edits do not rewrite history. Deactivating a plan prevents new
assignments but does not change existing assignment records or school access.

This API does not model prices, currencies, billing intervals, trials,
invoices, payments, payment providers, grace periods, subscription expiry, or
entitlement enforcement. Ending an assignment changes metadata only; it does
not suspend a school or claim that payment is due or has failed.

## Audit

Platform writes and TOTP enrollment/verification successes are coupled to
`SecurityAuditEvent` writes in the same database transaction as the mutation.
MFA failures are recorded without the submitted code, password, factor secret,
or other request payload. Audit metadata contains identifiers, status
transitions, and changed field names only. `GET /platform/audit-events`
returns only `PLATFORM_` events with no school foreign-key scope and does not
include school student or financial records.

For local development, generate a fresh 32-byte key with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
and store it only in the developer's ignored local environment file. The
placeholder in `.env.example` is intentionally invalid and must be replaced.

## Example responses

Create school:

```json
{
  "data": {
    "id": "c465a4e4-64ab-4db2-9d9e-b6d63045a0fe",
    "name": "Example School",
    "contactEmail": null,
    "contactPhone": null,
    "status": "SUSPENDED",
    "createdAt": "2026-10-20T00:00:00.000Z",
    "updatedAt": "2026-10-20T00:00:00.000Z"
  }
}
```

Platform summary:

```json
{
  "data": {
    "schools": { "ACTIVE": 2, "SUSPENDED": 1, "CLOSED": 0 },
    "activePlans": 0,
    "activeSubscriptions": 0
  }
}
```

Common errors use the existing API envelope. Relevant codes include
`UNAUTHENTICATED`, `FORBIDDEN`, `PLATFORM_MFA_REQUIRED`,
`INVALID_MFA_CODE`, `TOO_MANY_ATTEMPTS`, `SCHOOL_NOT_FOUND`,
`PLAN_NOT_FOUND`, `CONFLICT`, and `INVALID_TRANSITION`.

## Administrative security review

| Threat | Implemented control | Remaining risk |
| --- | --- | --- |
| School administrator elevates to platform authority | Platform assignment is separate from school memberships/roles; no public grant or role-update route exists. | Out-of-band provisioning/revocation must be tightly controlled and independently reviewed. |
| Password-only compromise | Every platform operation requires recent session-bound TOTP; enrollment rechecks the current password; MFA attempts are rate-limited and audited. | TOTP is phishing-resistant only to a limited degree; WebAuthn/passkeys were not selected. |
| Factor-secret database exposure | AES-256-GCM encrypted TOTP secrets, key supplied out of band, secret omitted from audit/logging, one-time secret response and replay-step prevention. | Compromise of both database and encryption key exposes factors. Key rotation/recovery must revoke sessions and re-enroll. |
| Cross-tenant data exposure via platform endpoints | Platform routes return lifecycle/plan/subscription metadata and aggregate counts only; no student/financial queries, impersonation, or downloads exist. | School contact fields are visible to platform admins as onboarding metadata. |
| Unauthorized/inconsistent lifecycle changes | Server-side platform + MFA gate, validated transitions, school-row lock, transactionally coupled audit, no destructive cascade. | PostgreSQL concurrency and constraint behavior still needs verification against a disposable non-production database. |
| Suspension leaves background work active | Queue claiming excludes suspended/closed schools; existing data is retained and work resumes on activation. | Already claimed provider calls cannot be recalled; there is no worker pause protocol for future schedulers yet. |
| Subscription state implies unapproved billing behavior | Catalog and assignment history are metadata only and do not enforce access or report payment state. | Pricing, billing, expiry, trials, and enforcement remain undefined and intentionally unimplemented. |

The migration must be reviewed before use. No PostgreSQL integration database
or production service was accessed for this implementation.
