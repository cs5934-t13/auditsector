import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  displayName,
  type ManagedUser,
} from '../utils/users.ts';

interface UserTableProps {
  users: readonly ManagedUser[];
  /** Id of the signed-in user, whose own row cannot be archived. */
  currentUserId?: number | null;
  onEdit: (user: ManagedUser) => void;
  onArchive: (user: ManagedUser) => void;
  onRestore: (user: ManagedUser) => void;
  /** Disables actions while a change is in flight. */
  busy?: boolean;
}

const headCellSx = {
  fontWeight: 700,
  whiteSpace: 'nowrap',
} as const;

/**
 * Table of users with per-row actions.
 *
 * Uses real table semantics (`<table>`) rather than a div grid so screen
 * readers can announce column headers and navigate cell by cell. The container
 * scrolls horizontally on narrow screens instead of squashing columns.
 *
 * Status is conveyed with text inside the chip, so it is not colour-only.
 * Every icon button carries an `aria-label` naming its row, because an icon
 * alone does not say *which* user it acts on.
 */
export default function UserTable({
  users,
  currentUserId,
  onEdit,
  onArchive,
  onRestore,
  busy = false,
}: UserTableProps) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Users" sx={{ minWidth: 780 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headCellSx} scope="col">
              Name
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Username
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              E-mail
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Role
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Status
            </TableCell>
            <TableCell sx={headCellSx} scope="col" align="right">
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const isSelf = currentUserId != null && user.user_id === currentUserId;
            const isArchived = user.user_status === 'INACTIVE';
            const name = displayName(user);

            return (
              <TableRow key={user.user_id} hover>
                <TableCell component="th" scope="row">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {name}
                  </Typography>
                  {isSelf && (
                    <Typography variant="caption" color="text.secondary">
                      You
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{ROLE_LABELS[user.user_role]}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={STATUS_LABELS[user.user_status]}
                    color={isArchived ? 'default' : 'success'}
                    variant={isArchived ? 'outlined' : 'filled'}
                  />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title={`Edit ${name}`}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Edit ${name}`}
                          onClick={() => onEdit(user)}
                          disabled={busy}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>

                    {isArchived ? (
                      <Tooltip title={`Restore ${name}`}>
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Restore ${name}`}
                            onClick={() => onRestore(user)}
                            disabled={busy}
                          >
                            <UnarchiveOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip
                        title={
                          isSelf
                            ? 'You cannot archive your own account'
                            : `Archive ${name}`
                        }
                      >
                        {/* A disabled button fires no events, so the tooltip
                            needs a wrapper element to still explain itself. */}
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Archive ${name}`}
                            onClick={() => onArchive(user)}
                            disabled={busy || isSelf}
                          >
                            <ArchiveOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
