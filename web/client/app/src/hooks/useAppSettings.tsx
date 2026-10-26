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
import {
  DEFAULT_SETTINGS,
  fetchAppSettings,
  type AppSettings,
} from '../api/settings';

export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SettingsContextValue {
  settings: AppSettings;
  status: SettingsStatus;
  /** True while the settings request is in flight. */
  isLoading: boolean;
  /** True when `settings` are defaults because the fetch failed or has not run. */
  usingDefaults: boolean;
  /** Ensures settings are loaded. Safe to call repeatedly. */
  load: () => void;
  /** Applies changes locally so every consumer updates immediately. */
  applySettings: (updates: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);

/**
 * Loads application settings once and shares them with every consumer.
 *
 * The request runs on mount so header content (such as the organization name)
 * is available immediately, and so opening the "Forgot password?" dialog does
 * not trigger a second request. Failures fall back to `DEFAULT_SETTINGS` and
 * are not surfaced to the user — a missing settings endpoint should never
 * block the app.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<SettingsStatus>('idle');

  // Guards against duplicate requests (StrictMode double-invocation, retries).
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setStatus('loading');

    fetchAppSettings()
      .then((nextSettings) => {
        setSettings(nextSettings);
        setStatus('ready');
      })
      .catch(() => {
        // Keep defaults. Consumers always render a usable value.
        setStatus('error');
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applySettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...updates }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      status,
      isLoading: status === 'loading',
      usingDefaults: status !== 'ready',
      load,
      applySettings,
    }),
    [settings, status, load, applySettings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error('useAppSettings must be used within a SettingsProvider');
  }

  return context;
}
