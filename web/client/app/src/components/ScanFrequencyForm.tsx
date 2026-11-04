import { useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ScanFrequencySelect from './ScanFrequencySelect';
import SectionPanel from './SectionPanel';
import {
  DEFAULT_SCAN_FREQUENCY,
  type ScanFrequency,
} from '../content/frequencies';

/**
 * Form for choosing how often an audit publication is scanned.
 *
 * The backend endpoint for saving schedules is not implemented yet, so the
 * submit handler currently only validates the source URL. When
 * `POST /sources` exists, send `{ user, source, frequency }` from here.
 */
export default function ScanFrequencyForm() {
  const [source, setSource] = useState('');
  const [frequency, setFrequency] = useState<ScanFrequency>(
    DEFAULT_SCAN_FREQUENCY,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);

    const trimmed = source.trim();

    if (!trimmed) {
      setError('Enter the publication URL to scan.');
      return;
    }

    // TODO: POST /sources with { user, source: trimmed, frequency }.
    setError(null);
    setSaved(true);
  };

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

      <Stack
        component="form"
        onSubmit={handleSubmit}
        noValidate
        spacing={2.5}
        sx={{ maxWidth: 560 }}
      >
        <TextField
          id="scan-source"
          name="source"
          label="Publication URL"
          placeholder="https://example.gov/audits"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          error={Boolean(error)}
          helperText={error ?? 'The page that publishes the audit reports.'}
          fullWidth
          required
        />

        <ScanFrequencySelect value={frequency} onChange={setFrequency} />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button type="submit" variant="contained">
            Save schedule
          </Button>
          {saved && (
            <Typography
              component="p"
              role="status"
              color="success.main"
              sx={{ alignSelf: 'center', fontWeight: 600 }}
            >
              Schedule saved locally. The backend will persist it once POST
              /sources is available.
            </Typography>
          )}
        </Stack>
      </Stack>
    </SectionPanel>
  );
}
