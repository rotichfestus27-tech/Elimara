# Authentication and access API

**Status: Backend foundation contract.** These endpoints are implemented in
`apps/api`. The supplied product blueprint has been reviewed; the frontend
developer has not reviewed these wire contracts. Blueprint role summaries do
not define the action-level permission matrix. Coordinate frontend integration
and shared type generation before changing `packages/shared`.

All routes use `/api/v1`. JSON request bodies are validated with Zod.
Authentication failures do not return credentials, session tokens, password
hashes, or details that distinguish an unknown account from an incorrect
password.

## Cookies and sessions

- Successful login sets `elimara_session` by default as an opaque,
  cryptographically random cookie. It is `HttpOnly`, `Secure` in production,
  `SameSite=Lax` by default, and scoped to `/`. Cookie name, SameSite mode,
  domain, and session lifetime are configurable; agree on the production
  frontend/API topology before changing these settings.
- The server stores only a SHA-256 hash of the 256-bit session secret.
- A separate `elimara_csrf` cookie holds the CSRF token. For authenticated
  state-changing requests, the client must send the same value in
  `X-CSRF-Token`. The server verifies it against the token hash stored with the
  session. The session cookie is never exposed to frontend JavaScript. The web
  client reads `elimara_csrf` by default; if `CSRF_COOKIE_NAME` is customized,
  set the same value in `VITE_CSRF_COOKIE_NAME` when building the frontend.
- Sessions expire absolutely after 12 hours by default (configurable from 1 to
  168 hours), and are rejected after revocation or when the account is not
  active. Logout and password reset revoke sessions.
- No JWT or browser localStorage bearer token is used.

## Endpoints

| Method and path | Authentication | Permission / scope | Purpose |
| --- | --- | --- | --- |
| `POST /api/v1/auth/login` | Public | Rate-limited by normalized account and client address; JSON only; browser `Origin` must be in `CORS_ORIGINS` | Validate credentials and create a session. |
| `POST /api/v1/auth/logout` | Session cookie + CSRF | Current session only | Revoke the caller's session and clear both cookies. |
| `GET /api/v1/auth/me` | Session cookie | Authenticated user | Return the minimal current identity. |
| `GET /api/v1/auth/schools` | Session cookie | Authenticated user | List only the user's active school memberships and currently granted permissions, for workspace selection. |
| `POST /api/v1/auth/password-reset/request` | Public | Rate-limited when a recovery adapter is configured | Request recovery without revealing whether an account exists. Returns `503` until delivery is configured. |
| `POST /api/v1/auth/password-reset/complete` | Public, single-use reset token | Valid, unexpired token | Change password, consume the token, revoke sessions, clear cookies. |
| `GET /api/v1/schools/{schoolId}/access` | Session cookie | Active membership in the selected school | Return minimal context only for an active school membership. `schoolId` is an untrusted selector. |
| `GET /api/v1/platform/access` | Session cookie | Active Platform Super Admin assignment | Verify the separate platform control-plane boundary. |

No public user enrollment, account activation, account status management, role
administration, school-management, or platform-admin assignment endpoint is
implemented. No default school roles or permissions are seeded. The exact
school role catalogue and protected business operations require the blueprint
and developer/frontend agreement.

## Request schemas

### Login

`POST /api/v1/auth/login`

```json
{
  "email": "admin@example.test",
  "password": "user-provided password"
}
```

`email` must be a valid email address of at most 320 characters. `password`
must be a non-empty string of at most 1024 characters. The current local
password policy requires 12–1024 characters when setting/resetting a password.
Passwords are hashed with Argon2id (`m=19456`, `t=2`, `p=1`). Account creation
and password-setting workflows await the approved enrollment policy.

Login accepts `application/json` only. If a request includes `Origin`, its
value must exactly match a configured `CORS_ORIGINS` entry; a cross-site
`Sec-Fetch-Site` request without `Origin` is rejected. Configure the browser
frontend origin in `CORS_ORIGINS`. Origin-less JSON requests remain supported
for non-browser clients.

### Password reset request

`POST /api/v1/auth/password-reset/request`

