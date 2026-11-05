import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import FeatureCard from '../components/FeatureCard';
import FeatureGrid from '../components/FeatureGrid';
import PageSection from '../components/PageSection';
import RecentReportsTable from '../components/RecentReportsTable';
import ScanFrequencyForm from '../components/ScanFrequencyForm';
import SectionPanel from '../components/SectionPanel';
import { SAMPLE_RECENT_REPORTS } from '../content/recentReports';

const features = [
  {
    icon: <HistoryOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Most recent',
    description:
      'Records appear newest first by when they were added to Audit Sector.',
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

/** Audit reports: scan scheduling and a sample-data preview of recent records. */
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
          component="section"
          aria-labelledby="recent-reports-heading"
          sx={{ mt: 3, minWidth: 0 }}
        >
          <Typography id="recent-reports-heading" variant="h5" component="h2">
            Recent reports
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Preview with sample records, ordered by when they were added. These
            are not live audit records.
          </Typography>
          <RecentReportsTable rows={SAMPLE_RECENT_REPORTS} />
        </SectionPanel>
      </PageSection>
    </Container>
  );
}
