import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import {
  archiveUser,
  createUser,
  fetchUsers,
  restoreUser,
  updateUser,
  UsersApiError,
} from '../api/users.ts';
import { useAuth } from '../auth/AuthContext';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import UserFormDialog from '../components/UserFormDialog';
import UserTable from '../components/UserTable';
import { displayName, type ManagedUser, type UserInput } from '../utils/users.ts';
import { ROUTES } from '../routes';

/**
 * Manage Users (administrator only).
 *
 * Administrators can add users, edit any property without changing the user id,
 * archive a user (which keeps the row and blocks sign-in), and restore an
 * archived account. Their own row is edit-only: the archive action and the
 * role/status controls are disabled, so an administrator cannot lock themselves
 * out of the admin area.
 */
export default function ManageUsersPage() {
  const { user: sessionUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [pendingArchive, setPendingArchive] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Guards against setting state after the page unmounts mid-request.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const list = await fetchUsers({ includeInactive: true });
      if (mounted.current) {
        setUsers(list);
      }
    } catch (err) {
      if (mounted.current) {
        setLoadError(
          err instanceof UsersApiError
            ? err.message
            : 'The user list could not be loaded.',
        );
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const currentUserId = sessionUser?.userId ?? null;

  const visibleUsers = useMemo(() => {
    if (!users) {
      return [];
    }

    return showArchived
      ? users
      : users.filter((user) => user.user_status === 'ACTIVE');
  }, [users, showArchived]);

  const archivedCount = useMemo(
    () => (users ?? []).filter((user) => user.user_status === 'INACTIVE').length,
    [users],
  );

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
    setActionMessage(null);
    setActionError(null);
  };

  const openEdit = (target: ManagedUser) => {
    setEditing(target);
    setFormOpen(true);
    setActionMessage(null);
    setActionError(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (input: UserInput) => {
    if (editing) {
      const updated = await updateUser(editing.user_id, input);
      setUsers((current) =>
        (current ?? []).map((user) =>
          user.user_id === updated.user_id ? updated : user,
        ),
      );
      setActionMessage(`${displayName(updated)} was updated.`);
      return;
    }

    const created = await createUser(input);
    setUsers((current) => [...(current ?? []), created]);
    setActionMessage(`${displayName(created)} was added.`);
  };

  const handleArchive = async () => {
    if (!pendingArchive) {
      return;
    }

    const target = pendingArchive;
    setBusy(true);
    setActionError(null);

    try {
      await archiveUser(target.user_id);
      // The row is kept; only its status changes, so patch it in place rather
      // than dropping it from the list.
      setUsers((current) =>
        (current ?? []).map((user) =>
          user.user_id === target.user_id
            ? { ...user, user_status: 'INACTIVE' }
            : user,
        ),
      );
      setActionMessage(`${displayName(target)} was archived.`);
    } catch (err) {
      setActionError(
        err instanceof UsersApiError
          ? err.message
          : 'The user could not be archived.',
      );
    } finally {
      setBusy(false);
      setPendingArchive(null);
    }
  };

  const handleRestore = async (target: ManagedUser) => {
    setBusy(true);
    setActionMessage(null);
    setActionError(null);

    try {
      await restoreUser(target.user_id);
      setUsers((current) =>
        (current ?? []).map((user) =>
          user.user_id === target.user_id
            ? { ...user, user_status: 'ACTIVE' }
            : user,
        ),
      );
      setActionMessage(`${displayName(target)} was restored.`);
    } catch (err) {
      setActionError(
        err instanceof UsersApiError
          ? err.message
          : 'The user could not be restored.',
      );
    } finally {
      setBusy(false);
    }
  };

  // The table always has a valid empty state, so the wording is chosen here.
  const emptyMessage =
    users !== null && users.length === 0
      ? 'No users yet. Use “Add user” to create the first account.'
      : 'No active users. Turn on “Show archived” to see archived accounts.';

  return (
    <Container maxWidth="lg">
      <PageSection id="manage-users" labelledBy="manage-users-heading">
        <Link
          component={RouterLink}
          to={ROUTES.settings}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            mb: 2,
            fontWeight: 600,
          }}
        >
          <ArrowBackIcon fontSize="small" aria-hidden="true" />
          Back to settings
        </Link>

        <SectionPanel>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ sm: 'center' }}
            justifyContent="space-between"
            sx={{ mb: 1 }}
          >
            <Typography
              id="manage-users-heading"
              variant="h3"
              component="h1"
              gutterBottom
              sx={{ mb: { sm: 0 } }}
            >
              Manage Users
            </Typography>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAdd}
              disabled={loading || busy}
            >
              Add user
            </Button>
          </Stack>

          <Prose sx={{ mb: 2 }}>
            Add people who can sign in to Audit Sector, change their details or
            role, and archive accounts that should no longer have access.
            Archiving keeps the account and its history; the person simply
            cannot sign in until the account is restored.
          </Prose>

          <FormControlLabel
            control={
              <Switch
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
            }
            label={
              archivedCount > 0
                ? `Show archived (${archivedCount})`
                : 'Show archived'
            }
            sx={{ mb: 2 }}
          />

          {actionMessage && (
            <Alert
              severity="success"
              role="status"
              onClose={() => setActionMessage(null)}
              sx={{ mb: 2 }}
            >
              {actionMessage}
            </Alert>
          )}

          {actionError && (
            <Alert
              severity="error"
              role="alert"
              onClose={() => setActionError(null)}
              sx={{ mb: 2 }}
            >
              {actionError}
            </Alert>
          )}

          {loadError && (
            <Alert
              severity="error"
              role="alert"
              action={
                <Button color="inherit" size="small" onClick={() => void reload()}>
                  Retry
                </Button>
              }
              sx={{ mb: 2 }}
            >
              {loadError}
            </Alert>
          )}

          {loading ? (
            <Stack
              role="status"
              aria-live="polite"
              alignItems="center"
              spacing={1}
              sx={{ py: 6 }}
            >
              <CircularProgress aria-label="Loading users" />
              <Typography variant="body2" color="text.secondary">
                Loading users…
              </Typography>
            </Stack>
          ) : visibleUsers.length === 0 ? (
            <Alert severity="info">{emptyMessage}</Alert>
          ) : (
            <UserTable
              users={visibleUsers}
              currentUserId={currentUserId}
              onEdit={openEdit}
              onArchive={setPendingArchive}
              onRestore={(target) => void handleRestore(target)}
              busy={busy}
            />
          )}
        </SectionPanel>
      </PageSection>

      <UserFormDialog
        open={formOpen}
        user={editing}
        isSelf={
          editing !== null &&
          currentUserId !== null &&
          editing.user_id === currentUserId
        }
        onClose={closeForm}
        onSubmit={handleSubmit}
      />

      <Dialog
        open={pendingArchive !== null}
        onClose={() => setPendingArchive(null)}
        aria-labelledby="archive-user-title"
        aria-describedby="archive-user-description"
      >
        <DialogTitle id="archive-user-title">Archive user?</DialogTitle>
        <DialogContent>
          <DialogContentText id="archive-user-description">
            {pendingArchive
              ? `${displayName(pendingArchive)} will no longer be able to sign in. The account and its history are kept, and you can restore it later.`
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPendingArchive(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleArchive()}
            color="error"
            variant="contained"
            disabled={busy}
          >
            {busy ? 'Archiving…' : 'Archive user'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
