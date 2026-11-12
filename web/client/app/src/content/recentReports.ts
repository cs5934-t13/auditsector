/** A record returned by GET /audits/recent, in server-provided order. */
export interface RecentAuditRecord {
  /** UUIDs on the current schema; numeric IDs on existing, unmigrated databases. */
  audit_id: string | number;
  title: string;
  /** Stored audit date and time, without an assumed timezone. */
  audit_date: string;
  /** Record creation time, used to determine recency. */
  created_at: string;
}
