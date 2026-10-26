import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface AuthUser {
  username: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (username: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'auditsector:user';

/**
 * Query parameter used to preview the signed-in app, e.g. `/?as=jdoe`.
 *
 * This is a development convenience, not authentication: it bypasses the
 * backend entirely. It is disabled in production builds unless
 * `VITE_DEMO_AUTH=true` is set at build time.
 */
const PREVIEW_PARAM = 'as';

function previewAuthEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEMO_AUTH === 'true';
}

/** Returns the username from `?as=...`, or null when preview auth is off. */
function readPreviewUsername(): string | null {
  if (!previewAuthEnabled()) {
    return null;
  }

  try {
    const raw = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);
    const username = raw?.trim();
    return username ? username : null;
  } catch {
    return null;
  }
}

/** Removes `?as=...` from the address bar without reloading or adding history. */
function stripPreviewParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(PREVIEW_PARAM);
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
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Captured once during initialization. It cannot be re-read inside the effect
  // because a route redirect (for example `/` -> `/home`) may replace the URL
  // first, removing `?as=` before the effect runs.
  const [previewUsername] = useState(readPreviewUsername);

  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = readStoredUser();
    if (stored) {
      return stored;
    }

    return previewUsername ? { username: previewUsername } : null;
  });

  const signIn = useCallback((username: string) => {
    const nextUser: AuthUser = { username };
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
    if (!previewUsername) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ username: previewUsername }),
      );
    } catch {
      // Non-fatal: the in-memory session still works for this page load.
    }

    stripPreviewParam();
  }, [previewUsername]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
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
