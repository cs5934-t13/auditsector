import { createTheme } from '@mui/material/styles';

/**
 * Central MUI theme.
 *
 * Background roles, and how they drive the framed shell in `components/Layout`:
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
