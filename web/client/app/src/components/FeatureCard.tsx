import type { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import SectionPanel from './SectionPanel';

interface FeatureCardProps {
  title: string;
  description: string;
  /** Optional icon, typically a decorative MUI icon. */
  icon?: ReactNode;
  /** Heading level for the card title. Defaults to `h3`. */
  headingLevel?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

/** Outlined card with an icon, title, and supporting description. */
export default function FeatureCard({
  title,
  description,
  icon,
  headingLevel = 'h3',
}: FeatureCardProps) {
  return (
    <SectionPanel sx={{ height: '100%' }}>
      {icon}
      <Typography
        variant="h6"
        component={headingLevel}
        sx={{ mt: icon ? 1.5 : 0, mb: 1 }}
      >
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </SectionPanel>
  );
}
