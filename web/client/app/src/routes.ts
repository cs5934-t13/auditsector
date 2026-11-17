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
  tags: '/tags',
  settings: '/settings',
  manageUsers: '/settings/users',
  /** Tag detail page. Use `tagPath` to build a concrete URL. */
  tag: '/tag/:tagname',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

// Re-exported so callers have a single import point for routing concerns.
export { tagPath };
