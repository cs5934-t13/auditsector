import { ROUTES } from '../routes';

export interface NavItem {
  label: string;
  path: string;
}

/** Public navigation, shown before a user signs in. */
export const publicNav: readonly NavItem[] = [
  { label: 'About', path: `${ROUTES.landing}#about` },
] as const;

/** Application navigation, shown only to signed-in users. */
export const appNav: readonly NavItem[] = [
  { label: 'Home', path: ROUTES.home },
  { label: 'Audit Reports', path: ROUTES.auditReports },
  { label: 'Tags', path: ROUTES.tags },
  { label: 'Settings', path: ROUTES.settings },
] as const;

/** Returns the navigation appropriate for the current auth state. */
export function navFor(isAuthenticated: boolean): readonly NavItem[] {
  return isAuthenticated ? appNav : publicNav;
}
