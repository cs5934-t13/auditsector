import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import {
  FOOTER_BRAND_WIDTH,
  FOOTER_COLUMNS,
  FOOTER_GAP,
  FOOTER_PADDING,
} from '../content/layout';
import { navFor } from '../content/navigation';
import { useAuth } from '../auth/AuthContext';

const linkSx = {
  color: 'text.secondary',
  fontSize: '0.95rem',
  '&:hover': { color: 'primary.main' },
} as const;

/**
 * Application footer with a brand block, navigation, and contact information.
 *
 * Accessibility notes:
 * - `<footer>` landmark plus a labelled `<nav>`.
 * - Column headings are real headings so the content is outline-navigable.
 * - Links use descriptive text (no "click here").
 */
export default function AppFooter() {
  const year = new Date().getFullYear();
  const { isAuthenticated } = useAuth();
  const navItems = navFor(isAuthenticated);

  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Container maxWidth="lg" sx={{ py: FOOTER_PADDING }}>
        <Box
          sx={{
            display: 'grid',
            gap: FOOTER_GAP,
            gridTemplateColumns: FOOTER_COLUMNS,
          }}
        >
          <Box>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                mb: 1,
              }}
            >
              <ShieldOutlinedIcon color="primary" aria-hidden="true" />
              <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
                AuditSector
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: FOOTER_BRAND_WIDTH }}
            >
              Collect, schedule, and review audit publications from the sources
              that matter to your organization.
            </Typography>
          </Box>

          <Box component="nav" aria-label="Footer">
            <Typography variant="subtitle2" component="h2" sx={{ mb: 1.5 }}>
              Navigate
            </Typography>
            <Stack spacing={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} sx={linkSx}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" component="h2" sx={{ mb: 1.5 }}>
              Contact
            </Typography>
            <Stack spacing={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              <li>
                <Link href="mailto:team@auditsector.example" sx={linkSx}>
                  team@auditsector.example
                </Link>
              </li>
              <li>
                <Link href="https://github.com/cs5934-t13/auditsector/" sx={linkSx}>
                  Project repository
                </Link>
              </li>
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
        >
          <Typography variant="body2" color="text.secondary">
            &copy; {year} AuditSector. All rights reserved.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            CS5934 Capstone Project
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
