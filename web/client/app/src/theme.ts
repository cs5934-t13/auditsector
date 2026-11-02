import { createTheme } from '@mui/material/styles';

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
    MuiLink: {
      defaultProps: {
        underline: 'hover',
      },
    },
  },
});

export default theme;
