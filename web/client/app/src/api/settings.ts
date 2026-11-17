import {
  GENERAL_HELP,
  ORGANIZATION_NAME,
  PASSWORD_RESET_MESSAGE,
} from '../content/messages';

export interface AppSettings {
  /** Header text (locality) shown in the header, e.g. "City of Alexandria". */
  organizationName: string;
  /** Message shown in the "Forgot password?" dialog. */
  passwordResetMessage: string;
  /** Text shown above the generic help section. */
  generalHelp: string;
}

/**
 * Used while settings are loading or when the request fails, so the UI always
 * has something useful to show.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  organizationName: ORGANIZATION_NAME,
  passwordResetMessage: PASSWORD_RESET_MESSAGE,
  generalHelp: GENERAL_HELP,
};

/**
 * Shape returned by `GET /api/settings`.
 *
 * Both snake_case (matching the existing API contracts) and camelCase are
 * accepted so the front-end does not break if the backend naming changes. The
 * settings may also arrive wrapped in the project's `{ "data": { ... } }`
 * envelope, which is what `GET /settings` returns.
 */
interface SettingsResponse {
  data?: SettingsFields;
  organization_name?: unknown;
  organizationName?: unknown;
  password_reset_message?: unknown;
  passwordResetMessage?: unknown;
  general_help?: unknown;
  generalHelp?: unknown;
}

interface SettingsFields {
  organization_name?: unknown;
  organizationName?: unknown;
  password_reset_message?: unknown;
  passwordResetMessage?: unknown;
  general_help?: unknown;
  generalHelp?: unknown;
}

/** Unwraps the `{ "data": { ... } }` envelope when present. */
function unwrap(response: SettingsResponse): SettingsFields {
  if (response.data && typeof response.data === 'object') {
    return response.data;
  }

  return response;
}

const REQUEST_TIMEOUT_MS = 5_000;

function pickString(
  value: unknown,
  fallback: string,
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function pickMessage(data: SettingsResponse): string {
  return pickString(
    data.password_reset_message ?? data.passwordResetMessage,
    DEFAULT_SETTINGS.passwordResetMessage,
  );
}

function pickOrganizationName(data: SettingsResponse): string {
  return pickString(
    data.organization_name ?? data.organizationName,
    DEFAULT_SETTINGS.organizationName,
  );
}

function pickGeneralHelp(data: SettingsResponse): string {
  return pickString(
    data.general_help ?? data.generalHelp,
    DEFAULT_SETTINGS.generalHelp,
  );
}

/**
 * Fetches application settings from the backend.
 *
 * `GET /api/settings` is not implemented yet; until it is, callers should treat
 * any error as "use the default settings". nginx strips the `/api` prefix, so
 * this resolves to `/settings` on the Flask server.
 *
 * @throws {Error} If the request fails or returns a non-2xx status.
 */
export async function fetchAppSettings(signal?: AbortSignal): Promise<AppSettings> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('/api/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Settings request failed with status ${response.status}`);
    }

    const data = unwrap((await response.json()) as SettingsResponse);

    return {
      organizationName: pickOrganizationName(data),
      passwordResetMessage: pickMessage(data),
      generalHelp: pickGeneralHelp(data),
    };
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** Wire format for saving settings; snake_case matches the API contracts. */
export interface SettingsUpdate {
  organization_name?: string;
  password_reset_message?: string;
  general_help?: string;
}

/**
 * Saves settings to the backend.
 *
 * `PUT /api/settings` is not implemented yet. Callers should treat a failure as
 * "keep the local value" — the admin form applies changes optimistically.
 *
 * @throws {Error} If the request fails or returns a non-2xx status.
 */
export async function updateAppSettings(
  update: SettingsUpdate,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(update),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Settings update failed with status ${response.status}`);
  }
}
