# Web Front-End

A React 19 + TypeScript single-page app built with Vite and styled with
[Material UI](https://mui.com/material-ui/).

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
        ├── Layout.tsx      # Shell: skip link, focus management, header + footer
        ├── AppHeader.tsx   # Sticky header: brand block + nav row (desktop) / drawer (mobile)
        ├── AppFooter.tsx   # Footer: brand, navigation, contact
        └── LoginCard.tsx   # Sign-in form (posts to /api/login)
```

`Layout` owns the page shell, and `AppHeader` / `AppFooter` are independent
components, so either can be reused (or swapped) without touching the other.

## Backend settings

`SettingsProvider` loads `GET /api/settings` once on mount and shares the result
through `useAppSettings()`. On failure it silently falls back to the constants in
`content/messages.ts`, so a missing endpoint never blocks the UI.

Expected response (snake_case or camelCase accepted):

```json
{
  "organization_name": "City of Alexandria",
  "password_reset_message": "To reset your password, contact the administrator.",
  "general_help": "For help using AuditSector, review the guidance below."
}
```

| Setting | Used by |
|---|---|
| `organization_name` | Header brand block (heading above "AuditSector") |
| `password_reset_message` | "Forgot password?" dialog |
| `general_help` | Generic help guidance text |

`updateAppSettings()` sends a `PUT /api/settings` with snake_case keys. Neither
endpoint exists on the server yet, so the app runs entirely on the fallbacks in
`content/messages.ts`. The provider de-duplicates in-flight requests and exposes
`status` / `usingDefaults` so components can tell the difference between "still
loading" and "these are defaults".

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
- Authenticated pages are `React.lazy` loaded, so they are not in the initial bundle.

`LoginCard` calls `signIn(username)` when the API responds with
`status: "approved"`. The session is stored in `sessionStorage` so a refresh keeps
the user signed in, but closing the tab ends the session.

**Note:** this is client-side gating only — it controls what is rendered, not
what is accessible. Authorization must also be enforced by the API.

### Previewing the signed-in app

The auth provider accepts `?as=<username>` and an optional `&role=ADMIN`, for
example <http://localhost:5173/?as=jdoe&role=ADMIN>. This bypasses the backend
entirely and is available only when `import.meta.env.DEV` is true or the build is
made with `VITE_DEMO_AUTH=true`. The parameters are stripped from the address bar
after the first load.

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
  prefix**. `localhost` works because the pod shares a network namespace.

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

