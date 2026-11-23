import { tagPath } from './utils/tags';

/**
 * Route paths.
 *
 * Kept in one place so navigation, links, and route definitions cannot drift.
 * Signed-in destinations are top-level paths; signed-out content is a single
 * landing route.
 */
export const ROUTES = {
  landing: '/',
  home: '/home',
  auditReports: '/audits',
  /** Audit report detail page. Use `auditReportPath` to build a concrete URL. */
  auditReport: '/audits/:auditId',
  tags: '/tags',
  settings: '/settings',
  manageUsers: '/settings/users',
  /** Tag detail page. Use `tagPath` to build a concrete URL. */
  tag: '/tag/:tagname',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Builds the canonical URL for one audit report.
 *
 * The id comes from the API and is opaque, so it is encoded rather than assumed
 * to be URL-safe. Callers that already hold an encoded segment still get the
 * same result.
 */
export function auditReportPath(auditId: string | number): string {
  return `${ROUTES.auditReports}/${encodeURIComponent(String(auditId))}`;
}

// Re-exported so callers have a single import point for routing concerns.
export { tagPath };
