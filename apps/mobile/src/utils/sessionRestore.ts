/**
 * Cold-start session restore helpers.
 *
 * A stored session must survive process death. Only a definitive auth
 * rejection (401/403) may wipe keys. Network/timeout on /auth/me or
 * refresh must keep the stored user so relaunch does not dump to Sign In.
 */

export function isDefinitiveAuthRejection(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 403;
}
