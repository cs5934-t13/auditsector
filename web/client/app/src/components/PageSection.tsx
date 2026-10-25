import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { SCROLL_OFFSET, SECTION_PADDING } from '../content/layout';

interface PageSectionProps {
  /** Anchor id, also used by navigation links. */
  id: string;
  /** Id of the heading that names this section. */
  labelledBy: string;
  children: ReactNode;
  /**
   * `both` adds vertical padding on all sides (use for the first section on a
   * page); `bottom` only pads below (use for subsequent sections).
   */
  spacing?: 'both' | 'bottom';
  sx?: SxProps<Theme>;
}

/**
 * A landmark `<section>` with consistent padding and anchor scroll offset.
 *
 * Centralizing `scrollMarginTop` here means pages no longer repeat magic
 * numbers that must stay in sync with the sticky header's height.
 */
export default function PageSection({
  id,
  labelledBy,
  children,
  spacing = 'bottom',
  sx,
}: PageSectionProps) {
  const padding =
    spacing === 'both'
      ? { py: SECTION_PADDING }
      : { pb: SECTION_PADDING };

  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={labelledBy}
      sx={[{ scrollMarginTop: SCROLL_OFFSET, ...padding }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Box>
  );
}
