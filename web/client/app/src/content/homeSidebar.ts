import { ROUTES } from '../routes';

interface SidebarItemBase {
  /** Link text. */
  label: string;
  /** One line of supporting context, shown beneath the label. */
  description: string;
}

/** A link to a section of the homepage itself (`#anchor`). */
export interface SidebarSectionItem extends SidebarItemBase {
  anchor: string;
  path?: never;
}

/** A link to another page in the app. */
export interface SidebarPageItem extends SidebarItemBase {
  path: string;
  anchor?: never;
}

export type HomeSidebarItem = SidebarSectionItem | SidebarPageItem;

/**
 * Right-hand rail on the homepage.
 *
 * Defines the rail's entries in one place so the homepage component stays
 * presentational. Add entries here as the sub content is filled in: an item
 * either scrolls to a section on this page (`anchor`, matching that section's
 * `id`) or navigates to another route (`path`).
 *
 * TODO: Replace the placeholder destinations with the final sub content.
 */
export const HOME_SIDEBAR: readonly HomeSidebarItem[] = [
  {
    label: 'Scan activity',
    description: 'Reports scanned per month at a glance.',
    anchor: 'scan-activity',
  },
  {
    label: 'Recent audits',
    description: 'The latest reports published by your sources.',
    anchor: 'recent-audits',
  },
  {
    label: 'All audit reports',
    description: 'Browse, filter, and open the full report list.',
    path: ROUTES.auditReports,
  },
  {
    label: 'Categories',
    description: 'See how reports are grouped by topic.',
    path: ROUTES.categories,
  },
  {
    label: 'Settings & help',
    description: 'Update organization details or get help.',
    path: ROUTES.settings,
  },
] as const;
