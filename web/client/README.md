# Web Front-End

A React 19 + TypeScript single-page app built with Vite and styled with
[Material UI](https://mui.com/material-ui/).

## Developing with live reload

The container image serves a **snapshot** of `dist/`, so edits do not appear
until the image is rebuilt. While iterating on the UI, run the Vite dev server
instead: it compiles on demand and hot-swaps changed modules in the browser.

```sh
cd web/client/app
npm install       # first time only
npm run dev       # http://localhost:5173
```

Keep the pod running (`podman kube play --replace pod.yaml`) so the API is
reachable. The dev server proxies `/api` to `http://localhost:8080`, i.e. the
nginx container, which forwards to Flask — the same request path as production.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 with HMR |
| `npm run typecheck` | `tsc --noEmit` only, no bundle |
| `npm run build` | Type-check, then emit `dist/` |

Notes:

- The proxy deliberately targets **nginx on :8080, not Flask on :5000**. Flask
  is not published to the host by `pod.yaml`, and on macOS port 5000 is already
  held by the AirPlay Receiver. nginx also strips the `/api` prefix, so the dev
  proxy forwards paths unchanged; rewriting them again would 404 every request.
- Override the proxy target with `VITE_API_TARGET`, e.g.
  `VITE_API_TARGET=http://localhost:9000 npm run dev`.
- Ports are strict: if :5173 is busy the dev server exits rather than silently
  moving to :5174, so the documented URL is always correct.
- There is no mock API: `/api/session` and `/api/settings` are proxied to the
  real pod, so signing in only works while the full pod (including `db`) is
  running. Use the documented `ferguszo` / `abc123` admin account.

**Rebuild the image before committing or demonstrating** — the pod still serves
the previous build until you run `podman build -t client web/client`.

## Layout

```
app/
├── index.html              # Vite entry point
├── public/                 # Static assets copied verbatim into dist/
└── src/
    ├── main.tsx            # React root, theme provider, CssBaseline
    ├── theme.ts            # Central MUI theme (palette, typography, focus styles)
    ├── App.tsx             # Providers: AuthProvider > SettingsProvider > BrowserRouter
    ├── AppRoutes.tsx       # Route table, RequireAuth / RequireAdmin guards, lazy pages
    ├── routes.ts           # ROUTES paths, shared by nav and route definitions
    ├── api/
    │   └── settings.ts     # GET/PUT /api/settings client + fallback defaults
    ├── auth/
    │   └── AuthContext.tsx # Session state (signIn / signOut / useAuth), roles
    ├── content/
    │   ├── frequencies.ts  # Scan frequency options (HOURLY…MONTHLY)
    │   ├── layout.ts       # Shared spacing / grid / heading constants
    │   ├── messages.ts     # Fallback copy (organization name, reset message)
    │   ├── navigation.ts   # Public ("About") vs app navigation
    │   └── users.ts        # Seed rows for the Manage Users screen (client-side only)
    ├── hooks/
    │   └── useAppSettings.tsx # SettingsProvider / useAppSettings
    ├── pages/
    │   ├── LandingPage.tsx      # Signed out: sign-in + About (eagerly loaded)
    │   ├── HomePage.tsx         # Signed in: overview (lazy)
    │   ├── AuditReportsPage.tsx # Signed in: reports + scan frequency form (lazy)
    │   ├── CategoriesPage.tsx   # Signed in: report categories (lazy)
    │   ├── SettingsPage.tsx     # Signed in: settings, admin section (lazy)
    │   └── ManageUsersPage.tsx  # Admin only: user table (lazy)
    └── components/
        ├── Layout.tsx            # Shell: skip link, focus management, header + footer
        ├── AppHeader.tsx         # Sticky header: brand block + nav (desktop) / drawer (mobile)
        ├── AppFooter.tsx         # Footer: brand, navigation, contact
        ├── BrandLogo.tsx         # Decorative SVG mark + product name
        ├── LoginCard.tsx         # Sign-in form (posts to /api/login)
        ├── AdminSettingsForm.tsx # ADMIN: edits organization name / reset / help text
        ├── UserTable.tsx         # ADMIN: user list (renders content/users.ts seed data)
        ├── ScanFrequencyForm.tsx # Adds a source with a scan frequency (POST /api/sources)
        ├── ScanFrequencySelect.tsx # Frequency dropdown, options from content/frequencies.ts
        ├── FeatureGrid.tsx       # FeatureCard.tsx  # Marketing/feature tiles
        └── PageSection.tsx       # Prose.tsx  # SectionPanel.tsx  # Layout primitives
```

`Layout` owns the page shell, and `AppHeader` / `AppFooter` are independent
components, so either can be reused (or swapped) without touching the other.
`PageSection`, `SectionPanel` and `Prose` are the shared spacing/typography
primitives used by every page, so section rhythm stays consistent.

## Backend settings

`SettingsProvider` loads `GET /api/settings` once on mount and shares the result
through `useAppSettings()`. If the request fails it falls back to the constants
in `content/messages.ts`, so a missing endpoint never blocks the UI.

Expected response (wrapped in `data`, snake_case or camelCase accepted):

```json
{
  "data": {
    "organization_name": "City of Alexandria",
    "password_reset_message": "To reset your password, contact the administrators.",
    "general_help": "For help using AuditSector, review the guidance below or contact your administrator."
  }
}
```

| Setting | Used by |
|---|---|
| `organization_name` | Header brand block (heading above "AuditSector") |
| `password_reset_message` | "Forgot password?" dialog |
| `general_help` | Help section on the Settings page |

`AdminSettingsForm` saves via `PUT /api/settings` with snake_case keys and
requires an `ADMIN` session (`403` otherwise). `GET /api/settings` is public,
because the sign-in page shows the organization name and reset message before a
session exists. Both are backed by the `app_settings` table; see
`docs/api/settings.md`.

Saving applies optimistically: `applySettings()` updates the shared context
before the request runs, so the header and Help text change immediately. If the
request fails the form shows an error but keeps the local value — a refresh then
restores the server value.

The provider de-duplicates in-flight requests and exposes `status` /
`usingDefaults` so components can tell the difference between "still loading"
and "these are defaults". Defaults from `content/messages.ts` are only used when
the request fails or has not run.

Responses may be wrapped in `{ "data": { ... } }` or returned as a bare object;
`unwrap()` in `api/settings.ts` accepts either.

## Authentication gating

Navigation is driven by `navFor(isAuthenticated)` in `content/navigation.ts`:

| State | Navigation shown | Route |
|---|---|---|
| Signed out | `About` only | `/` → `LandingPage` (sign-in form + About) |
| Signed in | `Home`, `Audit Reports`, `Categories`, `Settings` | `/` redirects to `/home` |
| Signed in as `ADMIN` | same, plus `Settings → Manage users` | `/settings/users` |

Routes are guarded in `AppRoutes.tsx`, not just hidden by the nav:

- `RequireAuth` redirects unauthenticated visitors to `/`.
- `RequireAdmin` sends non-admins from `/settings/users` back to `/settings`.
- Both wait for `isChecking` to clear, so a refresh does not bounce a signed-in
  user to the landing page.
- Authenticated pages are `React.lazy` loaded, so they are not in the initial bundle.

`ManageUsersPage` renders `content/users.ts`, which is **seed data**, not a live
list: there is no `GET /users` endpoint yet. It is behind `RequireAdmin`, but
that guard is client-side only — add a server-side admin check when the
endpoint is implemented.

`LoginCard` calls `signIn(username, role)` when the API responds with
`status: "approved"`. The `role` comes from the login response (`ADMIN` or
`ANALYST`); any other value is treated as `ANALYST`.

### Where the session lives

Nothing about the session is stored in the browser. On mount, `AuthProvider`
calls `GET /api/session` and uses only that answer; the Flask session cookie is
`HttpOnly`, so JavaScript cannot read or forge it. This replaced an earlier
design that kept `{username, role}` in `sessionStorage`, where editing the value
was enough to render the administrator screens.

Signing out calls `POST /api/logout` before clearing local state — otherwise the
still-valid cookie would sign the user back in on the next refresh.

`isChecking` is exposed so route guards can wait for the session request instead
of redirecting a signed-in user to the landing page during a refresh.

**Note:** the client-side gating controls what is rendered, not what is
accessible. The server enforces the same rules: `/sources` requires a session and
`PUT /settings` requires the `ADMIN` role.

## Local development

```sh
cd web/client/app
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:5000`, mirroring the
nginx proxy used in the container.

## Production build

```sh
npm run build      # type-check + emit static assets to dist/
npm run preview    # serve dist/ locally
```

The `web/client` container uses a multi-stage build: Node compiles the app, then
only the static `dist/` output is copied into an nginx image.

## Container

```sh
podman build -t client web/client
podman run --pod web -d --name web-client client
```

The runtime stage is `nginx:alpine`. It deletes the stock `default.conf` and
installs **`web/client/web.conf`**, which:

- serves `dist/` from `/usr/share/nginx/html` on port `80`;
- falls back to `index.html` via `try_files $uri $uri/ /index.html`, so deep
  links such as `/settings/users` survive a refresh (required by `BrowserRouter`);
- proxies `location /api/` to `http://localhost:5000/`, **stripping the `/api`
  prefix**. `localhost` works because the pod shares a network namespace;
- sets `X-Forwarded-Prefix: /api` so Flask can build `/api/...` URLs, and
  `absolute_redirect off` so a redirect uses `Location: /api/` instead of an
  absolute URL on nginx's own port 80.

`web/client/nginx.conf` is **not** used by the image (only `web.conf` is copied);
it is an unused leftover and can be deleted. There is no CORS configuration
because the proxy makes every request same-origin.

## Accessibility notes

- Landmarks: `<header>`, `<nav aria-label="Primary">`, `<main id="main-content">`,
  `<footer>`.
- A "Skip to main content" link is the first focusable element.
- Mobile navigation is a focus-trapped MUI Drawer, dismissible with Escape, the
  close button, or a backdrop click; the trigger exposes `aria-expanded` and
  `aria-controls`.
- Focus rings are defined globally in `theme.ts` via `:focus-visible`.
- Decorative icons are `aria-hidden`; the logo link has an accessible name.
- Form inputs use explicit labels; status and error messages are announced with
  `role="status"` / `role="alert"`.

## Responsiveness

- Header collapses to a menu button below the `md` breakpoint.
- Content uses fluid `Container` widths and CSS grid columns that reflow at the
  `sm` and `md` breakpoints.
- The footer stacks on small screens and uses a three-column grid on desktop.

