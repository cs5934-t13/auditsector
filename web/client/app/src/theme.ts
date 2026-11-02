import {
  createTheme,
  type SxProps,
  type Theme,
} from '@mui/material/styles';

/**
 * Display font stacks for the brand block.
 *
 * The faces themselves are loaded in `main.tsx` from `@fontsource/*`, so they
 * are bundled as local assets and the app still renders correctly offline.
 * Each stack ends in a serif fallback with similar proportions, then the
 * generic, so a failed font load degrades gracefully.
 *
 * These are plain constants rather than custom theme typography variants
 * because MUI does not type custom variants on `<Typography variant>`.
 */
export const BRAND_FONT = '"Alegreya SC", Georgia, "Times New Roman", serif';
export const ORGANIZATION_FONT = '"Crimson Text", Georgia, "Times New Roman", serif';

/**
 * Weight for the "Audit Sector" wordmark.
 *
 * Alegreya SC is a small-caps face, so its bold weights look much heavier than
 * the same weight in a normal lowercase face. 500 keeps the wordmark distinct
 * without shouting. Shared by the header and footer so they match.
 */
export const BRAND_FONT_WEIGHT = 500;

/** Slight positive tracking, which small-cap faces need to avoid crowding. */
export const BRAND_LETTER_SPACING = '0.02em';

/**
 * Shared interaction styling for navigation entries.
 *
 * Both navigation surfaces — the desktop `Button` bar and the mobile
 * `ListItemButton` drawer — render a `NavLink`, so React Router's `.active`
 * class and `aria-current="page"` are available in both. These fragments keep
 * the two from drifting apart, which they had before: the drawer originally
 * used a plain `Link` and so had no active state at all.
 *
 * They are exported `SxProps` fragments rather than `MuiButton` /
 * `MuiListItemButton` theme overrides because they only apply to navigation
 * links. A global override would also tint ordinary buttons and list items.
 */

/** Colors an entry takes when it matches the current route. */
const NAV_ACTIVE_COLORS = {
  color: 'primary.main',
  bgcolor: 'action.selected',
} as const;

/** Resting and hover styling shared by both navigation surfaces. */
const navEntryBase: SxProps<Theme> = {
  color: 'text.secondary',
  '&:hover': {
    color: 'primary.main',
    bgcolor: 'action.hover',
  },
};

/** Desktop nav bar: a `Button` acting as a link. */
export const NAV_BAR_ITEM_SX: SxProps<Theme> = {
  ...navEntryBase,
  px: 1.5,
  '&.active': {
    ...NAV_ACTIVE_COLORS,
    // `Button` renders its label itself, so weight goes on the root.
    fontWeight: 700,
  },
};

/** Mobile drawer: a `ListItemButton` wrapping `ListItemText`. */
export const NAV_DRAWER_ITEM_SX: SxProps<Theme> = {
  ...navEntryBase,
  '&.active': NAV_ACTIVE_COLORS,
  // `ListItemText` renders the label in a child, so the weight change has to
  // target that child rather than the button root.
  '&.active .MuiListItemText-primary': {
    fontWeight: 700,
  },
};

/**
 * Quiet text links and text-only buttons: secondary color at rest, brand color
 * on hover. Used by the footer link lists and the header's "Sign out" button so
 * every low-emphasis interactive text behaves the same way.
 */
export const QUIET_LINK_SX: SxProps<Theme> = {
  ...navEntryBase,
};

/** Footer links: the shared quiet-link styling plus a slightly smaller size. */
export const FOOTER_LINK_SX: SxProps<Theme> = {
  ...QUIET_LINK_SX,
  fontSize: '0.95rem',
};

/**
 * Central MUI theme.
 *
 * Background roles, and how they drive the framed shell in `components/Layout`:
 *
 * - `background.default` is painted on `<body>` by `CssBaseline`, so it is the
 *   backdrop you see in the gutter *around* the app frame.
 * - `background.paper` is the framed shell and every surface inside it
 *   (header, footer, panels, tables).
 *
 * Expressing the design with MUI's existing roles means no custom palette key,
 * no `CssBaseline` body override, and no extra `bgcolor` on the layout root.
 *
 * - Uses a system font stack for body text so the app renders correctly
 *   without a network request to a font CDN (important for an
 *   offline-capable container). The two display faces used by the header are
 *   self-hosted, see above.
 * - Focus-visible outlines are defined globally to keep keyboard navigation
 *   obvious, even on custom link/button elements.
 */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0B4F6C',
      dark: '#073A50',
      light: '#3A7CA5',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#0F766E',
      contrastText: '#FFFFFF',
    },
    background: {
      // Backdrop behind the app frame.
      default: '#D7D2CB',
      // The app frame itself, plus all raised surfaces inside it.
      paper: '#FFFFFF',
    },
    text: {
      primary: '#152026',
      secondary: '#4A5A64',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 600,
    },
    // Section headings inside a page ("Help", "Administration", ...) use `h5`
    // as an `h2`. Matching the weight to `h3` keeps section headings visually
    // related to the page title instead of inheriting MUI's regular-weight
    // default and looking like body copy.
    h5: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          // Prevent layout shift when a scrollbar appears.
          scrollbarGutter: 'stable',
        },
        ':focus-visible': {
          outline: '3px solid #3A7CA5',
          outlineOffset: 2,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        /**
         * Page title treatment, applied wherever `variant="h3"` is used with
         * `component="h1"`.
         *
         * This lived in `content/layout.ts` as `PAGE_HEADING_SX`, but only the
         * landing and home pages remembered to apply it, so pages rendered at
         * three different sizes. As a variant override every page heading is
         * identical by construction.
         *
         * `clamp()` is used rather than a breakpoint object because
         * `theme.typography` and `styleOverrides` are emitted as plain CSS —
         * only the `sx` prop expands responsive objects into media queries.
         * The curve is tuned to match the previous xs/md steps: 2rem at ~375px,
         * 3.25rem at ~1200px and above.
         */
        h3: {
          fontSize: 'clamp(2rem, 1.4rem + 2.4vw, 3.25rem)',
          lineHeight: 1.12,
        },
      },
    },
    MuiLink: {
      defaultProps: {
        underline: 'hover',
      },
      styleOverrides: {
        // Global link hover so any `Link` gets the brand color, not just the
        // ones that remembered to declare it. Components that need a different
        // resting color still set their own `color`.
        root: {
          '&:hover': {
            color: 'primary.main',
          },
        },
      },
    },
  },
});

export default theme;
