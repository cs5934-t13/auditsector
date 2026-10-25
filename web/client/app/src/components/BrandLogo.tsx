import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Placeholder for the organization logo.
 *
 * Replace the inner content with an `<img>` (or inline SVG) once the real
 * asset is available. Marked `aria-hidden` because the adjacent heading
 * already carries the organization name, so screen readers should not
 * announce "Logo" as meaningful content.
 */
export default function BrandLogo() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: { xs: 32, md: 40 },
        height: { xs: 32, md: 40 },
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontSize: '0.6rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Logo
      </Typography>
    </Box>
  );
}
