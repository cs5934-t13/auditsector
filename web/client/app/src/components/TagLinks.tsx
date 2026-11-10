import { Fragment } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import type { SxProps, Theme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { BODY_LINK_SX } from '../theme';
import { tagPath } from '../routes';

interface TagLinksProps {
  /** Tag names in display casing. */
  tags: readonly string[];
  sx?: SxProps<Theme>;
}

/**
 * Inline list of tag links.
 *
 * Each tag links to its tag page at `/tag/<slug>`, so the tags in a report row
 * are navigable rather than plain text. Separators are decorative and hidden
 * from assistive technology, which would otherwise read them out.
 */
export default function TagLinks({ tags, sx }: TagLinksProps) {
  return (
    <Box
      component="span"
      sx={[
        {
          display: 'inline-flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.5,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {tags.map((tag, index) => (
        <Fragment key={tag}>
          {index > 0 && (
            <Box
              component="span"
              aria-hidden="true"
              sx={{ color: 'text.disabled' }}
            >
              ·
            </Box>
          )}
          <Link component={RouterLink} to={tagPath(tag)} sx={BODY_LINK_SX}>
            {tag}
          </Link>
        </Fragment>
      ))}
    </Box>
  );
}
