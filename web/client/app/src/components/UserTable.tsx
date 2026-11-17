import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { ROLE_LABELS, type ManagedUser } from '../content/users';

interface UserTableProps {
  users: readonly ManagedUser[];
}

const headCellSx = {
  fontWeight: 700,
  whiteSpace: 'nowrap',
} as const;

/**
 * Table of users.
 *
 * Uses real table semantics (`<table>`) rather than a div grid so screen
 * readers can announce column headers and navigate cell by cell. The container
 * scrolls horizontally on narrow screens instead of squashing columns.
 *
 * Status is conveyed with text inside the chip, so it is not colour-only.
 */
export default function UserTable({ users }: UserTableProps) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Users" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headCellSx} scope="col">
              Name
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Username
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Email
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Role
            </TableCell>
            <TableCell sx={headCellSx} scope="col">
              Status
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} hover>
              <TableCell component="th" scope="row">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user.firstName} {user.lastName}
                </Typography>
              </TableCell>
              <TableCell>{user.username}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{ROLE_LABELS[user.role]}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  color={user.status === 'ACTIVE' ? 'success' : 'default'}
                  variant={user.status === 'ACTIVE' ? 'filled' : 'outlined'}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
