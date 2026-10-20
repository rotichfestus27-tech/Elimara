# Library API — Phase 11

**Status: Implemented backend proposal; pending joint frontend/backend contract
review.** The backend implements only the approved Library v1 scope. The
machine-readable draft is [`library.openapi.yaml`](./library.openapi.yaml).
No `packages/shared` or `apps/web` contract was changed.

## Scope and dependencies

- School-wide catalog of categories, book titles, and physical copies. Branch
  support, barcodes/RFID, and non-book resource types are not included.
- Checkout, renewal, return, FIFO title reservations, and a school-wide
  circulation policy.
- Existing active Student and Staff records are borrowers. Guardian records
  are not borrowers, and this module creates no people or authentication
  records.
- A policy must be configured before checkout, reservation, or renewal. No
  sample loan period, loan cap, renewal count, or reservation hold is seeded.
- Fine assessment, waiver, payment, Finance-ledger integration, and borrower
  self-service are deferred.
- All API operations use `/api/v1/schools/{schoolId}/library`. School IDs are
  selectors only; the backend verifies active membership and permission on
  every request. Database composite foreign keys enforce same-school links.

## Permissions

Permission definitions do not seed role grants. The authorization model does
not yet map the blueprint's Librarian role to permissions, so these routes
deny access until role grants are separately approved.

| Permission | Operations |
| --- | --- |
| `library.catalog.read` | List/read categories, titles, and copies. |
| `library.catalog.manage` | Create, update, and archive categories, titles, and copies. |
| `library.loans.read` | List loan history. |
| `library.loans.manage` | Check out, renew, and return copies. |
| `library.reservations.read` | List reservations. |
| `library.reservations.manage` | Create/cancel reservations on behalf of borrowers. |
| `library.policy.manage` | Read/update circulation policy. |
| `library.reports.read` | Read the loan summary. |

Every write also requires the configured CSRF cookie/header pair. The default
session cookie name is `elimara_session`; deployments may configure cookie
names and attributes.

## Workflows and integrity rules

1. Create a category, catalog title, and one or more physical copies. A copy's
   UUID is its internal identifier.
2. Configure a school-wide policy before circulation. Policy updates affect
   future checkouts, renewals, and ready holds; existing due dates are not
   rewritten.
3. An authorized operator checks out an active copy to exactly one active
   same-school Student or Staff profile. The service enforces the active-loan
   cap and computes a date-only UTC due date from the configured loan period.
4. Renewal extends the existing due date by one configured loan period. The
   configured maximum renewal count is enforced.
5. Reservations are FIFO per title; a borrower may have only one active
   reservation per title. Available copies are assigned to the oldest queued
   reservations. A copy in `READY` state can be checked out only to its
   reservation's borrower.
6. A ready reservation expires after the configured hold duration. Expired
   holds are reconciled and copies promoted to the next queued reservation
   during the next circulation mutation; there is no background worker in v1.
   Reservation list responses include `expired` and `effectiveStatus`, derived
   fields for a ready hold whose expiry time has passed but has not yet been
   reconciled. `status` remains the persisted lifecycle value until mutation.
7. Returns, renewals, reservation transitions, and archive checks run
   transactionally with audit events. Catalog records cannot be hard-deleted.
   A title or copy may be archived only when the title has no active loan or
   reservation. Archiving a title archives its active copies in the same
   transaction.

The database serializes Library writes on the school row, and partial unique
indexes prevent multiple active loans of one copy, duplicate active
borrower/title reservations, and multiple ready reservations for one copy.
All list endpoints use bounded offset pagination (`limit` 1–100, default 25;
`offset` default 0).

