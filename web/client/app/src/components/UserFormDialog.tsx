import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  USER_ROLES,
  USER_STATUSES,
  userFieldError,
  type ManagedUser,
  type UserInput,
  type UserRole,
  type UserStatus,
} from '../utils/users.ts';
import { UsersApiError } from '../api/users.ts';

interface FormValues {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  user_role: UserRole;
  user_status: UserStatus;
}

const EMPTY_VALUES: FormValues = {
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  password: '',
  user_role: 'ANALYST',
  user_status: 'ACTIVE',
};

function valuesFor(user: ManagedUser | null): FormValues {
  if (!user) {
    return EMPTY_VALUES;
  }

  return {
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    username: user.username,
    // Never pre-filled: leaving it blank keeps the existing password.
    password: '',
    user_role: user.user_role,
    user_status: user.user_status,
  };
}

interface UserFormDialogProps {
  open: boolean;
  /** The user being edited, or `null` to create a new one. */
  user: ManagedUser | null;
  /** True for the signed-in administrator, whose own role/status are locked. */
  isSelf?: boolean;
  onClose: () => void;
  onSubmit: (input: UserInput) => Promise<void>;
}

/**
 * Create/edit dialog for a single user.
 *
 * The user id is never part of the form: an existing user is identified by the
 * URL the caller builds (`PUT /api/user/<id>`), so editing can never move a
 * record to a new id or create a duplicate.
 *
 * Accessibility: the dialog is labelled by its title, and each error is
 * announced with `role="alert"`.
 */
export default function UserFormDialog({
  open,
  user,
  isSelf = false,
  onClose,
  onSubmit,
}: UserFormDialogProps) {
  const isEdit = user !== null;
  const [values, setValues] = useState<FormValues>(() => valuesFor(user));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog is opened for a different user. Without this,
  // opening "Add" after editing would keep the previous user's values.
  useEffect(() => {
    if (open) {
      setValues(valuesFor(user));
      setError(null);
      setSaving(false);
    }
  }, [open, user]);

  const setField =
    (field: keyof FormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
      setError(null);
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    for (const field of ['first_name', 'last_name', 'email', 'username'] as const) {
      const fieldError = userFieldError(field, values[field]);
      if (fieldError) {
        setError(fieldError);
        return;
      }
    }

    if (!isEdit && !values.password) {
      setError('Password is required for a new user.');
      return;
    }

    const input: UserInput = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      email: values.email.trim(),
      username: values.username.trim(),
      user_role: values.user_role,
      user_status: values.user_status,
    };

    if (values.password) {
      input.password = values.password;
    }

    setSaving(true);
    try {
      await onSubmit(input);
      onClose();
    } catch (err) {
      setError(
        err instanceof UsersApiError
          ? err.message
          : 'The user could not be saved. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="user-form-title"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="user-form-title">
          {isEdit ? `Edit ${values.first_name} ${values.last_name}`.trim() : 'Add user'}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="user-first-name"
                label="First name"
                value={values.first_name}
                onChange={setField('first_name')}
                autoComplete="given-name"
                required
                fullWidth
              />
              <TextField
                id="user-last-name"
                label="Last name"
                value={values.last_name}
                onChange={setField('last_name')}
                autoComplete="family-name"
                required
                fullWidth
              />
            </Stack>

            <TextField
              id="user-email"
              label="E-mail"
              type="email"
              value={values.email}
              onChange={setField('email')}
              autoComplete="email"
              required
              fullWidth
            />

            <TextField
              id="user-username"
              label="Username"
              value={values.username}
              onChange={setField('username')}
              autoComplete="off"
              helperText={
                isEdit
                  ? 'Changing the username changes how this person signs in.'
                  : 'Used to sign in. Must be unique.'
              }
              required
              fullWidth
            />

            <TextField
              id="user-password"
              label={isEdit ? 'New password' : 'Password'}
              type="password"
              value={values.password}
              onChange={setField('password')}
              autoComplete="new-password"
              helperText={
                isEdit
                  ? 'Leave blank to keep the current password.'
                  : 'Set an initial password; share it with the user securely.'
              }
              required={!isEdit}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="user-role"
                select
                label="Role"
                value={values.user_role}
                onChange={setField('user_role')}
                disabled={isSelf}
                helperText={
                  isSelf ? 'You cannot change your own role.' : undefined
                }
                fullWidth
              >
                {USER_ROLES.map((role) => (
                  <MenuItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                id="user-status"
                select
                label="Status"
                value={values.user_status}
                onChange={setField('user_status')}
                disabled={isSelf}
                helperText={
                  isSelf ? 'You cannot archive your own account.' : undefined
                }
                fullWidth
              >
                {USER_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add user'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
