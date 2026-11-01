import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { updateAppSettings } from '../api/settings';
import { useAppSettings } from '../hooks/useAppSettings';
import SectionPanel from './SectionPanel';

interface FormValues {
  organizationName: string;
  passwordResetMessage: string;
  generalHelp: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Administrator-only form for editing user-facing text.
 *
 * Saves optimistically: the values are applied to the shared settings context
 * immediately (so the header and the reset dialog update right away), then sent
 * to `PUT /api/settings`. That endpoint does not exist yet, so a failure is
 * reported without discarding the local change.
 */
export default function AdminSettingsForm() {
  const { settings, applySettings } = useAppSettings();
  const [values, setValues] = useState<FormValues>({
    organizationName: settings.organizationName,
    passwordResetMessage: settings.passwordResetMessage,
    generalHelp: settings.generalHelp,
  });
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const setField =
    (field: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setStatus('idle');
      setError(null);
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('saving');
    setError(null);

    applySettings(values);

    try {
      await updateAppSettings({
        organization_name: values.organizationName,
        password_reset_message: values.passwordResetMessage,
        general_help: values.generalHelp,
      });
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(
        `Saved locally, but the backend update failed (${String(err)}).`,
      );
    }
  };

  const handleReset = () => {
    setValues({
      organizationName: settings.organizationName,
      passwordResetMessage: settings.passwordResetMessage,
      generalHelp: settings.generalHelp,
    });
    setStatus('idle');
    setError(null);
  };

  return (
    <SectionPanel component="section" aria-labelledby="admin-settings-heading">
      <Typography
        id="admin-settings-heading"
        variant="h5"
        component="h2"
        gutterBottom
      >
        Administrator settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        These values are shown to everyone using AuditSector.
      </Typography>

      <Stack
        component="form"
        onSubmit={handleSubmit}
        noValidate
        spacing={2.5}
        sx={{ maxWidth: 640 }}
      >
        <TextField
          id="setting-organization-name"
          label="Header Text (Locality)"
          value={values.organizationName}
          onChange={setField('organizationName')}
          helperText="Displayed in the header next to the AuditSector name."
          fullWidth
          required
        />

        <TextField
          id="setting-password-reset"
          label="Password Help"
          value={values.passwordResetMessage}
          onChange={setField('passwordResetMessage')}
          helperText="Shown in the modal when a user selects “Forgot password?”."
          multiline
          minRows={2}
          fullWidth
          required
        />

        <TextField
          id="setting-general-help"
          label="General Help"
          value={values.generalHelp}
          onChange={setField('generalHelp')}
          helperText="Shown above the help section on this page."
          multiline
          minRows={3}
          fullWidth
          required
        />

        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save changes'}
          </Button>
          <Button type="button" variant="text" onClick={handleReset}>
            Reset
          </Button>
        </Stack>
      </Stack>

      {status === 'saved' && (
        <Alert severity="success" role="status" sx={{ mt: 3 }}>
          Settings updated.
        </Alert>
      )}

      {error && (
        <Alert severity="warning" role="alert" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}
    </SectionPanel>
  );
}
