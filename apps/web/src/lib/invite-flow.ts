import { safeRedirect } from './safe-redirect';

export interface InviteInfo {
  teamName: string;
  invitedEmail: string;
  matchesEmail: boolean;
}

type InviteDecision =
  | { action: 'redirect'; loginUrl: string }
  | { action: 'load' }
  | { action: 'mismatch'; message: string; loginUrl: string }
  | { action: 'accept' };

/** Decide navigation and acceptance without performing any side effects. */
export function decideInviteFlow(code: string, currentEmail: string | null, info?: InviteInfo): InviteDecision {
  const returnTo = safeRedirect(`/invite/${encodeURIComponent(code)}`);
  const loginUrl = `/login?redirect=${encodeURIComponent(returnTo)}`;
  if (currentEmail === null) return { action: 'redirect', loginUrl };
  if (!info) return { action: 'load' };
  if (!info.matchesEmail) return {
    action: 'mismatch',
    message: `This invite was sent to ${info.invitedEmail}. You're signed in as ${currentEmail}.`,
    loginUrl,
  };
  return { action: 'accept' };
}
