# AuditSector React client

React + TypeScript, Vite, ESLint, and MUI/Emotion. MUI follows the later
Amr/Jit agreement, replacing the design document's Tailwind/shadcn choice.

From this directory: `npm ci`, `npm run dev`, `npm run build`, `npm run lint`,
and `npm test`.

Vite forwards `/api/*` to Flask at `http://localhost:5000/*`, removing `/api`,
matching nginx. Flask and MySQL must run separately for real integration.
The preserved login example remains at `/legacy-login.html`.

## AW-25 integration preparation

`AddSourcePage` receives the current `user` value from its parent. The standalone
App reads the username from Jit's existing `auditsector:user` sessionStorage
format. It does not create a login session, invent an identity, or add a user-ID
input. When combining with Jit's shell, render this page using his `useAuth()`
user instead of retaining the standalone App. Signed-out submission is disabled.
The legacy login example does not populate this storage entry.

Submission calls `POST /api/sources` with URL-encoded query parameters `user`
and `source`, as specified in `docs/api/audit-sources.md`. Frequency is omitted,
using the documented WEEKLY default until Jit's selector is integrated. Both
200 (contract) and 201 (AW-22 criterion) are accepted, but a complete returned
source record is required before showing success. Errors preserve the input;
network/timeout errors warn that saving could not be confirmed.

### Remaining team dependencies

- Sam must implement AW-22's real POST /sources endpoint.
- Confirm whether the API's `user` string means username or user ID. Current
  shared frontend identity supplies username; no ID is fabricated.
- Resolve the contract's 200 versus AW-22's 201 expectation (client supports both).
- Reconcile this page with Jit's shell. His current LoginCard checks `valid`,
  while main's Flask login returns `approved`; that mismatch is not changed here.
- AW-26 requires submission through the real API, a database record, and the
  source in a sources list. No GET /sources contract/list exists in the inspected
  code. Unit tests and simulated responses do not satisfy AW-26.

## Checks

`npm test` verifies URL validation, request encoding, response handling,
timeouts, and stored-user parsing without contacting a backend.

For real acceptance after dependencies are ready: sign in through the shared
shell; verify an invalid URL sends no request; submit a unique valid URL; confirm
a success message, the matching schedules row, and its appearance in the sources
list; verify a server failure preserves the URL and allows retry. Use a disposable
test database. Keep AW-25/AW-26 open until the corresponding real checks pass.
