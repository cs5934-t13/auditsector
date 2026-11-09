import Chip from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  riskLevelColor,
  riskLevelDescription,
  riskLevelLabel,
} from '../content/riskLevels';
import type { RiskLevel } from '../utils/risk';
import { alpha } from '@mui/material/styles';

interface RiskLevelChipProps {
  /** Classified level, or `null` for a report that has not been rated. */
  level: RiskLevel | null | undefined;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

/**
 * Compact badge for a report's risk level.
 *
 * The level is always spelled out in the label, so severity is never conveyed
 * by color alone. `aria-label` adds the one-line explanation, which a screen
 * reader announces with the level instead of leaving the color bare.
 */
export default function RiskLevelChip({
  level,
  size = 'small',
  sx,
}: RiskLevelChipProps) {
  const color = riskLevelColor(level);

  return (
    <Chip
      label={riskLevelLabel(level)}
      size={size}
      aria-label={`Risk level: ${riskLevelLabel(level)}. ${riskLevelDescription(level)}`}
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
