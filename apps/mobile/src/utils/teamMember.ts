/**
 * Team member display helpers.
 * The API (listMembers) returns userName/userEmail. name/email are read only
 * as a defensive fallback for any legacy-shaped object.
 */
export interface MemberNameFields {
  userName?: string | null;
  userEmail?: string | null;
  name?: string | null;
  email?: string | null;
}

export function memberName(m: MemberNameFields): string {
  return m.userName ?? m.name ?? '';
}

export function memberEmail(m: MemberNameFields): string {
  return m.userEmail ?? m.email ?? '';
}

/** Single avatar letter; '?' when the member has neither name nor email. */
export function memberInitial(m: MemberNameFields): string {
  const s = memberName(m) || memberEmail(m);
  return s ? s[0].toUpperCase() : '?';
}
