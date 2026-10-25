import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
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
        id="home"
        aria-labelledby="home-heading"
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
            id="home-heading"
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
      </Box>

      <Box
        component="section"
        id="audit-reports"
        aria-labelledby="audit-reports-heading"
        sx={{ pb: { xs: 6, md: 9 }, ...sectionSx }}
      >
        <Typography
          id="audit-reports-heading"
          variant="h4"
          component="h2"
          gutterBottom
        >
          Audit Reports
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

        <Paper
          variant="outlined"
          sx={{
            mt: 3,
            p: { xs: 3, md: 5 },
            borderStyle: 'dashed',
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            The paginated report list will appear here once{' '}
            <code>GET /audits/recent</code> is available.
          </Typography>
        </Paper>
      </Box>

      <Box
        component="section"
        id="categories"
        aria-labelledby="categories-heading"
        sx={{ pb: { xs: 6, md: 9 }, ...sectionSx }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
          <Typography
            id="categories-heading"
            variant="h4"
            component="h2"
            gutterBottom
          >
            Categories
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 720 }}
          >
            Group audit reports by category so related findings stay together.
            Categories will be used to filter reports and to follow the areas
            your organization cares about most.
          </Typography>
        </Paper>
      </Box>

      <Box
        component="section"
        id="settings"
        aria-labelledby="settings-heading"
        sx={{ pb: { xs: 6, md: 9 }, ...sectionSx }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
          <Typography
            id="settings-heading"
            variant="h4"
            component="h2"
            gutterBottom
          >
            Settings
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 720 }}
          >
            Organization details, scan schedules, and account preferences will
            be managed here.
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
