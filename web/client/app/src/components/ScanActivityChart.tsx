import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import SectionPanel from './SectionPanel';
import { SCAN_ACTIVITY, type ScanActivityPoint } from '../content/scanActivity';
import { LINK_ACCENT } from '../theme';

/** Plot height, excluding the axis labels MUI X adds around it. */
const CHART_HEIGHT = 260;

interface ScanActivityChartProps {
  /** Data to plot, oldest first. Defaults to the placeholder series. */
  data?: readonly ScanActivityPoint[];
  sx?: SxProps<Theme>;
}

/**
 * Line chart of audit reports scanned per period.
 *
 * The plot itself is MUI X's `LineChart`; this component only supplies the
 * page framing (heading, summary, panel).
 *
 * Accessibility: MUI X owns the chart's accessible name and description via
 * `title` and `desc`. Do not set `aria-labelledby` here — DOM props land on the
 * inner SVG layer, which MUI X marks `aria-hidden`.
 */
export default function ScanActivityChart({
  data = SCAN_ACTIVITY,
  sx,
}: ScanActivityChartProps) {
  const total = data.reduce((sum, point) => sum + point.scans, 0);
  const summary = `Audit reports scanned each month, newest last.${data.length
    ? ` ${total.toLocaleString()} scans in the last ${data.length} months.`
    : ''
  }`;

  return (
    <SectionPanel sx={sx}>
      <Typography variant="h5" component="h2">
        Reports scanned over time
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {summary}
      </Typography>

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
        xAxis={[
          {
            data: data.map((point) => point.period),
            scaleType: 'point',
          },
        ]}
        yAxis={[{ width: 44 }]}
        grid={{ horizontal: true }}
        // Fill the panel width; without this MUI X falls back to a fixed width
        // and the plot stops changing size with the panel.
        sx={{ width: '100%' }}
        title="Reports scanned over time"
        desc={summary}
      />
    </SectionPanel>
  );
}
