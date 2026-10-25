/**
 * User-facing message content.
 *
 * These are static defaults for now. When the backend exposes settings, these
 * values should be fetched and passed into the components instead.
 */

/**
 * Shown when a user selects "Forgot password?" on the sign-in form.
 *
 * TODO: Populate from a backend setting (for example `GET /api/settings`)
 * rather than hard-coding it here.
 */
export const PASSWORD_RESET_MESSAGE =
  'To reset your password, contact the administrator.';
