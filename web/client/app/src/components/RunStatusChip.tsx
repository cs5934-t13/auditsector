import Chip from '@mui/material/Chip';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import {
  runStatusColor,
  runStatusDescription,
  runStatusLabel,
} from '../content/runStatuses';
import type { RunStatus } from '../utils/runStatus';

interface RunStatusChipProps {
  /** Pipeline status, or `null` when the server did not report one. */
  status: RunStatus | null | undefined;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

/**
 * Compact badge for a report's scan status.
 *
 * Mirrors `RiskLevelChip`: the status is always spelled out in the label so it
 * is never conveyed by color alone, and `aria-label` adds the one-line
 * explanation for screen readers.
 */
export default function RunStatusChip({
  status,
  size = 'small',
  sx,
}: RunStatusChipProps) {
  const color = runStatusColor(status);

  return (
    <Chip
      label={runStatusLabel(status)}
      size={size}
      aria-label={`Scan status: ${runStatusLabel(status)}. ${runStatusDescription(status)}`}
      sx={[
        {
          fontWeight: 600,
          color,
          backgroundColor: alpha(color, 0.12),
          borderColor: alpha(color, 0.4),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      variant="outlined"
    />
  );
}
