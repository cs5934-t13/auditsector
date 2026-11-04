/**
 * Recent audit report data for the homepage grid.
 *
 * TODO: Replace with real data once the backend exposes the report list.
 */
export interface RecentAudit {
  /** Stable row id; the Data Grid requires one per row. */
  id: number;
  /** ISO `YYYY-MM-DD`, so the column sorts chronologically. */
  date: string;
  title: string;
  categories: string;
}

/** Placeholder rows, newest first. */
export const RECENT_AUDITS: readonly RecentAudit[] = [
  {
    id: 1,
    date: '2026-12-01',
    title: '2024 Annual Surveillance Technology Usage Review',
    categories: 'Information Technology; Regulatory Compliance',
  },
  {
    id: 2,
    date: '2026-08-20',
    title:
      'Audit of Comcast’s Compliance with Seattle’s Cable Customer Bill of Rights',
    categories: 'Regulatory Compliance',
  },
  {
    id: 3,
    date: '2026-08-15',
    title:
      'Asset Management: Strategic and coordinated approach needed to take on City’s long-standing issues',
    categories: 'Fixed Assets; Capital Projects',
  },
] as const;
