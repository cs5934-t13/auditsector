import Box from '@mui/material/Box';
import BrandLogo from './BrandLogo';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  FOOTER_BRAND_WIDTH,
  FOOTER_COLUMNS,
  FOOTER_GAP,
  FOOTER_PADDING,
} from '../content/layout';
import { navFor } from '../content/navigation';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../hooks/useAppSettings';
import { richTextToPlainText } from '../utils/richtext';
import RichText from './RichText';
import {
  BRAND_FONT,
  BRAND_FONT_WEIGHT,
  BRAND_LETTER_SPACING,
  FOOTER_LINK_SX,
} from '../theme';

/**
 * Matches a bare email address.
 *
 * The Contact value is rich text, so an address normally arrives wrapped in a
 * `mailto:` link. An administrator who types only the address would otherwise
 * get unlinked text, so a value whose entire content is an address is still
 * rendered as a link.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { settings } = useAppSettings();
  const navItems = navFor(isAuthenticated);
  const contactText = richTextToPlainText(settings.contact);
  const contactEmail = EMAIL_PATTERN.test(contactText) ? contactText : null;

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
              <BrandLogo />
              {/* Same wordmark treatment as the header brand block. */}
              <Typography
                variant="h6"
                component="p"
                sx={{
                  fontFamily: BRAND_FONT,
                  fontWeight: BRAND_FONT_WEIGHT,
                  letterSpacing: BRAND_LETTER_SPACING,
                  borderBottom: 1, 
                }}
              >
                Audit Sector
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
                <li key={item.path}>
                  <Link component={RouterLink} to={item.path} sx={FOOTER_LINK_SX}>
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
                {contactEmail ? (
                  <Link href={`mailto:${contactEmail}`} sx={FOOTER_LINK_SX}>
                    {contactEmail}
                  </Link>
                ) : (
                  <RichText value={settings.contact} variant="body2" />
                )}
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
            &copy; {year} Audit Sector. All rights reserved.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
