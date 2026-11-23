import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { sanitizeRichText } from '../utils/richtext';
import { LINK_ACCENT } from '../theme';

interface RichTextProps {
  /** Stored setting value: plain text from a legacy row, or sanitized HTML. */
  value: string;
  /** `body1` for page copy, `body2` for the footer and dialog. */
  variant?: 'body1' | 'body2';
  sx?: SxProps<Theme>;
}

/**
 * Renders a rich-text setting value.
 *
 * The value is sanitized again here, at the point of use, even though it was
 * already sanitized when saved. The database is the trust boundary: a row can be
 * edited directly, seeded by SQL, or written by an older client, so the renderer
 * cannot assume the stored string is safe.
 *
 * The result is styled through `sx` rather than a global `CssBaseline` rule so
 * only these settings are affected, and the typography matches the `Prose` /
 * `DialogContentText` treatments the plain strings used before.
 */
export default function RichText({ value, variant = 'body1', sx }: RichTextProps) {
  const html = sanitizeRichText(value);
  const typographySx =
    variant === 'body2'
      ? { typography: 'body2', fontSize: '0.925rem' }
      : { typography: 'body1' };

  return (
    <Box
      sx={[
        typographySx,
        {
          color: 'text.secondary',
          // Body lists and paragraphs inside a value that came from the editor.
          '& p': { m: 0, mb: 1 },
          '& p:last-child': { mb: 0 },
          '& ul, & ol': { m: 0, mb: 1, pl: 3 },
          '& li': { mb: 0.25 },
          '& li:last-child': { mb: 0 },
          '& a': { color: LINK_ACCENT, textDecoration: 'underline' },
          '& strong, & b': { color: 'text.primary', fontWeight: 700 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      // Only sanitized HTML reaches this point: every tag is from the
      // whitelist, every attribute is `href` with an http(s)/mailto/relative
      // value, and all other text is escaped by `sanitizeRichText`.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
