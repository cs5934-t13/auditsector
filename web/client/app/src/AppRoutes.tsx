import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import { ROUTES } from './routes';

// Route-level code splitting: the signed-out landing page loads eagerly (it is
// the first thing most visitors see), while authenticated pages are fetched on
// demand. Artificially heavy imports in reports/settings stay out of the
// initial bundle this way.
const HomePage = lazy(() => import('./pages/HomePage'));
const AuditReportsPage = lazy(() => import('./pages/AuditReportsPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

/** Minimal loading state announced to assistive technology. */
function RouteFallback() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}
    >
      <CircularProgress aria-label="Loading page" />
    </Box>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.landing} replace state={{ from: location }} />;
  }

  return children;
}

/**
 * Route table.
 *
 * The signed-out landing page and the signed-in pages are separate routes at
 * the same path; the guard decides which one is reachable.
 */
export default function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path={ROUTES.landing}
            element={
              isAuthenticated ? (
                <Navigate to={ROUTES.home} replace />
              ) : (
                <LandingPage />
              )
            }
          />
          <Route
            path={ROUTES.home}
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.auditReports}
            element={
              <RequireAuth>
                <AuditReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.categories}
            element={
              <RequireAuth>
                <CategoriesPage />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.settings}
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
