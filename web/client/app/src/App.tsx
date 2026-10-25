import Box from '@mui/material/Box';
import AppFooter from './components/AppFooter';
import AppHeader from './components/AppHeader';
import { useAuth } from './auth/AuthContext';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      {/* First focusable element: lets keyboard users bypass the header. */}
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

      <AppHeader />

      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ flexGrow: 1 }}
      >
        {isAuthenticated ? <DashboardPage /> : <LandingPage />}
      </Box>

      <AppFooter />
    </Box>
  );
}
