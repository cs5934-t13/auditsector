import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link as RouterLink } from 'react-router-dom';
import PageSection from '../components/PageSection';
import { PAGE_HEADING_SX } from '../content/layout';
import { useAuth } from '../auth/AuthContext';
import { ROUTES } from '../routes';

/** Signed-in landing view: greeting and primary actions. */
export default function HomePage() {
  const { user } = useAuth();

  return (
    <Container maxWidth="lg">
      <PageSection id="home" labelledBy="home-heading" spacing="both">
        <Stack spacing={3} sx={{ maxWidth: 760 }}>
          <Typography
            id="home-heading"
            variant="h3"
            component="h1"
            sx={PAGE_HEADING_SX}
          >
            Welcome back{user ? `, ${user.username}` : ''}.
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            sx={{ fontWeight: 400, maxWidth: 620 }}
          >
            Audit Sector gathers audit publications from the sources you trust,
            schedules regular scans, and presents new reports in a single,
            searchable view.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              component={RouterLink}
              to={ROUTES.auditReports}
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
            >
              Explore audits
            </Button>
            <Button
              component={RouterLink}
              to={ROUTES.categories}
              variant="outlined"
              size="large"
            >
              Browse categories
            </Button>
          </Stack>
        </Stack>
      </PageSection>
    </Container>
  );
}