## Endpoints

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /categories` | `library.catalog.read` | List categories; optionally include archived rows. |
| `POST /categories` | `library.catalog.manage` | Create a category. |
| `POST /categories/{categoryId}/archive` | `library.catalog.manage` | Archive a category without deleting its history. |
| `GET /catalog/items` | `library.catalog.read` | Search/list titles by category and title text. |
| `POST /catalog/items` | `library.catalog.manage` | Create a title. |
| `GET /catalog/items/{itemId}` | `library.catalog.read` | Read a title. |
| `PATCH /catalog/items/{itemId}` | `library.catalog.manage` | Update active title metadata. |
| `POST /catalog/items/{itemId}/archive` | `library.catalog.manage` | Archive a title and its copies when circulation is clear. |
| `GET /catalog/items/{itemId}/copies` | `library.catalog.read` | List copies. |
| `POST /catalog/items/{itemId}/copies` | `library.catalog.manage` | Create a physical copy. |
| `POST /catalog/items/{itemId}/copies/{copyId}/archive` | `library.catalog.manage` | Archive a copy when the title has no active circulation. |
| `GET /policy` | `library.policy.manage` | Read the configured policy, or `data: null` before setup. |
| `PUT /policy` | `library.policy.manage` | Set the required school-wide circulation limits. |
| `GET /loans` | `library.loans.read` | Paginated loan history with optional borrower/item/status filters. |
| `POST /loans` | `library.loans.manage` | Check out a copy. |
| `POST /loans/{loanId}/renew` | `library.loans.manage` | Renew an active loan. |
| `POST /loans/{loanId}/return` | `library.loans.manage` | Return an active loan. |
| `GET /reservations` | `library.reservations.read` | List reservation history with optional filters. |
| `POST /reservations` | `library.reservations.manage` | Create a reservation for a Student or Staff borrower. |
| `POST /reservations/{reservationId}/cancel` | `library.reservations.manage` | Cancel a queued or ready reservation. |
| `GET /reports/loans?from=YYYY-MM-DD&to=YYYY-MM-DD` | `library.reports.read` | Summarize checkouts in an inclusive date range (maximum 366 days). |

## Request/response examples

Configure circulation (the API requires JSON integer values; the policy is
school-wide):

```json
{
  "loanPeriodDays": 14,
  "maxActiveLoans": 3,
  "maxRenewals": 1,
  "reservationHoldDays": 2
}
```

Create a checkout for an existing student:

```json
{
  "copyId": "0af2b9c8-3f62-4c9e-90c4-dc93b155e10e",
  "studentId": "5b12449b-3d66-4fe8-b18a-a4f634bdebd0"
}
```

Every borrower request must contain exactly one of `studentId` or `staffId`.
Loan responses expose borrower IDs, not personal profile fields.

Success responses use `{ "data": ... }`. Paginated responses add
`meta: { "limit", "offset", "total" }`. Errors use the standard Elimara error
envelope. Relevant stable error codes include `POLICY_NOT_CONFIGURED`,
`INVALID_RELATIONSHIP`, `COPY_UNAVAILABLE`, `COPY_RESERVED`,
`MAX_ACTIVE_LOANS`, `RENEWAL_LIMIT_REACHED`, `DUPLICATE`,
`ITEM_HAS_ACTIVE_CIRCULATION`, and `SCHOOL_NOT_FOUND`.

The loan report counts loans checked out in the requested date range. `active`
and `returned` reflect current loan state; `overdue` means an active loan's
due date is before the current UTC date at report time. It is not a historical
overdue snapshot.

## Migration and remaining review

The forward migration
[`20261025130000_library_operations`](../../packages/database/prisma/migrations/20261025130000_library_operations/migration.sql)
creates the six Library tables, one reservation enum, same-school foreign
keys, history-preserving indexes, and checks for borrower/policy invariants.
It is authored but unapplied. Review the SQL and run integration/concurrency
tests only against an explicitly designated disposable, non-production
PostgreSQL database.

The OpenAPI DTOs remain a proposal until Developer B reviews the frontend
contract. Role grants, school timezone, barcode/RFID, fines/Finance integration,
scheduled reservation expiry, and branch support remain outside this
increment.