```json
{
  "email": "admin@example.test"
}
```

If a recovery delivery adapter is configured, the response does not disclose
account existence:

```json
{
  "data": {
    "message": "If the account is eligible, recovery instructions will be sent."
  }
}
```

Until an approved delivery adapter is configured, the route returns
`503 RECOVERY_UNAVAILABLE` for all requests.

### Password reset completion

`POST /api/v1/auth/password-reset/complete`

```json
{
  "token": "single-use token delivered out-of-band",
  "newPassword": "a new password of at least 12 characters"
}
```

The raw token is delivered only through the approved out-of-band adapter; only
its SHA-256 hash is stored. Tokens expire after 30 minutes, are single-use,
invalidate other outstanding reset tokens after success, and revoke all user
sessions.

## Responses

Successful identity payload:

```json
{
  "data": {
    "user": {
      "id": "opaque-user-id",
      "email": "admin@example.test"
    }
  }
}
```

Logout and successful reset completion return `204 No Content`. Successful
school context returns:

```json
{
  "data": {
    "school": {
      "id": "school-id",
      "name": "School name"
    }
  }
}
```

Platform context returns `{ "data": { "access": "platform" } }`; it contains no
school data.

`GET /api/v1/auth/schools` returns `{ "data": [{ "id", "name", "permissions"
}] }`. Memberships and active school status are resolved server-side. A
selected school ID remains an untrusted selector and every school API request
revalidates membership and required permissions.

## Errors

Errors use the API's standard format:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required.",
    "requestId": "request-correlation-id"
  }
}
```

Relevant codes/statuses: `400 VALIDATION_FAILED`, `400 INVALID_PASSWORD`,
`400 INVALID_RESET_TOKEN`, `401 INVALID_CREDENTIALS`, `401 UNAUTHENTICATED`,
`403 CSRF_VALIDATION_FAILED`, `403 FORBIDDEN`, `403 ORIGIN_NOT_ALLOWED`,
`404 SCHOOL_NOT_FOUND`, `415 UNSUPPORTED_MEDIA_TYPE`,
`429 TOO_MANY_ATTEMPTS`, and `503 RECOVERY_UNAVAILABLE`. Internal errors do
not include stack traces, SQL, credentials, reset tokens, or provider details.

## Authorization and tenant rules

- Login creates a session only for an active account. Each protected request
  re-reads session validity and current account status from the server-side
  store.
- School context requires an active User and active `SchoolMembership` for the
  requested school, and an active school. Missing/inactive membership returns
  `404 SCHOOL_NOT_FOUND` to avoid disclosing school existence.
- Platform context requires a separately stored active Platform Super Admin
  assignment. A school membership or school role never implies platform access.
- Generic permission middleware denies unless the server-derived school access
  contains the required permission. No exact business permission keys are
  defined until the blueprint and role matrix are approved.
- Do not treat a school ID, role, or permission supplied by the client as proof
  of authorization.

## Rate limiting and auditing

Login and (when configured) recovery attempts are limited to 10 attempts per
normalized account key and 60 per client-address key in a 15-minute window.
Keys are HMACed with `RATE_LIMIT_HMAC_KEY` before storage; attempt state is
stored in PostgreSQL so application instances share the counters. Set
`TRUST_PROXY_HOPS` only to the known trusted proxy topology.

Successful and rejected login, throttling, logout, and completed/rejected
reset events are audited without passwords, tokens, email addresses, raw IP
addresses, or provider error details. Audit writes for session creation,
logout, and password-reset completion share a database transaction with the
associated state changes.

## Pending contract and implementation decisions

- Frontend review of cookie/CORS/CSRF behavior and response contracts.
- Production cookie domain/SameSite settings and trusted proxy topology.
- Approved email/recovery provider and account activation/enrollment flow.
- Blueprint-derived school roles, permission keys, scope rules, and
  administration endpoints.
- Platform-admin bootstrap/recovery ceremony and MFA.
- PostgreSQL integration verification of constraints, rate-limit upserts, and
  migration behavior; RLS is not enabled.
