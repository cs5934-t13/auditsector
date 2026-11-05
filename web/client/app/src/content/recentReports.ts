/** One record from the proposed AW-103 recent-audits response. */
export interface RecentAuditRecord {
  audit_id: number;
  title: string;
  /** Stored audit date and time, without an assumed timezone. */
  audit_date: string;
  /** Record creation time, used to determine recency. */
  created_at: string;
}

// UI preview data only. These records do not come from the API or database.
// Ordered by created_at descending, then audit_id descending for equal times.
export const SAMPLE_RECENT_REPORTS: readonly RecentAuditRecord[] = [
  {
    audit_id: 10303,
    title: 'Sample procurement audit',
    audit_date: '2026-09-15T00:00:00',
    created_at: '2026-11-04T10:00:00',
  },
  {
    audit_id: 10302,
    title: 'Sample IT controls audit',
    audit_date: '2026-10-01T00:00:00',
    created_at: '2026-11-04T10:00:00',
  },
  {
    audit_id: 10301,
    title: 'Sample asset management audit',
    audit_date: '2026-11-01T00:00:00',
    created_at: '2026-11-03T10:00:00',
  },
  // Additional older examples let the preview exercise pagination (25 total).
  ...Array.from({ length: 22 }, (_, index): RecentAuditRecord => ({
    audit_id: 10300 - index,
    title: `Sample audit record ${index + 4}`,
    audit_date: '2026-08-01T00:00:00',
    created_at: '2026-11-02T10:00:00',
  })),
];
