import Alert from '@mui/material/Alert';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import UserTable from '../components/UserTable';
import { INITIAL_USERS } from '../content/users';
import { ROUTES } from '../routes';

/**
 * Manage Users (administrator only).
 *
 * The route itself is admin-guarded; this is a read-only list until the backend
 * exposes user management endpoints.
 */
export default function ManageUsersPage() {
  return (
    <Container maxWidth="lg">
      <PageSection id="manage-users" labelledBy="manage-users-heading">
        <Link
          component={RouterLink}
          to={ROUTES.settings}
          underline="hover"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            mb: 2,
            fontWeight: 600,
          }}
        >
          <ArrowBackIcon fontSize="small" aria-hidden="true" />
          Back to settings
        </Link>

        <SectionPanel>
          <Typography
            id="manage-users-heading"
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}
          >
            Manage Users
          </Typography>
          <Prose>
            Review the people who can sign in to Audit Sector and their assigned
            roles. Editing and inviting users will be enabled once the user
            management API is available.
          </Prose>

          <Alert severity="info" sx={{ my: 3 }}>
            This list is a preview. Changes are not persisted yet.
          </Alert>

          <UserTable users={INITIAL_USERS} />
        </SectionPanel>
      </PageSection>
    </Container>
  );
}
