import { useCallback } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import ChartPanel from './ChartPanel';
import {
  fetchScanActivity,
  type ActivityRange,
  type ScanActivityPoint,
} from '../api/homeActivity';
import { useActivityData } from '../hooks/useActivityData';
import { LINK_ACCENT } from '../theme';

/** Plot height, excluding the axis labels MUI X adds around it. */
const CHART_HEIGHT = 260;

/** Heading id, also used to name the homepage section that wraps this panel. */
export const SCAN_CHART_HEADING_ID = 'scan-activity-heading';

interface ScanActivityChartProps {
  sx?: SxProps<Theme>;
}

/** One-line summary of the loaded series. */
function summarize(data: readonly ScanActivityPoint[]): string {
  const total = data.reduce((sum, point) => sum + point.scans, 0);
  return data.length
    ? `Audit records added each period, newest last. ${total.toLocaleString()} records in the last ${data.length} periods.`
    : 'Audit records added over time.';
}

/**
 * Line chart of audit records added per period.
 *
 * Loads live aggregates from `GET /api/audits/scan-activity`, which buckets
 * `audit_headers.created_at`. The schema has no completed-at column, so that
 * insertion timestamp is the closest available proxy for a scan time.
 *
 * The plot itself is MUI X's `LineChart`; `ChartPanel` supplies the page
 * framing (heading, summary, loading/empty/error states).
 *
 * Accessibility: MUI X owns the chart's accessible name and description via
 * `title` and `desc`. Do not set `aria-labelledby` here — DOM props land on the
 * inner SVG layer, which MUI X marks `aria-hidden`.
 */
export default function ScanActivityChart({ sx }: ScanActivityChartProps) {
  // The endpoint owns its default range, so the chart sends no dates.
  const load = useCallback(
    (_range: ActivityRange, init: { signal: AbortSignal }) =>
      fetchScanActivity({}, init),
    [],
  );
  const { state, retry } = useActivityData(load, {}, 'scan activity');

  const data = state.status === 'ready' ? state.data : [];
  const summary = summarize(data);

  return (
    <ChartPanel
      id="scan-activity"
      headingId={SCAN_CHART_HEADING_ID}
      title="Reports scanned over time"
      summary={summary}
      loading={state.status === 'loading'}
      error={state.status === 'error' ? state.error : undefined}
      onRetry={retry}
      pointCount={data.length}
      emptyMessage="No audit records have been added yet."
      sx={sx}
    >
      <LineChart
        height={CHART_HEIGHT}
        // One series, so a legend would only repeat the heading directly above.
        hideLegend
        series={[
          {
            label: 'Reports scanned',
            data: data.map((point) => point.scans),
            color: LINK_ACCENT,
            curve: 'linear',
            valueFormatter: (value: number | null) =>
              value == null ? '—' : `${value.toLocaleString()} reports`,
          },
        ]}
        xAxis={[{ data: data.map((point) => point.label), scaleType: 'point' }]}
        yAxis={[{ width: 44 }]}
        grid={{ horizontal: true }}
        // Fill the panel width; without this MUI X falls back to a fixed width
        // and the plot stops changing size with the panel.
        sx={{ width: '100%' }}
        title="Reports scanned over time"
        desc={summary}
      />
    </ChartPanel>
  );
}
