/**
 * Risk-level activity data for the homepage chart.
 *
 * TODO: Replace with real data once the backend exposes an aggregate endpoint
 * (for example `GET /audits/risk-over-time`). Shape mirrors what the chart
 * needs: one entry per period, oldest first, with a count for each level.
 *
 * Keeping the per-level shape (rather than a single average score) means the
 * chart can show how the mix of severities moves, not just one number.
 */
import type { RiskCounts } from '../utils/risk';

export interface RiskActivityPoint extends RiskCounts {
  /** Short period label shown on the x axis (for example `Jan`). */
  period: string;
}

/**
 * Reports per risk level per month, oldest first. Placeholder values whose
 * per-period totals loosely track `SCAN_ACTIVITY`, so the two homepage charts
 * tell a consistent story.
 */
export const RISK_ACTIVITY: readonly RiskActivityPoint[] = [
  { period: 'Jan', INFO: 16, LOW: 14, MEDIUM: 9, HIGH: 3, CRITICAL: 0 },
  { period: 'Feb', INFO: 21, LOW: 19, MEDIUM: 13, HIGH: 4, CRITICAL: 1 },
  { period: 'Mar', INFO: 18, LOW: 17, MEDIUM: 11, HIGH: 4, CRITICAL: 1 },
  { period: 'Apr', INFO: 26, LOW: 25, MEDIUM: 16, HIGH: 7, CRITICAL: 2 },
  { period: 'May', INFO: 31, LOW: 30, MEDIUM: 21, HIGH: 9, CRITICAL: 3 },
  { period: 'Jun', INFO: 28, LOW: 29, MEDIUM: 20, HIGH: 8, CRITICAL: 3 },
  { period: 'Jul', INFO: 33, LOW: 38, MEDIUM: 26, HIGH: 12, CRITICAL: 3 },
] as const;
