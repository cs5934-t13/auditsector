import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './AppRoutes';
import { AuthProvider } from './auth/AuthContext';
import { SettingsProvider } from './hooks/useAppSettings';

/**
 * Root component.
 *
 * Providers sit outside the router so they are not remounted on navigation.
 * `BrowserRouter` is used because nginx serves `index.html` for unknown paths
 * (see `web.conf`), which keeps deep links working on refresh.
 */
export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
