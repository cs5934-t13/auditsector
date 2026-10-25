import type { ReactNode } from 'react';
import Paper, { type PaperProps } from '@mui/material/Paper';
import { PANEL_PADDING } from '../content/layout';

/**
 * Outlined content panel with uniform padding.
 *
 * Replaces the repeated `<Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>`
 * blocks across the pages. Consolidating them also means Emotion generates one
 * class for every panel instead of one per instance.
 */
export default function SectionPanel({ sx, children, ...rest }: PaperProps) {
  const mergedSx = Array.isArray(sx)
    ? [{ p: PANEL_PADDING }, ...sx]
    : [{ p: PANEL_PADDING }, sx];

  return (
    <Paper variant="outlined" sx={mergedSx} {...rest}>
      {children as ReactNode}
    </Paper>
  );
}
