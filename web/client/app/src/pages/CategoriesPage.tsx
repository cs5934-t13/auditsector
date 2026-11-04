import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';

/** Categories: grouping for audit reports. */
export default function CategoriesPage() {
  return (
    <Container maxWidth="lg">
      <PageSection id="categories" labelledBy="categories-heading">
        <SectionPanel>
          <Typography
            id="categories-heading"
            variant="h3"
            component="h1"
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
    </Container>
  );
}
