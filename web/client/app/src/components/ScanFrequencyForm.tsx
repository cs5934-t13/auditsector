import { useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ScanFrequencySelect from './ScanFrequencySelect';
import AddSourceForm from './AddSourceForm';
import SectionPanel from './SectionPanel';
import {
  DEFAULT_SCAN_FREQUENCY,
  type ScanFrequency,
} from '../content/frequencies';

/**
 * Source URL validation preview with scan-frequency selection.
 * Saving through the API is handled separately in AW-25.
 */
export default function ScanFrequencyForm() {
  const [validatedUrl, setValidatedUrl] = useState('');
  const [frequency, setFrequency] = useState<ScanFrequency>(
    DEFAULT_SCAN_FREQUENCY,
  );

  return (
    <SectionPanel
      component="section"
      aria-labelledby="scan-frequency-heading"
      sx={{ mt: 3 }}
    >
      <Typography
        id="scan-frequency-heading"
        variant="h6"
        component="h3"
        gutterBottom
      >
        Scan frequency
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose how often Audit Sector checks a publication for new reports.
      </Typography>

      <Stack spacing={2.5} sx={{ maxWidth: 560 }}>
        <AddSourceForm
          submitLabel="Validate source"
          onSubmit={({ sourceUrl }) => setValidatedUrl(sourceUrl)}
          onChange={() => setValidatedUrl('')}
          onCancel={() => {
            setValidatedUrl('');
            setFrequency(DEFAULT_SCAN_FREQUENCY);
          }}
          renderExtraFields={(isSubmitting) => (
            <ScanFrequencySelect
              value={frequency}
              disabled={isSubmitting}
              onChange={(value) => {
                setFrequency(value);
                setValidatedUrl('');
              }}
            />
          )}
        />

        <div role="status" aria-live="polite" aria-atomic="true">
          {validatedUrl && (
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              URL format accepted: {validatedUrl}. This source has not been saved.
            </Typography>
          )}
        </div>
      </Stack>
    </SectionPanel>
  );
}
