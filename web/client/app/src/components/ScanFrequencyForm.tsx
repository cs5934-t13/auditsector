import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createSource, type SavedSource } from '../api/sources';
import { useAuth } from '../auth/AuthContext';
import ScanFrequencySelect from './ScanFrequencySelect';
import AddSourceForm from './AddSourceForm';
import SectionPanel from './SectionPanel';
import {
  DEFAULT_SCAN_FREQUENCY,
  type ScanFrequency,
} from '../content/frequencies';

/** Saves a source and its selected frequency through the authenticated API. */
export default function ScanFrequencyForm() {
  const { user, isAuthenticated, isChecking } = useAuth();

  // A different signed-in user gets fresh form values and feedback.
  return (
    <SourceScheduleForm
      key={user?.username ?? 'anonymous'}
      canSubmit={!isChecking && isAuthenticated && Boolean(user)}
    />
  );
}

function SourceScheduleForm({ canSubmit }: { canSubmit: boolean }) {
  const [savedSource, setSavedSource] = useState<SavedSource | null>(null);
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
        {!canSubmit && (
          <Alert severity="info">Sign in before adding a source.</Alert>
        )}
        <AddSourceForm
          disabled={!canSubmit}
          submitLabel="Save source"
          onSubmit={async ({ sourceUrl }) => {
            setSavedSource(null);
            const result = await createSource({ sourceUrl, frequency });
            setSavedSource(result);
          }}
          onChange={() => setSavedSource(null)}
          onCancel={() => {
            setSavedSource(null);
            setFrequency(DEFAULT_SCAN_FREQUENCY);
          }}
          renderExtraFields={(isDisabled) => (
            <ScanFrequencySelect
              value={frequency}
              disabled={isDisabled}
              onChange={(value) => {
                setFrequency(value);
                setSavedSource(null);
              }}
            />
          )}
        />

        <div role="status" aria-live="polite" aria-atomic="true">
          {savedSource && (
            <Typography color="success.main" sx={{ overflowWrap: 'anywhere' }}>
              Source saved: {savedSource.source_link}. Scan frequency:{' '}
              {savedSource.scan_frequency}.
            </Typography>
          )}
        </div>
      </Stack>
    </SectionPanel>
  );
}
