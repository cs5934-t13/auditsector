# Web Front-End

A React 19 + TypeScript single-page app built with Vite and styled with
[Material UI](https://mui.com/material-ui/).

## Layout

```
app/
├── index.html              # Vite entry point
├── public/                 # Static assets copied verbatim into dist/
└── src/
    ├── main.tsx            # React root, theme provider, auth + settings providers
    ├── theme.ts            # Central MUI theme (palette, typography, focus styles)
    ├── App.tsx             # Shell: skip link, header, main, footer
    ├── api/
    │   └── settings.ts     # GET /api/settings client + defaults
    ├── auth/
    │   └── AuthContext.tsx # Session state (signIn / signOut / useAuth)
    ├── content/
    │   ├── messages.ts     # Fallback copy (organization name, reset message)
    │   └── navigation.ts   # Public ("About") vs app navigation
    ├── hooks/
    │   └── useAppSettings.tsx # SettingsProvider / useAppSettings
    ├── pages/
    │   ├── LandingPage.tsx   # Signed-out: sign-in + About
    │   └── DashboardPage.tsx # Signed-in: overview, audits, sources
    └── components/
        ├── AppHeader.tsx   # Sticky header: brand block + nav row (desktop) / drawer (mobile)
        ├── AppFooter.tsx   # Footer: brand, navigation, contact
        └── LoginCard.tsx   # Sign-in form (posts to /api/login)
```

`AppHeader` and `AppFooter` are independent components so the page shell stays
small and either can be reused (or swapped) without touching the other.

## Backend settings

`SettingsProvider` loads `GET /api/settings` once on mount and shares the result
through `useAppSettings()`. On failure it silently falls back to the constants in
`content/messages.ts`, so a missing endpoint never blocks the UI.

Expected response (snake_case or camelCase accepted):

```json
{
  "organization_name": "City of Alexandria",
  "password_reset_message": "To reset your password, contact the administrator."
}
```

| Setting | Used by |
|---|---|
| `organization_name` | Header brand block (heading above "AuditSector") |
| `password_reset_message` | "Forgot password?" dialog |

## Authentication gating

Navigation is driven by `navFor(isAuthenticated)` in `content/navigation.ts`:

| State | Navigation shown | Page |
|---|---|---|
| Signed out | `About` only | `LandingPage` (sign-in form + About) |
| Signed in | `Overview`, `Audits`, `Sources` + sign out | `DashboardPage` |

`LoginCard` calls `signIn(username)` when the API responds with
`status: "valid"`. The session is stored in `sessionStorage` so a refresh keeps
the user signed in, but closing the tab ends the session.

**Note:** this is client-side gating only — it controls what is rendered, not
what is accessible. Authorization must also be enforced by the API.

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

