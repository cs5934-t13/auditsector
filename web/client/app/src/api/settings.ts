import {
  CONTACT,
  GENERAL_HELP,
  ORGANIZATION_NAME,
  PASSWORD_RESET_MESSAGE,
} from '../content/messages.ts';
import {
  isRichTextEmpty,
  plainTextToRichText,
  sanitizeRichText,
} from '../utils/richtext.ts';

export interface AppSettings {
  /** Header text (locality) shown in the header, e.g. "City of Alexandria". */
  organizationName: string;
  /** Rich-text HTML shown in the "Forgot password?" dialog. */
  passwordResetMessage: string;
  /** Rich-text HTML shown above the generic help section. */
  generalHelp: string;
  /** Rich-text HTML shown in the footer's Contact column. */
  contact: string;
}

/**
 * Used while settings are loading or when the request fails, so the UI always
 * has something useful to show.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  organizationName: ORGANIZATION_NAME,
  passwordResetMessage: PASSWORD_RESET_MESSAGE,
  generalHelp: GENERAL_HELP,
  contact: CONTACT,
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
  contact?: unknown;
}

interface SettingsFields {
  organization_name?: unknown;
  organizationName?: unknown;
  password_reset_message?: unknown;
  passwordResetMessage?: unknown;
  general_help?: unknown;
  generalHelp?: unknown;
  contact?: unknown;
}

/** Unwraps the `{ "data": { ... } }` envelope when present. */
function unwrap(response: SettingsResponse): SettingsFields {
  if (response.data && typeof response.data === 'object') {
    return response.data;
  }

  return response;
}

const REQUEST_TIMEOUT_MS = 5_000;

interface RequestOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function pickString(
  value: unknown,
  fallback: string,
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

/**
 * Normalizes a rich-text setting for rendering.
 *
 * Three cases matter:
 * - A value saved before rich text existed is plain text: it is converted to
 *   HTML so paragraph and line breaks survive.
 * - A value with no readable content (`<p><br></p>`) falls back to the default,
 *   mirroring how an empty plain string used to fall back.
 * - Anything else is sanitized, so a row edited directly in the database cannot
 *   inject markup into the app.
 */
function pickRichText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (isRichTextEmpty(trimmed)) {
    return fallback;
  }

  return plainTextToRichText(sanitizeRichText(trimmed));
}

function pickMessage(data: SettingsResponse): string {
  return pickRichText(
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
  return pickRichText(
    data.general_help ?? data.generalHelp,
    DEFAULT_SETTINGS.generalHelp,
  );
}

function pickContact(data: SettingsResponse): string {
  return pickRichText(data.contact, DEFAULT_SETTINGS.contact);
}

/**
 * Fetches application settings from the backend.
 *
 * `GET /api/settings` is public, so the sign-in page can render the
 * organization name and reset message before a session exists. nginx strips the
 * `/api` prefix, so this resolves to `/settings` on the Flask server. Callers
 * should treat any error as "use the default settings".
 *
 * @throws {Error} If the request fails or returns a non-2xx status.
 */
export async function fetchAppSettings({
  fetcher = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal,
}: RequestOptions = {}): Promise<AppSettings> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher('/api/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
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
      contact: pickContact(data),
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** Wire format for saving settings; snake_case matches the API contracts. */
export interface SettingsUpdate {
  organization_name?: string;
  password_reset_message?: string;
  general_help?: string;
  contact?: string;
}

/**
 * Saves settings to the backend.
 *
 * Callers should treat a failure as "keep the local value" — the admin form
 * applies changes optimistically.
 *
 * @throws {Error} If the request fails or returns a non-2xx status.
 */
export async function updateAppSettings(
  update: SettingsUpdate,
  { fetcher = fetch, signal }: RequestOptions = {},
): Promise<void> {
  const response = await fetcher('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify(update),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Settings update failed with status ${response.status}`);
  }
}
