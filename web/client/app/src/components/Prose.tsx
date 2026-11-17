import type { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { PROSE_WIDTH } from '../content/layout';

interface ProseProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/** Body text constrained to a readable line length. */
export default function Prose({ children, sx }: ProseProps) {
  return (
    <Typography
      variant="body1"
      color="text.secondary"
      sx={[{ maxWidth: PROSE_WIDTH }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Typography>
  );
}
