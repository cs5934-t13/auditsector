/**
 * Default user-facing message content.
 *
 * These values are used until the backend supplies settings via
 * `GET /api/settings` (see `src/api/settings.ts`), and remain the fallback if
 * that request fails. TODO: Replace once backend settings are fully implemented
 *
 * The three rich-text settings ("password help", "general help", "contact") are
 * HTML, because an administrator can format them in the settings editor. Only
 * the tags whitelisted in `utils/richtext.ts` survive, and every value is
 * sanitized before it is rendered, so these strings are never trusted markup.
 */

/** Fallback organization name shown in the header. */
export const ORGANIZATION_NAME = 'City of Alexandria';

/** Fallback when a user selects "Forgot password?" on the sign-in form. */
export const PASSWORD_RESET_MESSAGE =
  '<p>To reset your password, contact the administrators.</p>';

/** Fallback text shown above the generic help section. */
export const GENERAL_HELP =
  '<p>For help using Audit Sector, review the guidance below or contact your administrator.</p>';

/** Fallback contact text shown in the footer. */
export const CONTACT =
  '<p>Contact us at <a href="mailto:team@auditsector.example">team@auditsector.example</a>.</p>';

