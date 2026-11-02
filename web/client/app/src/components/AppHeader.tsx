import { useState } from 'react';
import { Link as RouterLink, NavLink } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import LogoutIcon from '@mui/icons-material/Logout';
import BrandLogo from './BrandLogo';
import { navFor } from '../content/navigation';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../hooks/useAppSettings';
import { BRAND_FONT, BRAND_FONT_WEIGHT, BRAND_LETTER_SPACING, NAV_BAR_ITEM_SX, NAV_DRAWER_ITEM_SX, ORGANIZATION_FONT, QUIET_LINK_SX } from '../theme';
import { ROUTES } from '../routes';

const DRAWER_ID = 'mobile-navigation';

/**
 * Sticky application header.
 *
 * Navigation is auth-aware: signed-out visitors only see "About", while
 * signed-in users see the application sections plus their account menu.
 *
 * Layout:
 * - Desktop (`md`+): a two-row header. Row one holds the brand block
 *   (logo placeholder, "Audit Sector", then the organization name to its
 *   right); row two holds the primary navigation.
 * - Mobile: a single row with the brand block (logo, "Audit Sector", and the
 *   organization name stacked beneath it) and a menu button that opens a
 *   temporary Drawer.
 *
 * Accessibility notes:
 * - The brand is a link with spans, not a heading. Each page provides its own
 *   descriptive `<h1>`, so heading navigation lands on meaningful content.
 * - `<header>` and `<nav aria-label="Primary">` provide landmarks.
 * - The menu button exposes `aria-expanded` and `aria-controls`.
 * - The drawer is dismissible with Escape, the close button, or a backdrop click.
 */
export default function AppHeader() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { isAuthenticated, isAdmin, user, signOut } = useAuth();
  const { settings } = useAppSettings();
  const navItems = navFor(isAuthenticated);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <AppBar
      component="header"
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        // On desktop the nav band below supplies both rules, so the toolbar
        // does not need its own bottom border there. On mobile the nav band is
        // absent, so the toolbar keeps a bottom rule to separate it from the
        // page content.
        borderBottom: { xs: 1, md: 0 },
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar
          disableGutters
          sx={{ minHeight: { xs: 64, md: 72 }, gap: 2 }}
        >
          <Box
            component={RouterLink}
            to={ROUTES.landing}
            aria-label="Audit Sector home"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.5,
              minWidth: 0,
              color: 'text.primary',
              textDecoration: 'none',
              borderRadius: 1,
            }}
          >
            <BrandLogo />

            {/*
              Brand text is intentionally NOT a heading: every page supplies
              its own descriptive h1, and the header is already a banner
              landmark with an accessible link name.

              The product name and organization are separate spans so they can
              be laid out independently.
              - Mobile: stacked ("Audit Sector" above the organization name).
              - Desktop: "Audit Sector" first, organization name to its right.
            */}
            <Typography
              component="p"
              variant="subtitle1"
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { md: 'center' },
                gap: { xs: 0, md: 1.5 },
                minWidth: 0,
                lineHeight: 1.2,
              }}
            >
              <Box
                component="span"
                sx={{
                  // Alegreya SC is a small-caps display face, so the wordmark is
                  // set in normal case in the markup and rendered as caps here.
                  // Same family/weight/tracking as the footer wordmark.
                  fontFamily: BRAND_FONT,
                  fontWeight: BRAND_FONT_WEIGHT,
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  lineHeight: 1.1,
                  letterSpacing: BRAND_LETTER_SPACING,
                  whiteSpace: 'nowrap',
                  // Underline rule beneath the wordmark itself.
                  display: 'inline-block',
                  alignSelf: { xs: 'flex-start', md: 'center' },
                  borderBottom: 1, 
                  borderColor: 'currentColor',
                  pb: 0.25,
                }}
              >
                Audit Sector
              </Box>

              {/* Decorative separator: desktop only. */}
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  alignSelf: 'stretch',
                  width: '1px',
                  bgcolor: 'divider',
                }}
              />

              <Box
                component="span"
                id="organization-name"
                sx={{
                  display: 'block',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'text.secondary',
                  // Crimson Text only has 400/600/700; 400 keeps the byline
                  // quiet next to the bold wordmark. The larger size offsets
                  // its smaller x-height relative to the display face.
                  fontFamily: ORGANIZATION_FONT,
                  fontWeight: 400,
                  fontSize: { xs: '1rem', md: '1.15rem' },
                  lineHeight: 1.2,
                  letterSpacing: '0.01em',
                }}
              >
                {settings.organizationName}
              </Box>
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {!isDesktop && (
            <IconButton
              edge="end"
              color="primary"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls={DRAWER_ID}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </Container>

      {isDesktop && (
        /*
          The nav band deliberately sits OUTSIDE the header's `Container`.
          Top and bottom borders bracket the row so it reads as a distinct
          band rather than a stray divider.
        */
        <Box
          sx={{
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Container maxWidth="lg">
            <Box
              component="nav"
              aria-label="Primary"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 52,
              }}
            >
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  component={NavLink}
                  to={item.path}
                  end
                  color="inherit"
                  sx={NAV_BAR_ITEM_SX}
                >
                  {item.label}
                </Button>
              ))}

              <Box sx={{ flexGrow: 1 }} />

              {isAuthenticated && (
                <>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    component="span"
                    sx={{ mr: 1.5 }}
                  >
                    {user?.username}
                    {isAdmin && (
                      <Chip
                        label="Admin"
                        size="small"
                        color="secondary"
                        variant="outlined"
                        sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Typography>
                  <Button
                    color="inherit"
                    onClick={() => {
                      // Clears the server session as well as local state.
                      void signOut();
                    }}
                    startIcon={<LogoutIcon />}
                    sx={QUIET_LINK_SX}
                  >
                    Sign out
                  </Button>
                </>
              )}
            </Box>
          </Container>
        </Box>
      )}

      <Drawer
        id={DRAWER_ID}
        anchor="right"
        open={drawerOpen}
        onClose={closeDrawer}
        slotProps={{ paper: { sx: { width: 280 } } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700 }}>
            Menu
          </Typography>
          <IconButton
            aria-label="Close navigation menu"
            onClick={closeDrawer}
            edge="end"
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />
        <List component="nav" aria-label="Primary">
          {navItems.map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                component={NavLink}
                to={item.path}
                end
                onClick={closeDrawer}
                sx={NAV_DRAWER_ITEM_SX}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
          {isAuthenticated && (
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => {
                  closeDrawer();
                  // Clears the server session as well as local state.
                  void signOut();
                }}
              >
                <ListItemText primary="Sign out" />
              </ListItemButton>
            </ListItem>
          )}
        </List>
      </Drawer>
    </AppBar>
  );
}
