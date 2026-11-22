import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import type { TagRule } from '../api/tags';
import { PROSE_WIDTH } from '../content/layout';

interface TagRuleTextProps extends TagRule {
  /** Show the exclusion rule as a separate labelled item. */
  showBoundary?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Renders a tag's tagging rule: what qualifies and what does not.
 *
 * The two halves are labelled rather than merged into one paragraph, because
 * they answer different questions — "does this report carry the tag?" and "why
 * doesn't a nearby report carry it?". `boundary` is optional: tags added by a
 * user, or a database that predates the column, have no exclusion rule, and the
 * section is simply omitted.
 */
export default function TagRuleText({
  description,
  boundary,
  showBoundary = true,
  sx,
}: TagRuleTextProps) {
  const hasDescription = Boolean(description);
  const hasBoundary = showBoundary && Boolean(boundary);

  if (!hasDescription && !hasBoundary) {
    return null;
  }

  return (
    <Box
      component="dl"
      sx={[
        { m: 0, display: 'grid', gap: 1.5, maxWidth: PROSE_WIDTH },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {hasDescription && (
        <div>
          <Typography
            component="dt"
            variant="caption"
            sx={{
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
              color: 'text.secondary',
              mb: 0.25,
            }}
          >
            Include when substantially examined
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>
            {description}
          </Typography>
        </div>
      )}

      {hasBoundary && (
        <div>
          <Typography
            component="dt"
            variant="caption"
            sx={{
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
              color: 'text.secondary',
              mb: 0.25,
            }}
          >
            Boundary — not this tag
          </Typography>
          <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {boundary}
          </Typography>
        </div>
      )}
    </Box>
  );
}
