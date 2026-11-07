import type { UserRole } from '../auth/AuthContext';

export interface ManagedUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * Seed data for the Manage Users screen.
 *
 * The backend `users` table exists (`data/db_init/init_users.sql`) but user
 * management endpoints do not, so this list is client-side only. Replace with a
 * fetch once `GET /users` is available.
 * TODO: Replace once backend user management endpoints are implemented
 */
export const INITIAL_USERS: readonly ManagedUser[] = [
  {
    id: '1',
    username: 'jdoe',
    firstName: 'Jordan',
    lastName: 'Doe',
    email: 'jdoe@alexandria.example',
    role: 'ADMIN',
    status: 'ACTIVE',
  },
  {
    id: '2',
    username: 'asmith',
    firstName: 'Avery',
    lastName: 'Smith',
    email: 'asmith@alexandria.example',
    role: 'ANALYST',
    status: 'ACTIVE',
  },
  {
    id: '3',
    username: 'rpatel',
    firstName: 'Riya',
    lastName: 'Patel',
    email: 'rpatel@alexandria.example',
    role: 'ANALYST',
    status: 'INACTIVE',
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  ANALYST: 'Analyst',
};
