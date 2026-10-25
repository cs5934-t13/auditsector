import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { navFor } from '../content/navigation';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../hooks/useAppSettings';

const DRAWER_ID = 'mobile-navigation';

/**
 * Sticky application header.
 *
 * Navigation is auth-aware: signed-out visitors only see "About", while
 * signed-in users see the application sections plus their account menu.
 *
 * Layout:
 * - Desktop (`md`+): a two-row header. Row one holds the brand block
 *   (organization name + AuditSector); row two holds the primary navigation.
 * - Mobile: a single row with the brand block and a menu button that opens a
 *   temporary Drawer.
 *
 * Accessibility notes:
 * - `<header>` and `<nav aria-label="Primary">` provide landmarks.
 * - The menu button exposes `aria-expanded` and `aria-controls`.
 * - The drawer is dismissible with Escape, the close button, or a backdrop click.
 */
export default function AppHeader() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { isAuthenticated, user, signOut } = useAuth();
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
        borderBottom: 1,
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
            component="a"
            href="/"
            aria-label={`${settings.organizationName} — AuditSector home`}
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
            <ShieldOutlinedIcon
              color="primary"
              aria-hidden="true"
              sx={{ fontSize: { xs: 28, md: 34 } }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                id="organization-name"
                variant="subtitle1"
                component="h2"
                noWrap
                sx={{
                  fontWeight: 700,
                  lineHeight: 1.2,
                  fontSize: { xs: '1rem', md: '1.15rem' },
                }}
              >
                {settings.organizationName}
              </Typography>
              <Typography
                variant="caption"
                component="span"
                color="text.secondary"
                noWrap
                sx={{ display: 'block', letterSpacing: '0.02em' }}
              >
                AuditSector
              </Typography>
            </Box>
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

        {isDesktop && (
          <Box
            component="nav"
            aria-label="Primary"
            sx={{ borderTop: 1, borderColor: 'divider' }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 52,
              }}
            >
              {navItems.map((item) => (
                <Button
                  key={item.href}
                  href={item.href}
                  color="inherit"
                  sx={{
                    color: 'text.secondary',
                    px: 1.5,
                    '&:hover': {
                      color: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
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
                  </Typography>
                  <Button
                    color="inherit"
                    onClick={signOut}
                    startIcon={<LogoutIcon />}
                    sx={{ color: 'text.secondary' }}
                  >
                    Sign out
                  </Button>
                </>
              )}
            </Box>
          </Box>
        )}
      </Container>

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
            <ListItem key={item.href} disablePadding>
              <ListItemButton component="a" href={item.href} onClick={closeDrawer}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
          {isAuthenticated && (
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => {
                  closeDrawer();
                  signOut();
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
