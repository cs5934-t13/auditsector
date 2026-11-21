import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { fetchProfile, updateProfile, UsersApiError } from '../api/users.ts';
import { useAuth } from '../auth/AuthContext';
import SectionPanel from './SectionPanel';
import { profileInputError, type ManagedUser } from '../utils/users.ts';

interface FormValues {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  current_password: string;
}

const EMPTY_VALUES: FormValues = {
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  current_password: '',
};

function valuesFor(profile: ManagedUser): FormValues {
  return {
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    username: profile.username,
    password: '',
    confirmPassword: '',
    current_password: '',
  };
}

/**
 * Self-service account settings for the signed-in user.
 *
 * A regular user can change their own name, e-mail, username and password.
 * Role and status are not shown at all: the API rejects them from a non-admin,
 * and offering the fields would only mislead.
 *
 * A password change must include the current password, so an unattended session
 * cannot be used to silently take over the account.
 */
export default function AccountSettingsForm() {
  const { refresh } = useAuth();
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const profile = await fetchProfile();
      if (mounted.current) {
        setValues(valuesFor(profile));
      }
    } catch (err) {
      if (mounted.current) {
        setLoadError(
          err instanceof UsersApiError
            ? err.message
            : 'Your account details could not be loaded.',
        );
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setField =
    (field: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
      setError(null);
      setSaved(null);
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(null);

    const validationError = profileInputError(
      {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        username: values.username,
        ...(values.password
          ? {
              password: values.password,
              current_password: values.current_password,
            }
          : {}),
      },
      values.confirmPassword,
    );

    if (validationError) {
      setError(validationError);
      return;
    }

    const changesPassword = values.password.length > 0;

    setSaving(true);
    try {
      const updated = await updateProfile({
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim(),
        username: values.username.trim(),
        ...(changesPassword
          ? {
              password: values.password,
              current_password: values.current_password,
            }
          : {}),
      });

      if (mounted.current) {
        setValues(valuesFor(updated));
        setSaved(
          changesPassword
            ? 'Your details and password were updated.'
            : 'Your details were updated.',
        );
      }

      // A username change rewrites the session key; refresh so the header and
      // the next admin request use the new value.
      refresh();
    } catch (err) {
      if (mounted.current) {
        setError(
          err instanceof UsersApiError
            ? err.message
            : 'Your changes could not be saved. Please try again.',
        );
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  };

  return (
    <SectionPanel component="section" aria-labelledby="account-heading">
      <Typography id="account-heading" variant="h5" component="h2" gutterBottom>
        Your account
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Update your own details or password. Changes take effect immediately.
      </Typography>

      {loading ? (
        <Stack
          role="status"
          aria-live="polite"
          alignItems="center"
          spacing={1}
          sx={{ py: 4 }}
        >
          <CircularProgress aria-label="Loading your account" />
          <Typography variant="body2" color="text.secondary">
            Loading your account…
          </Typography>
        </Stack>
      ) : loadError ? (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : (
        <Stack
          component="form"
          onSubmit={handleSubmit}
          noValidate
          spacing={2.5}
          sx={{ maxWidth: 640 }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              id="account-first-name"
              label="First name"
              value={values.first_name}
              onChange={setField('first_name')}
              autoComplete="given-name"
              required
              fullWidth
            />
            <TextField
              id="account-last-name"
              label="Last name"
              value={values.last_name}
              onChange={setField('last_name')}
              autoComplete="family-name"
              required
              fullWidth
            />
          </Stack>

          <TextField
            id="account-email"
            label="E-mail"
            type="email"
            value={values.email}
            onChange={setField('email')}
            autoComplete="email"
            required
            fullWidth
          />

          <TextField
            id="account-username"
            label="Username"
            value={values.username}
            onChange={setField('username')}
            autoComplete="username"
            helperText="This is the name you sign in with."
            required
            fullWidth
          />

          <Divider sx={{ my: 0.5 }} />

          <Typography variant="subtitle2" component="h3">
            Change password
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Leave these blank to keep your current password.
          </Typography>

          <TextField
            id="account-current-password"
            label="Current password"
            type="password"
            value={values.current_password}
            onChange={setField('current_password')}
            autoComplete="current-password"
            helperText="Required when setting a new password."
            fullWidth
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              id="account-new-password"
              label="New password"
              type="password"
              value={values.password}
              onChange={setField('password')}
              autoComplete="new-password"
              fullWidth
            />
            <TextField
              id="account-confirm-password"
              label="Confirm new password"
              type="password"
              value={values.confirmPassword}
              onChange={setField('confirmPassword')}
              autoComplete="new-password"
              fullWidth
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </Stack>
        </Stack>
      )}

      {saved && (
        <Alert severity="success" role="status" sx={{ mt: 3 }}>
          {saved}
        </Alert>
      )}

      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}
    </SectionPanel>
  );
}
