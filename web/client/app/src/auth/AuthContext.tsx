import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * User roles.
 *
 * Mirrors the `user_role` enum on the backend `users` table.
 * `ADMIN` users see the administrative settings section.
 */
export type UserRole = 'ADMIN' | 'ANALYST';

export interface AuthUser {
  username: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  signIn: (username: string, role?: UserRole) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'auditsector:user';

/**
 * Query parameter used to preview the signed-in app, e.g. `/?as=jdoe`.
 *
 * Add `&role=ADMIN` to preview the administrator experience. This is a
 * development convenience, not authentication: it bypasses the backend
 * entirely. It is disabled in production builds unless
 * `VITE_DEMO_AUTH=true` is set at build time.
 */
const PREVIEW_PARAM = 'as';
const PREVIEW_ROLE_PARAM = 'role';

function previewAuthEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEMO_AUTH === 'true';
}

interface PreviewAuth {
  username: string;
  role: UserRole;
}

/** Reads `?as=...&role=...`, or null when preview auth is off. */
function readPreviewAuth(): PreviewAuth | null {
  if (!previewAuthEnabled()) {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const username = params.get(PREVIEW_PARAM)?.trim();
    if (!username) {
      return null;
    }

    const role = params.get(PREVIEW_ROLE_PARAM)?.trim().toUpperCase();
    return {
      username,
      role: role === 'ADMIN' ? 'ADMIN' : 'ANALYST',
    };
  } catch {
    return null;
  }
}

/** Removes preview params from the address bar without reloading. */
function stripPreviewParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(PREVIEW_PARAM);
    url.searchParams.delete(PREVIEW_ROLE_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
  } catch {
    // If the URL cannot be parsed, leaving it untouched is harmless.
  }
}

/**
 * Reads a previously signed-in user so a page refresh does not sign the user
 * out. `sessionStorage` is used deliberately: the session is scoped to the tab
 * and is cleared when the tab closes. Storage access is wrapped because it can
 * throw in private browsing or when storage is disabled.
 */
function readStoredUser(): AuthUser | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof parsed.username !== 'string') {
      return null;
    }

    return {
      username: parsed.username,
      role: parsed.role === 'ADMIN' ? 'ADMIN' : 'ANALYST',
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Captured once during initialization. It cannot be re-read inside the effect
  // because a route redirect (for example `/` -> `/home`) may replace the URL
  // first, removing `?as=` before the effect runs.
  const [previewAuth] = useState(readPreviewAuth);

  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = readStoredUser();
    if (stored) {
      return stored;
    }

    return previewAuth
      ? { username: previewAuth.username, role: previewAuth.role }
      : null;
  });

  const signIn = useCallback((username: string, role: UserRole = 'ANALYST') => {
    const nextUser: AuthUser = { username, role };
    setUser(nextUser);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      // Storage can be unavailable; the in-memory session still works.
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }, []);

  // Persist and clean up a preview sign-in so it survives a refresh but leaves
  // no trace in the address bar.
  useEffect(() => {
    if (!previewAuth) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ username: previewAuth.username, role: previewAuth.role }),
      );
    } catch {
      // Non-fatal: the in-memory session still works for this page load.
    }

    stripPreviewParam();
  }, [previewAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isAdmin: user?.role === 'ADMIN',
      signIn,
      signOut,
    }),
    [user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
