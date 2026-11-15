import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import SectionPanel from './SectionPanel';
import {
  RISK_ACTIVITY,
  type RiskActivityPoint,
} from '../content/riskActivity';
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

interface RiskLevelChartProps {
  /** Data to plot, oldest first. Defaults to the placeholder series. */
  data?: readonly RiskActivityPoint[];
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

/**
 * Stacked bar chart of audit reports by risk level per period.
 *
 * Sits beside `ScanActivityChart` on the homepage: that chart shows how many
 * reports were scanned, this one shows how severe they were. Stacking the
 * levels means each bar's height is the total reports for the period, with the
 * bands showing the mix, so the two charts stay consistent.
 *
 * Accessibility: MUI X owns the chart's accessible name and description via
 * `title` and `desc`. Do not set `aria-labelledby` here — DOM props land on the
 * inner SVG layer, which MUI X marks `aria-hidden`. The summary line below the
 * heading restates the headline numbers as text.
 */
export default function RiskLevelChart({
  data = RISK_ACTIVITY,
  sx,
}: RiskLevelChartProps) {
  const totals = totalsOf(data);
  const rated = totalRiskCounts(totals);
  const highRisk = highRiskCount(totals);
  const average = averageRiskScoreOfCounts(totals);

  const summary = data.length
    ? `Audit reports by risk level each month, newest last. ${rated.toLocaleString()} rated reports over the last ${data.length} months, average score ${formatScore(average)} of 5, ${highRisk.toLocaleString()} at high or critical.`
    : 'No risk-classified reports have been scanned yet.';

  return (
    <SectionPanel sx={sx}>
      <Typography variant="h5" component="h2">
        Risk levels over time
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {summary}
      </Typography>

      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Risk-classified reports will appear here once reports are scanned.
        </Typography>
      ) : (
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
          xAxis={[
            {
              data: data.map((point) => point.period),
              scaleType: 'band',
            },
          ]}
          yAxis={[{ width: 44 }]}
          grid={{ horizontal: true }}
          borderRadius={2}
          // Fill the panel width; without this MUI X falls back to a fixed
          // width and the plot stops changing size with the panel.
          sx={{ width: '100%' }}
          title="Risk levels over time"
          desc={summary}
        />
      )}
    </SectionPanel>
  );
}
