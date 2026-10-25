import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { useAuth } from '../auth/AuthContext';

const features = [
  {
    icon: <AssessmentOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Track audit reports',
    description:
      'Follow new audit publications from your sources and review them in one place.',
  },
  {
    icon: <LinkOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Manage sources',
    description:
      'Register publication URLs and choose how often each source is scanned.',
  },
  {
    icon: <NotificationsActiveOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Stay current',
    description:
      'See the most recently scanned audits first, with clear status and risk levels.',
  },
];

const sectionSx = {
  scrollMarginTop: { xs: '72px', md: '136px' },
} as const;

/** Authenticated dashboard. Only reachable once a user has signed in. */
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <Container maxWidth="lg">
      <Box
        component="section"
        id="overview"
        aria-labelledby="overview-heading"
        sx={{ py: { xs: 6, md: 9 }, ...sectionSx }}
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
            id="overview-heading"
            variant="h3"
            component="h1"
            sx={{
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
              lineHeight: 1.12,
            }}
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
              href="#audits"
              endIcon={<ArrowForwardIcon />}
            >
              Explore audits
            </Button>
            <Button variant="outlined" size="large" href="#sources">
              Manage sources
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box
        component="section"
        id="audits"
        aria-labelledby="audits-heading"
        sx={{ pb: { xs: 6, md: 9 }, ...sectionSx }}
      >
        <Typography
          id="audits-heading"
          variant="h4"
          component="h2"
          gutterBottom
        >
          What you can do
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          {features.map((feature) => (
            <Paper
              key={feature.title}
              variant="outlined"
              sx={{ p: 3, height: '100%' }}
            >
              {feature.icon}
              <Typography variant="h6" component="h3" sx={{ mt: 1.5, mb: 1 }}>
                {feature.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {feature.description}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>

      <Box
        component="section"
        id="sources"
        aria-labelledby="sources-heading"
        sx={{ pb: { xs: 6, md: 9 }, ...sectionSx }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
          <Typography
            id="sources-heading"
            variant="h4"
            component="h2"
            gutterBottom
          >
            Sources
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 720 }}
          >
            Add the publication URLs you want AuditSector to scan and pick a
            frequency — hourly, daily, weekly, or monthly. Each source keeps its
            own schedule, so high-value publications can be checked more often
            than the rest.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            Source management is exposed by the <code>POST /sources</code> API
            and will be available in this dashboard soon.
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
