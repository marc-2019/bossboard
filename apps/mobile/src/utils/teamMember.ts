/** API returns userName/userEmail; older shapes used name/email. */
export function memberName(m: { userName?: string | null; name?: string | null }): string {
  return m.userName ?? m.name ?? '';
}
export function memberEmail(m: { userEmail?: string | null; email?: string | null }): string {
  return m.userEmail ?? m.email ?? '';
}
export function memberInitial(m: Parameters<typeof memberName>[0] & Parameters<typeof memberEmail>[0]): string {
  const s = memberName(m) || memberEmail(m);
  return s ? s[0].toUpperCase() : '?';
}
