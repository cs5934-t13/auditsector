# AuditSector React client

React + TypeScript, Vite and ESLint. MUI with Emotion follows the later agreement
between Amr and Jit, replacing the design document's Tailwind/shadcn choice.

From this directory:

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
```

Vite forwards `/api/*` to Flask at `http://localhost:5000/*`, removing `/api`,
matching the nginx deployment configuration. Flask must run separately for API calls.

AW-24 provides a URL form with inline validation, keyboard submission, cancellation,
and a typed `onSubmit({ sourceUrl })` callback. The callback can return a Promise;
while pending, controls are disabled, and rejection displays a retry message.
Validation requires an explicit HTTP(S) URL and does not check website availability.

The current App is a preview: it validates without contacting the API or saving data.
AW-25 will connect the callback to the REST endpoint and authenticated user context.
Jit's AW-18 layout and AW-73 frequency selector remain separate responsibilities.
No tags, collection toggle, or user-ID inputs are added here.

The preserved login example is at `public/legacy-login.html`, served at
`/legacy-login.html` in development and the production build. Its existing API
behavior has not been verified end to end.
