/**
 * Scan-activity data for the homepage chart.
 *
 * TODO: Replace with real data once the backend exposes a scans-over-time
 * endpoint. Shape mirrors what the chart needs: one entry per period, oldest
 * first.
 */
export interface ScanActivityPoint {
  /** Short period label shown on the x axis (for example `Jan`). */
  period: string;
  /** Number of audit reports scanned during the period. */
  scans: number;
}

/** Reports scanned per month, oldest first. Placeholder values. */
export const SCAN_ACTIVITY: readonly ScanActivityPoint[] = [
  { period: 'Jan', scans: 42 },
  { period: 'Feb', scans: 58 },
  { period: 'Mar', scans: 51 },
  { period: 'Apr', scans: 76 },
  { period: 'May', scans: 94 },
  { period: 'Jun', scans: 88 },
  { period: 'Jul', scans: 112 },
] as const;
