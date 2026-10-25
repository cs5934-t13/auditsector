// Matches Jit's published AuthContext storage format. This is UI state only;
// the backend remains responsible for validating the submitted user.
export function readStoredUsername(
  storage?: Pick<Storage, 'getItem'>,
): string | null {
  try {
    const raw = (storage ?? window.sessionStorage).getItem('auditsector:user')
    const user: unknown = raw ? JSON.parse(raw) : null
    if (typeof user !== 'object' || user === null || !('username' in user)) return null
    return typeof user.username === 'string' && user.username.trim()
      ? user.username.trim()
      : null
  } catch {
    return null
  }
}
