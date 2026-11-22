import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { updateAppSettings } from '../api/settings';
import { useAppSettings } from '../hooks/useAppSettings';
import { isRichTextEmpty, sanitizeRichText } from '../utils/richtext';
import RichTextEditor from './RichTextEditor';
import SectionPanel from './SectionPanel';

interface FormValues {
  organizationName: string;
  passwordResetMessage: string;
  generalHelp: string;
  contact: string;
}

/** Rich-text fields, in display order, for the empty-value check. */
const RICH_TEXT_FIELDS = [
  { key: 'passwordResetMessage', label: 'Password Help' },
  { key: 'generalHelp', label: 'General Help' },
  { key: 'contact', label: 'Contact' },
] as const satisfies readonly {
  key: keyof FormValues;
  label: string;
}[];

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
    contact: settings.contact,
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

  /** The editors hand back HTML, not a DOM event. */
  const setRichTextField =
    (field: keyof FormValues) =>
    (html: string) => {
      setValues((current) => ({ ...current, [field]: html }));
      setStatus('idle');
      setError(null);
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Values typed in the HTML view are passed through untouched while editing,
    // so sanitize here: this is the last point before the API call, and it means
    // a hand-edited value gets exactly the same treatment as an editor one.
    const sanitized: FormValues = {
      ...values,
      passwordResetMessage: sanitizeRichText(values.passwordResetMessage),
      generalHelp: sanitizeRichText(values.generalHelp),
      contact: sanitizeRichText(values.contact),
    };

    // The editors can be visually empty while still holding markup such as
    // `<p><br></p>`. The backend rejects an empty value, so catch it here and
    // name the field instead of reporting a generic failure.
    const emptyField = RICH_TEXT_FIELDS.find(({ key }) =>
      isRichTextEmpty(sanitized[key]),
    );

    if (emptyField) {
      setStatus('error');
      setError(`${emptyField.label} must not be empty.`);
      return;
    }

    setStatus('saving');

    setValues(sanitized);
    applySettings(sanitized);

    try {
      await updateAppSettings({
        organization_name: sanitized.organizationName,
        password_reset_message: sanitized.passwordResetMessage,
        general_help: sanitized.generalHelp,
        contact: sanitized.contact,
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
      contact: settings.contact,
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
        These values are shown to everyone using Audit Sector.
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
          helperText="Displayed in the header next to the Audit Sector name."
          fullWidth
          required
        />

        <RichTextEditor
          id="setting-password-reset"
          label="Password Help"
          value={values.passwordResetMessage}
          onChange={setRichTextField('passwordResetMessage')}
          helperText="Shown in the modal when a user selects “Forgot password?”."
          placeholder="Explain how a user should reset their password."
          minRows={2}
          required
        />

        <RichTextEditor
          id="setting-general-help"
          label="General Help"
          value={values.generalHelp}
          onChange={setRichTextField('generalHelp')}
          helperText="Shown above the help section on this page."
          placeholder="Describe where users should start, or who to contact."
          minRows={3}
          required
        />

        <RichTextEditor
          id="setting-contact"
          label="Contact"
          value={values.contact}
          onChange={setRichTextField('contact')}
          helperText="Shown in the footer's Contact column."
          placeholder="e.g. helpdesk@example.gov or a phone number"
          minRows={2}
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
