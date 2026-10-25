import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { FEATURE_COLUMNS } from '../content/layout';

interface FeatureGridProps {
  children: ReactNode;
  /** Defaults to a 1 / 2 / 3 column responsive grid. */
  columns?: SxProps<Theme>;
  sx?: SxProps<Theme>;
}

/** Responsive grid used to lay out feature cards. */
export default function FeatureGrid({
  children,
  columns = FEATURE_COLUMNS,
  sx,
}: FeatureGridProps) {
  return (
    <Box
      sx={[
        { display: 'grid', gap: 3, gridTemplateColumns: columns },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
