import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import FeatureCard from '../components/FeatureCard';
import FeatureGrid from '../components/FeatureGrid';
import PageSection from '../components/PageSection';
import ScanFrequencyForm from '../components/ScanFrequencyForm';
import SectionPanel from '../components/SectionPanel';

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

/** Audit reports: scanning schedule plus the (not yet implemented) report list. */
export default function AuditReportsPage() {
  return (
    <Container maxWidth="lg">
      <PageSection id="audit-reports" labelledBy="audit-reports-heading">
        <Typography
          id="audit-reports-heading"
          variant="h3"
          component="h1"
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

        <ScanFrequencyForm />

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
    </Container>
  );
}
