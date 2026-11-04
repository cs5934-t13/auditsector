import {
  alpha,
  createTheme,
  type SxProps,
  type Theme,
} from '@mui/material/styles';

/** Brand ink, the source color for hover/selected tints. */
const PRIMARY_MAIN = '#0B4F6C';

/**
 * Accent used for interactive text (links) and for the nav hover state.
 */
export const LINK_ACCENT = '#9A3A00';

/**
 * Lighter tint of `LINK_ACCENT`, used as the resting surface for filled
 * (contained) buttons and for the selected nav entry.
 */
export const ACCENT_LIGHT = '#B34B00';

/**
 * Translucent accent wash for hover/selected surfaces.
 */
export const ACCENT_WASH = alpha(LINK_ACCENT, 0.12);

const NAV_HOVER = {
  color: '#FFFFFF',
  bgcolor: LINK_ACCENT,
} as const;

/**
 * Shared interaction styling for navigation entries.
 */
const NAV_ACTIVE_COLORS = {
  color: LINK_ACCENT,
  bgcolor: ACCENT_WASH,
} as const;

/** Resting styling shared by both navigation surfaces. */
const navEntryBase: SxProps<Theme> = {
  color: 'text.secondary',
};

const navHoverSx: SxProps<Theme> = {
  '&:hover': NAV_HOVER,
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
  ...navHoverSx,
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
  ...navHoverSx,
};

/**
 * Body links: accent color at rest, underlined on hover.
 */
export const BODY_LINK_SX: SxProps<Theme> = {
  color: LINK_ACCENT,
  '&:hover': { textDecoration: 'underline' },
};

/** Footer links: the body-link treatment plus a slightly smaller size. */
export const FOOTER_LINK_SX: SxProps<Theme> = {
  ...BODY_LINK_SX,
  fontSize: '0.95rem',
};

/**
 * Low-emphasis text-only buttons such as the header's "Sign out".
 */
export const QUIET_LINK_SX: SxProps<Theme> = {
  color: 'primary.main',
  '&:hover': NAV_HOVER,
};

/**
 * Display font stacks for the brand block.
 */
export const BRAND_FONT = '"Alegreya SC", Georgia, "Times New Roman", serif';
export const ORGANIZATION_FONT = '"Crimson Text", Georgia, "Times New Roman", serif';

/**
 * Weight for the "Audit Sector" wordmark.
 */
export const BRAND_FONT_WEIGHT = 500;

/** Slight positive tracking, which small-cap faces need to avoid crowding. */
export const BRAND_LETTER_SPACING = '0.02em';


/**
 * Central MUI theme.
 */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: PRIMARY_MAIN,
      dark: '#073A50',
      light: '#3A7CA5',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#0F766E',
      contrastText: '#FFFFFF',
    },
    action: {
      hover: alpha(PRIMARY_MAIN, 0.06),
      hoverOpacity: 0.06,
      selected: alpha(PRIMARY_MAIN, 0.12),
      selectedOpacity: 0.12,
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
        /**
         * Rest and hover states
         */
        contained: {
          '&&:not(.Mui-disabled)': {
            backgroundColor: ACCENT_LIGHT,
            color: '#FFFFFF',
          },
          '&&:hover': {
            backgroundColor: LINK_ACCENT,
            color: '#FFFFFF',
          },
        },
        outlined: {
          '&&:not(.Mui-disabled)': {
            color: LINK_ACCENT,
            borderColor: LINK_ACCENT,
          },
          '&&:hover': {
            color: '#FFFFFF',
            backgroundColor: LINK_ACCENT,
            borderColor: LINK_ACCENT,
          },
        },
        text: {
          '&&:hover': {
            color: '#FFFFFF',
            backgroundColor: LINK_ACCENT,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        /**
         * Icon buttons adopt the same hover block as the rest of the app.
         * `&&` for the same specificity reason: MUI sets its hover background
         * via the `--IconButton-hoverBg` custom property at equal specificity.
         */
        root: {
          '&&:hover': {
            color: '#FFFFFF',
            backgroundColor: LINK_ACCENT,
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        /**
         * Page title treatment, applied wherever `variant="h3"` is used with
         * `component="h1"`.
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
        /**
         * Body-link default: accent color at rest, underline on hover.
         */
        root: {
          color: LINK_ACCENT,
          '&:hover': {
            color: LINK_ACCENT,
            textDecoration: 'underline',
          },
        },
      },
    },
  },
});

export default theme;
