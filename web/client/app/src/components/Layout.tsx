import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import AppFooter from './AppFooter';
import AppHeader from './AppHeader';

/**
 * Application shell: skip link, header, routed main content, footer.
 *
 * Accessibility notes:
 * - The skip link is the first focusable element and targets `#main-content`.
 * - On route change, focus moves to `<main>` so screen readers announce the new
 *   page instead of leaving the user mid-document. Hash-only navigation (for
 *   example `/ #about`) does not steal focus, because in-page anchors should
 *   keep their native behavior.
 */
export default function Layout() {
  const { pathname, hash } = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip on initial load: the browser should honour deep links and the user's
    // own focus position.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (hash) {
      return;
    }

    mainRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);

  return (
    // Outer gutter. 
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        p: { xs: 1.5, md: 3 },
      }}
    >
      {/*
        First focusable element: lets keyboard users bypass the header.
        It lives outside the framed box so the box's `overflow: clip` cannot
        hide it once it is focused.
      */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          top: 8,
          left: -9999,
          zIndex: (theme) => theme.zIndex.tooltip + 1,
          px: 2,
          py: 1,
          borderRadius: 1,
          bgcolor: 'background.paper',
          color: 'primary.main',
          fontWeight: 600,
          textDecoration: 'none',
          boxShadow: 3,
          '&:focus': { left: 16 },
        }}
      >
        Skip to main content
      </Box>

      {/*
        Framed shell: a single bordered box wrapping header, main, and footer.
      */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          width: '100%',
          maxWidth: 'lg',
          mx: 'auto',
          minWidth: 0,
          border: 1,
          borderColor: 'divider',
          overflow: 'clip',
          bgcolor: 'background.paper',
          boxShadow: (theme) =>
            `0 1px 2px ${alpha(theme.palette.text.primary, 0.06)}, 0 16px 40px -16px ${alpha(
              theme.palette.text.primary,
              0.18,
            )}`,
        }}
      >
        <AppHeader />

        <Box
          component="main"
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          sx={{ flexGrow: 1 }}
        >
          <Outlet />
        </Box>

        <AppFooter />
      </Box>
    </Box>
  );
}
