import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Link as RouterLink } from 'react-router-dom';
import AdminSettingsForm from '../components/AdminSettingsForm';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import { useAppSettings } from '../hooks/useAppSettings';
import { useAuth } from '../auth/AuthContext';
import { ACCENT_WASH, LINK_ACCENT } from '../theme';
import { ROUTES } from '../routes';

/** Settings shared by every signed-in user. */
function GeneralSettings() {
  const { settings } = useAppSettings();

  return (
    <SectionPanel component="section" aria-labelledby="help-heading">
      <Typography id="help-heading" variant="h5" component="h2" gutterBottom>
        Help
      </Typography>
      <Prose>{settings.generalHelp}</Prose>

      <Divider sx={{ my: 2.5 }} />

      <Typography variant="subtitle2" component="h3" gutterBottom>
        Common questions
      </Typography>
      <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
        <Typography component="li" variant="body2" color="text.secondary">
          Reports are listed newest first; use the audit report filters to narrow
          the list.
        </Typography>
        <Typography component="li" variant="body2" color="text.secondary">
          To change how often a source is scanned, open Audit Reports and choose
          a frequency.
        </Typography>
        <Typography component="li" variant="body2" color="text.secondary">
          Forgotten passwords are reset by an administrator.
        </Typography>
      </Stack>
    </SectionPanel>
  );
}

/** Administrator-only section: user management and editable text settings. */
function AdminSection() {
  return (
    <>
      <SectionPanel component="section" aria-labelledby="admin-heading">
        <Typography id="admin-heading" variant="h5" component="h2" gutterBottom>
          Administration
        </Typography>
        <Prose>
          Manage who can access Audit Sector and maintain the organization-wide
          text shown throughout the application.
        </Prose>

        <Link
          component={RouterLink}
          to={ROUTES.manageUsers}
          aria-label="Manage Users"
          sx={{
            mt: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            px: 2,
            py: 1.5,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            // Body-link treatment (accent at rest, underlined on hover) on a
            // bordered row instead of inline text. The hover wash uses the
            // shared accent tint so it matches the nav highlight; `action.hover`
            // would be teal next to an accent border.
            color: LINK_ACCENT,
            fontWeight: 600,
            '&:hover': {
              bgcolor: ACCENT_WASH,
              borderColor: LINK_ACCENT,
              textDecoration: 'underline',
            },
          }}
        >
          Manage Users
          <ChevronRightIcon sx={{ color: 'inherit' }} aria-hidden="true" />
        </Link>
      </SectionPanel>

      <AdminSettingsForm />
    </>
  );
}

/** Settings: general help for everyone, plus an admin-only section. */
export default function SettingsPage() {
  const { isAdmin } = useAuth();

  return (
    <Container maxWidth="lg">
      <PageSection id="settings" labelledBy="settings-heading" sx={{ pt: 6 }}>
        <Typography
          id="settings-heading"
          variant="h3"
          component="h1"
          gutterBottom
        >
          Settings
        </Typography>

        <Stack spacing={3}>
          <GeneralSettings />
          {isAdmin && <AdminSection />}
        </Stack>
      </PageSection>
    </Container>
  );
}
