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

## Add Source form (AW-24)

Sign in through the shared application and open Audit Reports (`/audits`).
`ScanFrequencyForm` renders the reusable `AddSourceForm` with the existing
frequency selector. The shared layout, navigation, authentication, and theme remain
in place.

The form supports HTTP(S) URL validation, inline errors, keyboard submission,
cancellation, and a typed `onSubmit({ sourceUrl })` callback. A pending callback
disables the controls, and rejection displays a retry message. Validation checks
URL syntax, not website availability.

The Validate source action only confirms the URL format. It does not save a
schedule or call the source API. Changing the URL or frequency clears the previous
confirmation. Cancel clears the URL and feedback and restores the default frequency.

AW-25 will connect this form to the existing `POST /api/sources` endpoint using the
shared authenticated user context and selected frequency.
