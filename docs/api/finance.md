# Fees and Finance API

**Phase 08 API proposal.** The business rules below reflect the policies
approved on 2026-10-19. Review the DTOs with the frontend developer before
treating them as a shared contract. The matching OpenAPI document is
[`finance.openapi.yaml`](finance.openapi.yaml). `apps/web` and
`packages/shared` are unchanged.

All paths are under `/api/v1`. Mutations require the existing session cookie
and `X-CSRF-Token`. Retryable financial mutations also require a printable
ASCII `Idempotency-Key` of 1–128 characters. Reusing a key with the same
request replays the original result; reusing it with different request data
returns `409 IDEMPOTENCY_CONFLICT`. Keys are scoped to their operation and
student/account/payment record as applicable.

The school ID in the path is only a selector. The authenticated active
membership is checked for that school, and every persistence lookup includes
the school ID. Composite database foreign keys prevent cross-school
relationships. Permission definitions are not role grants; all ungranted
operations are denied.

## Permissions

| Permission | Operations |
| --- | --- |
| `finance.fees.read` | List fee structures. |
| `finance.fees.manage` | Create and deactivate fee structures. |
| `finance.accounts.read` | Read account summaries, charges, and accounts. |
| `finance.charges.post` | Post an active fee structure as a student charge. |
| `finance.payments.read` | List payments. |
| `finance.payments.record` | Record an already verified manual payment and issue its receipt. |
| `finance.payments.reconcile` | Record reconciliation observations and list exceptions. |
| `finance.adjustments.manage` | Allocate payments, reverse allocations/charges, and record debit/credit adjustments. |
| `finance.refunds.manage` | Record an already verified refund. |
| `finance.reports.read` | Read the school summary report. |
| `finance.receipts.read` | Read a payment receipt. |

## Routes

| Method and path | Permission | Behavior |
| --- | --- | --- |
| `GET /schools/{schoolId}/finance/fee-structures?limit=25&offset=0` | `finance.fees.read` | List fee structures, including inactive historical structures. |
| `POST /schools/{schoolId}/finance/fee-structures` | `finance.fees.manage` | Create an active year/term/class structure and its items. |
| `POST /schools/{schoolId}/finance/fee-structures/{feeStructureId}/deactivate` | `finance.fees.manage` | Deactivate without deleting historical charges. |
| `GET /schools/{schoolId}/finance/accounts?limit=25&offset=0` | `finance.accounts.read` | List accounts that have had a charge or payment. |
| `GET /schools/{schoolId}/students/{studentId}/finance/account` | `finance.accounts.read` | Read derived account balance. |
| `GET /schools/{schoolId}/students/{studentId}/finance/charges?limit=25&offset=0` | `finance.accounts.read` | List immutable posted charges and their current outstanding amounts. |
| `POST /schools/{schoolId}/students/{studentId}/finance/charges` | `finance.charges.post` | Post a fee structure for the student's active placement. Body: `{ "feeStructureId": "uuid" }`. |
| `GET /schools/{schoolId}/students/{studentId}/finance/payments?limit=25&offset=0` | `finance.payments.read` | List payments, refunds, allocations, and unapplied amount. |
| `POST /schools/{schoolId}/students/{studentId}/finance/payments` | `finance.payments.record` | Record verified manual payment and create a receipt atomically. |
| `POST /schools/{schoolId}/finance/payments/{paymentId}/allocations` | `finance.adjustments.manage` | Allocate some or all unapplied payment amount to a same-account charge. |
| `POST /schools/{schoolId}/finance/allocations/{allocationId}/reverse` | `finance.adjustments.manage` | Append a reasoned partial or full allocation reversal. |
| `POST /schools/{schoolId}/finance/charges/{chargeId}/reverse` | `finance.adjustments.manage` | Append a full charge reversal after all net allocations have been reversed. |
| `POST /schools/{schoolId}/students/{studentId}/finance/adjustments` | `finance.adjustments.manage` | Record an attributable debit or credit adjustment. |
| `POST /schools/{schoolId}/finance/payments/{paymentId}/refunds` | `finance.refunds.manage` | Record a verified refund no greater than the unapplied payment amount. |
| `POST /schools/{schoolId}/finance/payments/{paymentId}/reconciliation` | `finance.payments.reconcile` | Record the observed statement amount/reference; mismatch remains an exception. |
| `GET /schools/{schoolId}/finance/reconciliation/exceptions?limit=25&offset=0` | `finance.payments.reconcile` | List exception observations, including those later superseded by a matching observation. |
| `GET /schools/{schoolId}/finance/receipts/{receiptId}` | `finance.receipts.read` | Read the stable receipt ID and payment record. |
| `GET /schools/{schoolId}/finance/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | `finance.reports.read` | Return period collections/counts plus current outstanding/unapplied balances and period reconciliation exceptions. Date bounds are inclusive UTC dates; maximum period is 367 calendar days. |

Payment body:

```json
{
  "amount": "2500.00",
  "method": "CASH",
  "reference": "optional staff-verified reference"
}
```

Amounts are non-negative decimal strings with at most two fractional digits;
transaction amounts must be greater than zero. Currency is KES for this
approved subset. Values use `DECIMAL(14,2)` in PostgreSQL and exact integer
minor-unit calculations in business rules. No binary floating-point math is
used.

Successful responses use `{ "data": ... }`. Lists use `data` and
`meta: { "limit": 25, "offset": 0, "total": 0 }`.

Account summaries return exact string amounts. For example:

```json
{
  "data": {
    "accountId": "b7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
    "studentId": "c7c03023-6909-4ca9-81d7-b7e9e66b4ca5",
    "admissionNumber": "2026/001",
    "studentGivenName": "Amina",
    "studentFamilyName": "Otieno",
    "totalCharges": "2500.00",
    "totalChargeReversals": "0.00",
    "totalPayments": "1000.00",
    "totalRefunds": "0.00",
    "totalDebits": "0.00",
    "totalCredits": "0.00",
    "totalAllocated": "750.00",
    "totalAllocationReversals": "0.00",
    "outstandingCharges": "1750.00",
    "unappliedCredit": "250.00",
    "balanceDue": "1500.00",
    "netBalance": "1500.00",
    "createdAt": "2026-10-19T12:00:00.000Z"
  }
}
```

Payment responses contain `id`, `studentId`, `amount`, `method`, nullable
`reference`, `receivedAt`, stable `receiptId`, `allocatedAmount`,
`allocationReversedAmount`, `refundedAmount`, and `unappliedAmount`.
Charge responses contain `id`, `studentId`, `feeStructureId`, `structureName`,
`totalAmount`, `allocatedAmount`, `allocationReversedAmount`,
`outstandingAmount`, `reversed`, `createdAt`, and snapshotted `items`.
Amounts are decimal strings; IDs are UUIDs; timestamps are ISO 8601 strings.

Errors follow:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "requestId": "request-id",
    "issues": [{ "path": "amount", "code": "invalid_format", "message": "..." }]
  }
}
```

