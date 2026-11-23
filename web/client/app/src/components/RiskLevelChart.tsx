import { useCallback } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import ChartPanel from './ChartPanel';
import {
  fetchRiskOverTime,
  type ActivityRange,
  type RiskActivityPoint,
} from '../api/homeActivity';
import { useActivityData } from '../hooks/useActivityData';
import { RISK_LEVEL_OPTIONS } from '../content/riskLevels';
import {
  averageRiskScoreOfCounts,
  emptyRiskCounts,
  highRiskCount,
  RISK_LEVELS,
  totalRiskCounts,
  type RiskCounts,
} from '../utils/risk';

/** Plot height, excluding the axis labels MUI X adds around it. */
const CHART_HEIGHT = 260;

/** Stacks every level's series into one bar per period. */
const STACK_ID = 'risk';

/** Heading id, also used to name the homepage section that wraps this panel. */
export const RISK_CHART_HEADING_ID = 'risk-levels-heading';

interface RiskLevelChartProps {
  sx?: SxProps<Theme>;
}

/** Per-level totals across every period in `data`. */
function totalsOf(data: readonly RiskActivityPoint[]): RiskCounts {
  return data.reduce<RiskCounts>((totals, point) => {
    for (const level of RISK_LEVELS) {
      totals[level] += point[level];
    }
    return totals;
  }, emptyRiskCounts());
}

/** Rounds to one decimal, the precision the average score is shown at. */
function formatScore(score: number | null): string {
  return score == null ? '—' : score.toFixed(1);
}

/** One-line summary of the loaded series, restated as text under the heading. */
function summarize(data: readonly RiskActivityPoint[]): string {
  if (data.length === 0) {
    return 'No risk-classified reports have been scanned yet.';
  }

  const totals = totalsOf(data);
  const rated = totalRiskCounts(totals);
  const highRisk = highRiskCount(totals);
  const average = averageRiskScoreOfCounts(totals);

  return `Audit reports by risk level each period, newest last. ${rated.toLocaleString()} rated reports over the last ${data.length} periods, average score ${formatScore(average)} of 5, ${highRisk.toLocaleString()} at high or critical.`;
}

/**
 * Stacked bar chart of audit reports by risk level per period.
 *
 * Loads live aggregates from `GET /api/audits/risk-over-time`; nothing on this
 * panel is placeholder data. Sits beside `ScanActivityChart`: that chart shows
 * how many reports were added, this one shows how severe they were. Stacking
 * the levels means each bar's height is the total reports for the period, with
 * the bands showing the mix.
 *
 * Accessibility: MUI X owns the chart's accessible name and description via
 * `title` and `desc`. Do not set `aria-labelledby` here — DOM props land on the
 * inner SVG layer, which MUI X marks `aria-hidden`. The summary line below the
 * heading restates the headline numbers as text.
 */
export default function RiskLevelChart({ sx }: RiskLevelChartProps) {
  // The risk endpoint owns its own default range, so the chart sends no dates.
  const load = useCallback(
    (_range: ActivityRange, init: { signal: AbortSignal }) =>
      fetchRiskOverTime({}, init),
    [],
  );
  const { state, retry } = useActivityData(load, {}, 'risk levels over time');

  const data = state.status === 'ready' ? state.data : [];
  const summary = state.status === 'ready'
    ? summarize(data)
    : 'Audit reports by risk level over time.';

  return (
    <ChartPanel
      id="risk-levels"
      headingId={RISK_CHART_HEADING_ID}
      title="Risk levels over time"
      summary={summary}
      loading={state.status === 'loading'}
      error={state.status === 'error' ? state.error : undefined}
      onRetry={retry}
      pointCount={data.length}
      emptyMessage="Risk-classified reports will appear here once reports are scanned."
      sx={sx}
    >
      <BarChart
        height={CHART_HEIGHT}
        // Five stacked series, so unlike the single-series scan chart the
        // legend is load-bearing: it is what names each color band.
        hideLegend={false}
        series={RISK_LEVEL_OPTIONS.map(({ level, label, color }) => ({
          label: `${label} risk`,
          data: data.map((point) => point[level]),
          color,
          stack: STACK_ID,
          valueFormatter: (value: number | null) =>
            value == null
              ? '—'
              : `${value.toLocaleString()} ${label.toLowerCase()} risk`,
        }))}
        xAxis={[{ data: data.map((point) => point.label), scaleType: 'band' }]}
        yAxis={[{ width: 44 }]}
        grid={{ horizontal: true }}
        borderRadius={2}
        // Fill the panel width; without this MUI X falls back to a fixed width
        // and the plot stops changing size with the panel.
        sx={{ width: '100%' }}
        title="Risk levels over time"
        desc={summary}
      />
    </ChartPanel>
  );
}
