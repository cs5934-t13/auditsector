/** A record returned by GET /audits/recent, in server-provided order. */
export interface RecentAuditRecord {
  /** UUIDs on the current schema; numeric IDs on existing, unmigrated databases. */
  audit_id: string | number;
  title: string;
  /** Stored audit date and time, without an assumed timezone. */
  audit_date: string;
  /** Record creation time, used to determine recency. */
  created_at: string;
  /**
   * Classified risk level, mirroring `audit_headers.risk_level`.
   *
   * `null` means the report has not been classified yet, which the table shows
   * as "Not rated" rather than hiding the row.
   */
  risk_level: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  /** Names of the tags attached to the report, ordered by name. */
  tags: readonly string[];
}
