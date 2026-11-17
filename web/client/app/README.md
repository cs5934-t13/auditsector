# AuditSector React client

React + TypeScript and Vite, using the shared MUI theme and application layout.
MUI with Emotion follows the agreement between Amr and Jit, replacing the design
document's Tailwind/shadcn choice.

From this directory:

```sh
npm ci
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
```

TypeScript checks are split by environment: `tsconfig.app.json` checks browser
code under `src`, and `tsconfig.node.json` checks `vite.config.ts` with Node types.
The root `tsconfig.json` references both projects. `npm run typecheck` uses build
mode to check both, and `npm run build` runs that check before bundling. Both
projects retain strict checking; build caches are stored under ignored
`node_modules/.tmp`.

ESLint checks the TypeScript source, React hook usage, Vite configuration, and
Node-based test/config files. `npm run lint` fails on errors or warnings. Type
checking remains a separate `npm run typecheck` step.

The lint dependencies temporarily override `minimatch` to patched version 11.0.4
for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
All current consumers belong to the lint tooling, not the application runtime.
Revisit this override when the upstream lint packages require a patched release.

The URL-validation tests import TypeScript directly and require a Node.js version
with native TypeScript type stripping enabled, such as Node 22.18+ or Node 24+.

Vite serves the frontend at `http://localhost:5173` and forwards `/api/*` unchanged
to NGINX at `http://localhost:8080`. NGINX removes the `/api` prefix and forwards
requests to Flask inside the pod. Keep the existing pod running for login and API
requests. See `../README.md` for the shared frontend development instructions.

## Add Source form (AW-24 and AW-25)

Sign in through the shared application and open Audit Reports (`/audits`).
`ScanFrequencyForm` renders the reusable `AddSourceForm` with the existing
frequency selector and reads the signed-in state from `useAuth()`.

The form supports HTTP(S) URL validation, inline errors, keyboard submission,
cancellation, and a typed `onSubmit({ sourceUrl })` callback. Controls are disabled
while a submission is pending or the shared context is not signed in. Validation
checks URL syntax, not website availability.

Choose a scan frequency and select **Save source**. The client sends `source` and
`frequency` as query parameters to `POST /api/sources`, with the Flask session
cookie. It omits the deprecated `user` parameter; Flask determines ownership from
the session. See `../../../docs/api/audit-sources.md` for the contract.

Success requires `201 Created` and one complete saved-source record. The form
shows the URL and frequency returned by the server. This confirms the schedule
was saved; it does not confirm that a scan has run.

Changing the URL or frequency clears the previous success message. Cancel clears
the URL and feedback and restores the WEEKLY default. A different signed-in user
gets fresh form state. Failed requests preserve the URL and display an error.
Network failures, timeouts, and unexpected success responses warn that saving
could not be confirmed, so check before retrying to avoid duplicate schedules.

`npm test` covers URL validation and API request/response handling with simulated
responses. Verify the live integration separately by signing in through the shared
application, saving a uniquely identified test source, checking its owner and
frequency in MySQL, and deleting only the records created for that check.


## Live recent reports (AW-105)

The Recent reports section on `/audits` requests `GET /api/audits/recent` using
the Flask session cookie. It displays Title, Audit date, and Added from the four
response fields documented in `../../../docs/api/audits-recent.md`. UUID strings
and legacy numeric identifiers are supported as row keys. Stored date/time values
are displayed without an assumed timezone or conversion.

Pagination is handled by the server, starting at page 1 with 20 records. The grid
offers 10, 20, or 50 records per page; changing the size returns to page 1. The
client preserves server order (`created_at DESC, audit_id DESC`). Pending requests
are cancelled when the page changes or the section unmounts, and stale responses
are ignored. If records disappear and the requested page is no longer available,
the section loads the last available page.

Loading feedback is limited to the table. A successful empty response shows
"No audit records to display." Errors show an error message and Retry; a 401
instead offers Sign in again through the shared authentication context. Other
page content, including Add Source, stays mounted. Sample records are no longer
used as a fallback.

`node --test tests/recent-audits-api.test.mjs` covers requests, pagination,
UUID/legacy identifiers, response validation, errors, timeout, and cancellation.
Browser verification should also cover page navigation, page-size changes,
loading, empty results, Retry, expired sessions, and navigation away during a
request. Use controlled records and remove only the records created for testing.
