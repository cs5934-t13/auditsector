import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LoginCard from '../components/LoginCard';

const sectionSx = {
  scrollMarginTop: { xs: '72px', md: '136px' },
} as const;

const aboutItems = [
  {
    title: 'Collect',
    description:
      'Register publication sources and scan them on a schedule you control.',
  },
  {
    title: 'Review',
    description:
      'Browse recent audit reports with risk levels and scan status in one view.',
  },
  {
    title: 'Organize',
    description:
      'Tag and track audits across your organization so nothing gets missed.',
  },
];

/**
 * Default page for signed-out visitors: the sign-in form plus an About section.
 * Navigation for this page is intentionally limited to "About".
 */
export default function LandingPage() {
  return (
    <Container maxWidth="lg">
      <Box
        component="section"
        id="sign-in"
        aria-labelledby="sign-in-heading"
        sx={{
          py: { xs: 6, md: 9 },
          display: 'grid',
          gap: { xs: 4, md: 8 },
          gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' },
          alignItems: 'center',
          ...sectionSx,
        }}
      >
        <Stack spacing={3} sx={{ maxWidth: 620 }}>
          <Chip
            label="CS5934 Capstone"
            color="secondary"
            variant="outlined"
            size="small"
            sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
          />
          <Typography
            id="sign-in-heading"
            variant="h3"
            component="h1"
            sx={{
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
              lineHeight: 1.12,
            }}
          >
            Audit intelligence, organized.
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            sx={{ fontWeight: 400 }}
          >
            AuditSector gathers audit publications from the sources you trust,
            schedules regular scans, and presents new reports in a single,
            searchable view.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to review audits, manage sources, and track scan status.
          </Typography>
        </Stack>

        <Box sx={{ justifySelf: { xs: 'stretch', md: 'end' }, width: '100%' }}>
          <LoginCard />
        </Box>
      </Box>

      <Box
        component="section"
        id="about"
        aria-labelledby="about-heading"
        sx={{ pb: { xs: 6, md: 9 }, ...sectionSx }}
      >
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
          <Typography
            id="about-heading"
            variant="h4"
            component="h2"
            gutterBottom
          >
            About AuditSector
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 760 }}
          >
            AuditSector is a capstone project that brings audit publications
            together: it tracks the sources your organization follows, scans
            them on a schedule, and surfaces the newest reports first.
          </Typography>

          <Box
            sx={{
              mt: 3,
              display: 'grid',
              gap: 3,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(3, 1fr)',
              },
            }}
          >
            {aboutItems.map((item) => (
              <Box key={item.title}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.description}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