Expected statuses include `400` for invalid request/business relationships,
`401` for anonymous requests, `403` for missing permission, `404` for
out-of-scope or missing records, and `409` for duplicate references,
insufficient amounts, conflicts, and incompatible reversals.

## Ledger and lifecycle behavior

- Fee structures are not charges until a staff member explicitly posts one.
  Posting snapshots item names and amounts. Structures require an active
  school/year/term/class relationship; posting additionally requires the
  student's active placement in the structure's class/year.
- Accounts are created on first charge/payment. Account balances are derived
  from source records. Positive net is due; negative net is credit.
- Payments in this release are manual-only and may be recorded only after
  staff independently verifies receipt. A payment and UUID receipt are
  created in one serializable transaction. No provider callback is treated as
  proof of payment.
- Partial payment allocation is staff-selected. Excess stays as unapplied
  credit. Refunds cannot exceed payment funds currently unapplied; first
  reverse allocations when necessary.
- Charges, payments, allocations, adjustments, refunds, and reconciliation
  observations are retained. Corrections are appended as reversal/adjustment
  records with a reason and actor audit event, not edits/deletes.
- Charge reversal is full only and is blocked until the net amount allocated
  to the charge is zero.
- Reconciliation records the observation rather than mutating a payment.
  Mismatches are retained as exceptions; this endpoint does not match bank
  files or call a provider.
- Reports use inclusive UTC date filters for payment receipt, charge posting,
  and reconciliation observation activity. Outstanding charge and unapplied
  credit totals are current as of report execution, not historical
  end-of-period balances.

## Deferred

No provider integration, tuition defaults, penalties, discounts/waivers,
financial-period close, formal approval thresholds, receipt-number sequence,
statement-file matching, currency expansion, statutory accounting rules,
guardian/student finance portal, or role grants are implemented. The migration
is unapplied and database-backed concurrency tests require a reviewed,
disposable non-production PostgreSQL database.
