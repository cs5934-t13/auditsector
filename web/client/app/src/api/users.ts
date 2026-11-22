import {
  isManagedUser,
  type ManagedUser,
  type UserInput,
} from '../utils/users.ts';

export class UsersApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'UsersApiError';
    this.status = details.status;
    this.code = details.code;
  }
}

interface RequestOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(
  body: unknown,
  fallback: string,
  status: number,
): { message: string; code?: string } {
  if (isRecord(body)) {
    if (isRecord(body.error)) {
      const { code, message } = body.error;
      return {
        message: typeof message === 'string' && message.trim() ? message : fallback,
        code: typeof code === 'string' ? code : undefined,
      };
    }

    // `/login`-style envelope: { status: 'failed', reason: '...' }. A 401 keeps
    // the clearer "session expired" wording instead of "authentication
    // required", which tells the user what to do next.
    if (status !== 401 && typeof body.reason === 'string' && body.reason.trim()) {
      return { message: body.reason };
    }
  }

  return { message: fallback };
}

function failureMessage(status: number): string {
  if (status === 401) {
    return 'Your session has expired. Sign in again.';
  }
  if (status === 403) {
    return 'You are not allowed to make this change.';
  }
  if (status === 404) {
    return 'That user no longer exists.';
  }
  if (status === 409) {
    return 'A user with that username or e-mail address already exists.';
  }
  return 'The request could not be completed. Please try again.';
}

function requestFailure(timeout: AbortSignal, signal: AbortSignal): UsersApiError {
  if (timeout.aborted) {
    return new UsersApiError('The request timed out.', { code: 'REQUEST_TIMEOUT' });
  }
  if (signal.aborted) {
    return new UsersApiError('The request was cancelled.', { code: 'REQUEST_ABORTED' });
  }
  return new UsersApiError('Could not reach the server.', { code: 'NETWORK_ERROR' });
}

async function request(
  path: string,
  init: RequestInit,
  { fetcher = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, signal }: RequestOptions = {},
): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    if (requestSignal.aborted) {
      throw requestSignal.reason;
    }
    response = await fetcher(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      credentials: 'same-origin',
      signal: requestSignal,
    });
  } catch {
    throw requestFailure(timeout, requestSignal);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (requestSignal.aborted) {
      throw requestFailure(timeout, requestSignal);
    }
  }

  if (!response.ok) {
    const { message, code } = errorMessage(
      body,
      failureMessage(response.status),
      response.status,
    );
    throw new UsersApiError(message, { status: response.status, code });
  }

  return body;
}

function expectUser(body: unknown, status: number): ManagedUser {
  if (isRecord(body) && isManagedUser(body.data)) {
    return body.data;
  }

  throw new UsersApiError(
    'The server returned an unexpected response. Refresh before trying again.',
    { status, code: 'UNEXPECTED_RESPONSE' },
  );
}

/**
 * Lists users. Administrators only.
 *
 * `includeInactive` returns archived accounts too, which the Manage Users
 * screen needs so it can offer Restore.
 */
export async function fetchUsers(
  { includeInactive = true }: { includeInactive?: boolean } = {},
  options: RequestOptions = {},
): Promise<ManagedUser[]> {
  const query = includeInactive ? '?include_inactive=true' : '';
  const body = await request(`/api/user${query}`, { method: 'GET' }, options);

  if (isRecord(body) && Array.isArray(body.data) && body.data.every(isManagedUser)) {
    return body.data;
  }

  throw new UsersApiError(
    'The server returned an unexpected user list. Refresh before trying again.',
    { code: 'UNEXPECTED_RESPONSE' },
  );
}

/** Fetches one user. Admins may fetch anyone; users may fetch themselves. */
export async function fetchUser(
  userId: number,
  options: RequestOptions = {},
): Promise<ManagedUser> {
  const body = await request(`/api/user/${userId}`, { method: 'GET' }, options);
  return expectUser(body, 200);
}

/** Creates a user and returns the stored record. Administrators only. */
export async function createUser(
  input: UserInput,
  options: RequestOptions = {},
): Promise<ManagedUser> {
  const body = await request(
    '/api/user',
    { method: 'POST', body: JSON.stringify(input) },
    options,
  );

  if (isRecord(body) && isManagedUser(body.data)) {
    return body.data;
  }

  // The server reports the new id when the row could not be read back.
  if (isRecord(body) && isRecord(body.data) && typeof body.data.user_id === 'number') {
    return fetchUser(body.data.user_id, options);
  }

  throw new UsersApiError(
    'The server returned an unexpected response. The user may have been created; refresh to check.',
    { code: 'UNEXPECTED_RESPONSE' },
  );
}

/**
 * Updates any subset of a user's properties.
 *
 * The id is carried in the URL only, so the request can never change it.
 */
export async function updateUser(
  userId: number,
  input: UserInput,
  options: RequestOptions = {},
): Promise<ManagedUser> {
  const body = await request(
    `/api/user/${userId}`,
    { method: 'PUT', body: JSON.stringify(input) },
    options,
  );

  if (isRecord(body) && isManagedUser(body.data)) {
    return body.data;
  }

  return fetchUser(userId, options);
}

/** Archives a user (status becomes `INACTIVE`). Administrators only. */
export async function archiveUser(
  userId: number,
  options: RequestOptions = {},
): Promise<void> {
  await request(`/api/user/${userId}`, { method: 'DELETE' }, options);
}

/** Restores an archived user. Administrators only. */
export async function restoreUser(
  userId: number,
  options: RequestOptions = {},
): Promise<void> {
  await request(`/api/user/${userId}/restore`, { method: 'POST' }, options);
}

/** Returns the signed-in user's own record. */
export async function fetchProfile(options: RequestOptions = {}): Promise<ManagedUser> {
  const body = await request('/api/profile', { method: 'GET' }, options);
  return expectUser(body, 200);
}

/**
 * Updates the signed-in user's own record.
 *
 * A password change must include `current_password`; the server rejects it
 * otherwise so a stolen session cannot silently take over the account.
 */
export async function updateProfile(
  input: UserInput,
  options: RequestOptions = {},
): Promise<ManagedUser> {
  const body = await request(
    '/api/profile',
    { method: 'PUT', body: JSON.stringify(input) },
    options,
  );

  if (isRecord(body) && isManagedUser(body.data)) {
    return body.data;
  }

  return fetchProfile(options);
}
