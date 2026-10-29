# Frontend API integration

The frontend API boundary is implemented here:

- `client.ts` sends credentialed requests to `/api/v1`, adds the CSRF header to
  state-changing requests, and normalizes API error responses as
  `ApiClientError`.
- `downloadReport` handles CSV downloads through the same error normalization.
- `school-data.ts` provides school-scoped React Query hooks. Query keys include
  the active school and request parameters to keep cached records scoped to the
  current workspace.
- `platform-types.ts` contains frontend types for the platform endpoints used
  by the control-plane pages.

Keep endpoint contracts coordinated with the backend owner. Do not treat
frontend types or navigation visibility as an authorization boundary; the
server remains authoritative.
