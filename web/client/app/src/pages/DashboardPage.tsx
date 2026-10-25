import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import FeatureCard from '../components/FeatureCard';
import FeatureGrid from '../components/FeatureGrid';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import { PAGE_HEADING_SX } from '../content/layout';
import { useAuth } from '../auth/AuthContext';

const features = [
  {
    icon: <HistoryOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Most recent',
    description:
      'Reports appear newest first, so the latest publication is always at the top of the list.',
  },
  {
    icon: <ErrorOutlineOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Risk level',
    description:
      'Each report shows its risk level — informational, low, medium, high, or critical.',
  },
  {
    icon: <AssessmentOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Scan status',
    description:
      'See whether a report is pending, running, completed, or failed to scan.',
  },
];

/** Authenticated dashboard. Only reachable once a user has signed in. */
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <Container maxWidth="lg">
      <PageSection
        id="home"
        labelledBy="home-heading"
        spacing="both"
      >
        <Stack spacing={3} sx={{ maxWidth: 760 }}>
          <Chip
            label="CS5934 Capstone"
            color="secondary"
            variant="outlined"
            size="small"
            sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
          />
          {/* Page-level h1: the dashboard's primary heading. */}
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
            AuditSector gathers audit publications from the sources you trust,
            schedules regular scans, and presents new reports in a single,
            searchable view.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              variant="contained"
              size="large"
              href="#audit-reports"
              endIcon={<ArrowForwardIcon />}
            >
              Explore audits
            </Button>
            <Button variant="outlined" size="large" href="#categories">
              Browse categories
            </Button>
          </Stack>
        </Stack>
      </PageSection>

      <PageSection id="audit-reports" labelledBy="audit-reports-heading">
        <Typography
          id="audit-reports-heading"
          variant="h4"
          component="h2"
          gutterBottom
        >
          Audit Reports
        </Typography>
        <FeatureGrid>
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </FeatureGrid>

        <SectionPanel
          sx={{
            mt: 3,
            borderStyle: 'dashed',
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            The paginated report list will appear here once{' '}
            <code>GET /audits/recent</code> is available.
          </Typography>
        </SectionPanel>
      </PageSection>

      <PageSection id="categories" labelledBy="categories-heading">
        <SectionPanel>
          <Typography
            id="categories-heading"
            variant="h4"
            component="h2"
            gutterBottom
          >
            Categories
          </Typography>
          <Prose>
            Group audit reports by category so related findings stay together.
            Categories will be used to filter reports and to follow the areas
            your organization cares about most.
          </Prose>
        </SectionPanel>
      </PageSection>

      <PageSection id="settings" labelledBy="settings-heading">
        <SectionPanel>
          <Typography
            id="settings-heading"
            variant="h4"
            component="h2"
            gutterBottom
          >
            Settings
          </Typography>
          <Prose>
            Organization details, scan schedules, and account preferences will
            be managed here.
          </Prose>
        </SectionPanel>
      </PageSection>
    </Container>
  );
}
