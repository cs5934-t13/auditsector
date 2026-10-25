export interface NavItem {
  label: string;
  href: string;
}

/** Public navigation, shown before a user signs in. */
export const publicNav: readonly NavItem[] = [
  { label: 'About', href: '#about' },
] as const;

/** Application navigation, shown only to signed-in users. */
export const appNav: readonly NavItem[] = [
  { label: 'Overview', href: '#overview' },
  { label: 'Audits', href: '#audits' },
  { label: 'Sources', href: '#sources' },
] as const;

/** Returns the navigation appropriate for the current auth state. */
export function navFor(isAuthenticated: boolean): readonly NavItem[] {
  return isAuthenticated ? appNav : publicNav;
}
