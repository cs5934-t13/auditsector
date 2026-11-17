import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link as RouterLink } from 'react-router-dom';
import HomeSidebar from '../components/HomeSidebar';
import PageSection from '../components/PageSection';
import RecentAuditsGrid from '../components/RecentAuditsGrid';
import RiskLevelChart from '../components/RiskLevelChart';
import ScanActivityChart from '../components/ScanActivityChart';
import { SCROLL_OFFSET } from '../content/layout';
import { useAuth } from '../auth/AuthContext';
import { ROUTES } from '../routes';

/** Signed-in landing view: greeting, recent reports, and a quick-links rail. */
export default function HomePage() {
  const { user } = useAuth();

  return (
    <Container maxWidth="lg">
      <PageSection id="home" labelledBy="home-heading" spacing="both">
        {/*
          Two-column shell: main content plus the quick-links rail. The rail
          moves beneath the content on small screens instead of disappearing,
          and both columns are top-aligned. (A sticky rail is not possible here:
          the app frame in `Layout` uses `overflow: clip`, which would become the
          sticky containing block.)
        */}
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 3, md: 4 },
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 280px' },
            alignItems: 'start',
          }}
        >
          <Stack spacing={3} sx={{ minWidth: 0 }}>
            <Typography id="home-heading" variant="h3" component="h1">
              Welcome back{user ? `, ${user.username}` : ''}.
            </Typography>

 


            <Box
              component="section"
              id="recent-audits"
              sx={{ scrollMarginTop: SCROLL_OFFSET }}
            >
              <RecentAuditsGrid />
            </Box>

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
                to={ROUTES.tags}
                variant="outlined"
                size="large"
              >
                Browse tags
              </Button>
            </Stack>
            
            <Box
              component="section"
              id="risk-levels"
              sx={{ scrollMarginTop: SCROLL_OFFSET }}
            >
              <RiskLevelChart />
            </Box>
            
            <Box
              component="section"
              id="scan-activity"
              sx={{ scrollMarginTop: SCROLL_OFFSET }}
            >
              <ScanActivityChart />
            </Box>

          </Stack>

          <HomeSidebar />
        </Box>
      </PageSection>
    </Container>
  );
}
