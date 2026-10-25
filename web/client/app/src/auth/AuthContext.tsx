import {
  createContext,
  useCallback,
  useContext,
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
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

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
