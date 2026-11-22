import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UserRole } from '../utils/users.ts';

/**
 * User roles.
 *
 * The union itself lives in `utils/users.ts`, next to the wire types and the
 * role labels, so the auth layer and the user-management screens cannot drift.
 * `ADMIN` users see the administrative settings section.
 */
export type { UserRole };

export interface AuthUser {
  username: string;
  role: UserRole;
  /**
   * Database id, when the server reports one. Used to hide destructive actions
   * on the signed-in user's own row. `null` for sessions restored from an older
   * server build that does not return it.
   */
  userId: number | null;
}

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the initial `/api/session` check is in flight. */
  isChecking: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Applies the result of a successful login. */
  signIn: (username: string, role?: UserRole, userId?: number | null) => void;
  /** Re-reads `/api/session`, e.g. after the user renames their own account. */
  refresh: () => void;
  /** Clears the server session and the local state. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Shape returned by `GET /api/session`. */
interface SessionResponse {
  data?: {
    authenticated?: boolean;
    username?: unknown;
    role?: unknown;
    user_id?: unknown;
  };
}

function normalizeRole(value: unknown): UserRole {
  return value === 'ADMIN' ? 'ADMIN' : 'ANALYST';
}

function normalizeUserId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

/**
 * Reads the authoritative session from the server.
 *
 * The role is deliberately never read from browser storage: `sessionStorage` is
 * writable by anyone with developer tools, so it is only useful as a hint, not
 * as proof of identity. A tampered value would otherwise render administrator
 * screens that the API would reject.
 */
async function fetchSession(signal: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch('/api/session', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Session request failed with status ${response.status}`);
  }

  const body = (await response.json()) as SessionResponse;
  const data = body.data;

  if (!data?.authenticated || typeof data.username !== 'string') {
    return null;
  }

  return {
    username: data.username,
    role: normalizeRole(data.role),
    userId: normalizeUserId(data.user_id),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');

  // Guards against repeated concurrent checks and updates after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    const controller = new AbortController();

    fetchSession(controller.signal)
      .then((session) => {
        if (!mounted.current) {
          return;
        }
        setUser(session);
        setStatus(session ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        // A failed check must not leave the app stuck on "checking": treat it
        // as signed out. Gated routes then redirect to the landing page.
        if (!mounted.current) {
          return;
        }
        setUser(null);
        setStatus('anonymous');
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    (username: string, role: UserRole = 'ANALYST', userId: number | null = null) => {
      setUser({ username, role, userId });
      setStatus('authenticated');
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Clear the server session first, otherwise a refresh would sign the user
    // straight back in from the still-valid Flask cookie.
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      // Network failure: still clear local state so the UI is consistent.
    }

    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isChecking: status === 'checking',
      isAuthenticated: status === 'authenticated',
      isAdmin: status === 'authenticated' && user?.role === 'ADMIN',
      signIn,
      refresh,
      signOut,
    }),
    [user, status, signIn, refresh, signOut],
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
