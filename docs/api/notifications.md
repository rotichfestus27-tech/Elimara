# Communication and notifications

**Phase 09 contract proposal — review with the frontend owner before treating
the response DTOs as a shared contract.**

## Approved implementation boundary

- In-app notifications are the only active delivery channel.
- Email and SMS are represented by provider interfaces but have no active
  adapters. WhatsApp and push notifications are not implemented.
- There are no production templates and no automatic business-event triggers.
  An empty template registry is created at startup, so enqueueing is currently
  unavailable until a template and its workflow are approved and registered.
- Recipients must be active users with an active membership in the target
  school. Guardian/student profile targeting is deferred until identity links
  and the related access policies are approved.
- A worker in the API process polls PostgreSQL. It claims work with row locks
  and `SKIP LOCKED`; external delivery never blocks the originating business
  transaction.
- No provider credentials or external provider connections are configured.
  Permission grants are not seeded.

## Inbox endpoints

All endpoints use `/api/v1`, an authenticated HttpOnly session cookie, and the
server's active school membership context. The `schoolId` path segment is a
selector; it does not prove access.

| Method and path | Permission | Behavior |
| --- | --- | --- |
| `GET /schools/{schoolId}/notifications?limit=25&offset=0` | `communication.notifications.read` | Lists only the authenticated user's in-app notifications for that school. `limit` is 1–100; `offset` is 0–1,000,000. |
| `POST /schools/{schoolId}/notifications/{notificationId}/read` | `communication.notifications.read` | Marks a delivered, recipient-owned in-app notification read. Requires the CSRF header. Repeating the operation is safe. |

The API returns `401` for anonymous requests, `403` when the active
membership lacks the permission, and `404` for an inaccessible school or a
notification that does not belong to the authenticated recipient. The read
endpoint returns `204` on success.

The list response is:

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Register updated",
      "body": "The attendance register was updated.",
      "status": "DELIVERED",
      "createdAt": "2026-10-19T12:00:00.000Z",
      "sentAt": null,
      "deliveredAt": "2026-10-19T12:00:01.000Z",
      "readAt": null
    }
  ],
  "meta": { "limit": 25, "offset": 0, "total": 1 }
}
```

Errors use the established API error envelope. The notification response
exposes only inbox fields; recipient/school IDs, event keys, attempt counts,
provider message IDs, failure codes, request fingerprints, queue leases, and
exception details are excluded. The API contract remains a proposal until
joint frontend review; no `packages/shared` contract has been modified.

## Queue, retries, and privacy

The event key is unique for `(school, recipient, channel)`. Matching replays
return the original record; reuse with different rendered content returns
`409 IDEMPOTENCY_CONFLICT`. The database also ties the recipient to a
school-membership composite foreign key and enqueue verifies active user,
membership, and school status.

The worker has a bounded batch size and lease, retries transient provider
errors with delays of 1, 5, 30, and 300 seconds, and stops after at most five
attempts. Permanent failures are not retried. Failure codes are safe
identifiers only; exception text, message contents, and provider secrets are
not logged. Stale workers cannot overwrite a newer delivery attempt.

Templates must validate input with Zod and render bounded non-empty titles
(maximum 120 characters) and bodies (maximum 4,000 characters). No
student-specific content, consent policy, retention period, or notification
template is approved. Do not include sensitive personal information until
those policies are reviewed.

See [`notifications.openapi.yaml`](notifications.openapi.yaml) for the
machine-readable contract proposal.
