import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FeatureGrid from '../components/FeatureGrid';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import LoginCard from '../components/LoginCard';
import { COMPACT_COLUMNS, PAGE_HEADING_SX } from '../content/layout';

const aboutItems = [
  {
    title: 'Collect',
    description:
      'Register publication sources and scan them on a schedule you control.',
  },
  {
    title: 'Review',
    description:
      'Browse recent audit reports with risk levels and scan status.',
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
      <PageSection
        id="sign-in"
        labelledBy="sign-in-heading"
        spacing="both"
        sx={{
          display: 'grid',
          gap: { xs: 4, md: 8 },
          gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' },
          alignItems: 'center',
        }}
      >
        <Stack spacing={3} sx={{ maxWidth: 620 }}>
          {/* Page-level h1: describes what this page is for. */}
          <Typography
            id="sign-in-heading"
            variant="h3"
            component="h1"
            sx={PAGE_HEADING_SX}
          >
            Sign in to AuditSector
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            sx={{ fontWeight: 400 }}
          >
            AuditSector gathers audit
            publications from the sources you trust, schedules regular scans,
            and presents new and updated reports in one central place.
          </Typography>

                    <FeatureGrid columns={COMPACT_COLUMNS} sx={{ mt: 3 }}>
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
          </FeatureGrid>
        </Stack>

        <Box sx={{ justifySelf: { xs: 'stretch', md: 'end' }, width: '100%' }}>
          <LoginCard />
        </Box>
      </PageSection>
    </Container>
  );
}
