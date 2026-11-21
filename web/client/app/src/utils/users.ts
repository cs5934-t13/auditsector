/**
 * User-management wire types and pure helpers.
 *
 * Kept free of React and `fetch` so the Node test runner can import it
 * directly (extensionless TS imports only resolve in Vite; tests must not pull
 * in app modules that use them).
 */

export type UserRole = 'ADMIN' | 'ANALYST';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export const USER_ROLES: readonly UserRole[] = ['ADMIN', 'ANALYST'] as const;

export const USER_STATUSES: readonly UserStatus[] = ['ACTIVE', 'INACTIVE'] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  ANALYST: 'Analyst',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Archived',
};

/** A user as returned by `GET /api/user`. Never includes a password hash. */
export interface ManagedUser {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  user_role: UserRole;
  user_status: UserStatus;
  created_at: string;
  updated_at: string;
}

/** Fields a caller may send to create or update a user. */
export interface UserInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  username?: string;
  password?: string;
  /** Required when a non-admin changes their own password. */
  current_password?: string;
  user_role?: UserRole;
  user_status?: UserStatus;
}

/** Maximum lengths enforced by the `users` table. */
export const USER_FIELD_LIMITS = {
  first_name: 100,
  last_name: 100,
  email: 255,
  username: 100,
} as const;

export type UserField = keyof typeof USER_FIELD_LIMITS;

/**
 * Validates a single profile field.
 *
 * Returns an error message, or `null` when the value is acceptable. Blank
 * values are rejected because every one of these columns is `NOT NULL`.
 */
export function userFieldError(field: UserField, value: string): string | null {
  const label = USER_FIELD_LABELS[field];
  const trimmed = value.trim();

  if (!trimmed) {
    return `${label} is required.`;
  }

  if (trimmed.length > USER_FIELD_LIMITS[field]) {
    return `${label} must be at most ${USER_FIELD_LIMITS[field]} characters.`;
  }

  if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid e-mail address.';
  }

  return null;
}

const USER_FIELD_LABELS: Record<UserField, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'E-mail',
  username: 'Username',
};

/** Returns the first validation error in a payload, or `null`. */
export function userInputError(input: UserInput): string | null {
  for (const field of Object.keys(USER_FIELD_LIMITS) as UserField[]) {
    const value = input[field];

    if (value === undefined) {
      continue;
    }

    const error = userFieldError(field, value);
    if (error) {
      return error;
    }
  }

  if ('password' in input && input.password !== undefined && input.password.length === 0) {
    return 'Password must not be empty.';
  }

  return null;
}

/** A new password must be typed the same way twice. */
export function passwordChangeError(
  password: string,
  confirm: string,
): string | null {
  if (!password) {
    return 'Enter a new password.';
  }

  if (password !== confirm) {
    return 'The new passwords do not match.';
  }

  return null;
}

/** Options for the signed-in user's own account form. */
export interface ProfileInput {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password?: string;
  current_password?: string;
}

/**
 * Validates the self-service account form.
 *
 * `password`/`current_password` are only checked when a new password is being
 * set; leaving both blank keeps the existing password.
 */
export function profileInputError(
  input: ProfileInput,
  confirmPassword = '',
): string | null {
  const baseError = userInputError(input);
  if (baseError) {
    return baseError;
  }

  // No new password means the existing one is kept, so there is nothing to
  // confirm even if `current_password` was typed.
  if (!input.password) {
    return null;
  }

  if (!input.current_password) {
    return 'Enter your current password.';
  }

  return passwordChangeError(input.password, confirmPassword);
}

/** True when the payload changes any editable property. */
export function hasUserChanges(input: UserInput): boolean {
  return Object.entries(input).some(
    ([, value]) => value !== undefined && value !== '',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'ANALYST';
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === 'ACTIVE' || value === 'INACTIVE';
}

/**
 * Narrowing guard for a user record from the API.
 *
 * `password_hash` is never accepted, even if a future server regression leaks
 * it into the response.
 */
export function isManagedUser(value: unknown): value is ManagedUser {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.user_id === 'number' &&
    Number.isSafeInteger(value.user_id) &&
    value.user_id > 0 &&
    typeof value.first_name === 'string' &&
    typeof value.last_name === 'string' &&
    typeof value.email === 'string' &&
    typeof value.username === 'string' &&
    isUserRole(value.user_role) &&
    isUserStatus(value.user_status) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

/** Formats a user's display name, falling back to the username. */
export function displayName(user: Pick<ManagedUser, 'first_name' | 'last_name' | 'username'>): string {
  const name = `${user.first_name} ${user.last_name}`.trim();
  return name || user.username;
}
