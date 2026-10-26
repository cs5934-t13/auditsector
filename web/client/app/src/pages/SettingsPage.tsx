import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';

/** Settings: organization details and account preferences. */
export default function SettingsPage() {
  return (
    <Container maxWidth="lg">
      <PageSection id="settings" labelledBy="settings-heading">
        <SectionPanel>
          <Typography
            id="settings-heading"
            variant="h3"
            component="h1"
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
