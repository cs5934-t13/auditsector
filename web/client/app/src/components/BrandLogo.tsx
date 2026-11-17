import Box from '@mui/material/Box';

const LOGO_SRC = '/audit-sector-logo.svg';

/**
 * Organization logo.
 *
 * Rendered as an `<img>` from `public/`, so the same asset is used here and as
 * the site favicon. Marked `aria-hidden` / empty `alt` because the adjacent
 * heading already carries the organization name; announcing "logo" would be
 * redundant for screen reader users.
 */
export default function BrandLogo() {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      sx={{
        height: { xs: 32, md: 40 },
        width: 'auto',
        flexShrink: 0,
        display: 'block',
      }}
    />
  );
}

