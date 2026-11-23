import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import SectionPanel from './SectionPanel';
import { SCROLL_OFFSET } from '../content/layout';
import type { HomeActivityApiError } from '../api/homeActivity';

interface ChartPanelProps {
  /** Anchor id, matching the quick-links rail entry that scrolls here. */
  id: string;
  /** Heading id, referenced by the panel's own `aria-labelledby`. */
  headingId: string;
  /** Panel heading text. */
  title: string;
  /** Supporting line under the heading, summarizing the plotted data. */
  summary: string;
  /** `true` while the series is loading. */
  loading: boolean;
  /** Request failure, if any. */
  error?: HomeActivityApiError;
  /** Called when the user asks to retry a failed request. */
  onRetry: () => void;
  /** Shown instead of the chart when the series is empty. */
  emptyMessage: string;
  /** Number of buckets loaded, so an empty series can be distinguished. */
  pointCount: number;
  /** Layout overrides forwarded to the surrounding panel. */
  sx?: SxProps<Theme>;
  /** The chart itself. Only rendered when `pointCount > 0`. */
  children: ReactNode;
}

/**
 * Frame shared by the two homepage activity charts.
 *
 * Both panels have the same heading/summary/empty/error/loading structure, and
 * both must keep that structure while their data is in flight or missing. The
 * chart component is passed in as `children` so this file owns the framing only.
 */
export default function ChartPanel({
  id,
  headingId,
  title,
  summary,
  loading,
  error,
  onRetry,
  emptyMessage,
  pointCount,
  sx,
  children,
}: ChartPanelProps) {
  return (
    <SectionPanel
      component="section"
      id={id}
      aria-labelledby={headingId}
      aria-busy={loading}
      sx={[{ scrollMarginTop: SCROLL_OFFSET }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Typography id={headingId} variant="h5" component="h2">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {summary}
      </Typography>

      {loading ? (
        <Skeleton variant="rounded" height={260} role="status" aria-label={`Loading ${title.toLowerCase()}`} />
      ) : error ? (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error">{error.message}</Alert>
          {error.status !== 401 && <Button onClick={onRetry}>Retry</Button>}
        </Stack>
      ) : pointCount === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      ) : (
        children
      )}
    </SectionPanel>
  );
}
