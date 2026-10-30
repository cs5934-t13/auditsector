import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import SectionPanel from './SectionPanel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../auth/AuthContext';
import { useAppSettings } from '../hooks/useAppSettings';

interface LoginResponse {
  status: string;
  reason: string;
}

/**
 * Status returned by Flask on successful authentication.
 *
 * The backend (`web/server/app/hello.py`) returns `"approved"`, not `"valid"`.
 * Keep this in sync if the API contract changes.
 */
const LOGIN_SUCCESS_STATUS = 'approved';

/**
 * Sign-in form.
 *
 * Preserves the original static page's behaviour: posts credentials as JSON to
 * `POST /api/login` (nginx strips the `/api` prefix and forwards to Flask).
 *
 * Accessibility notes:
 * - Uses MUI `TextField` with explicit `label`, so every input has a label.
 * - `autoComplete` hints help password managers.
 * - The result message is announced with `role="status"`; errors use `role="alert"`.
 */
export default function LoginCard() {
  const { signIn } = useAuth();
  const { settings, isLoading: settingsLoading, load: loadSettings } =
    useAppSettings();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LoginResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const openResetDialog = () => {
    setResetDialogOpen(true);
    loadSettings();
  };
  const closeResetDialog = () => setResetDialogOpen(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as LoginResponse;
      setResult(data);

      // Successful credentials switch the app shell into its signed-in state.
      if (response.ok && data.status === LOGIN_SUCCESS_STATUS) {
        signIn(username);
      }
    } catch (err) {
      setError(`Login request failed: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionPanel
      component="section"
      aria-labelledby="login-heading"
      sx={{ p: { xs: 3, md: 4 }, maxWidth: 440, width: '100%' }}
    >
      {/*
        The page's h1 already announces "Sign in to AuditSector", so this title
        is styled text rather than a heading to avoid a redundant h2. The
        section keeps an accessible name via aria-labelledby.
      */}
      <Typography
        id="login-heading"
        variant="h5"
        component="p"
        gutterBottom
        sx={{ fontWeight: 600 }}
      >
        Sign in
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Use your AuditSector credentials to continue.
      </Typography>

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.5}>
          <TextField
            id="login-username"
            name="username"
            label="Username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            fullWidth
          />
          <TextField
            id="login-password"
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            fullWidth
          />
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              sx={{ flexGrow: 1 }}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <Link
              component="button"
              type="button"
              onClick={openResetDialog}
              aria-haspopup="dialog"
              underline="hover"
              sx={{
                alignSelf: { xs: 'flex-start', sm: 'center' },
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            >
              Forgot password?
            </Link>
          </Stack>
        </Stack>
      </Box>

      {result && (
        <Alert
          severity={result.status === LOGIN_SUCCESS_STATUS ? 'success' : 'error'}
          role="status"
          sx={{ mt: 3 }}
        >
          {result.status}: {result.reason}
        </Alert>
      )}

      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}

      <Dialog
        open={resetDialogOpen}
        onClose={closeResetDialog}
        aria-labelledby="password-reset-title"
        aria-describedby="password-reset-description"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="password-reset-title">Reset your password</DialogTitle>
        <DialogContent>
          {settingsLoading ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} aria-hidden="true" />
              <DialogContentText id="password-reset-description">
                Loading contact details…
              </DialogContentText>
            </Stack>
          ) : (
            <DialogContentText id="password-reset-description">
              {settings.passwordResetMessage}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetDialog} autoFocus>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </SectionPanel>
  );
}
