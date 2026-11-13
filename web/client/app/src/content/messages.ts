/**
 * Default user-facing message content.
 *
 * These values are used until the backend supplies settings via
 * `GET /api/settings` (see `src/api/settings.ts`), and remain the fallback if
 * that request fails.
 * TODO: Replace once backend settings are fully implemented
 */

/** Fallback organization name shown in the header. */
export const ORGANIZATION_NAME = 'City of Alexandria';

/** Fallback when a user selects "Forgot password?" on the sign-in form. */
export const PASSWORD_RESET_MESSAGE =
  'To reset your password, contact the administrators.';

/** Fallback text shown above the generic help section. */
export const GENERAL_HELP =
  'For help using Audit Sector, review the guidance below or contact your administrator.';
