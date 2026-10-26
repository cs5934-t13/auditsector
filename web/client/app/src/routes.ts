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
  categories: '/categories',
  settings: '/settings',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
