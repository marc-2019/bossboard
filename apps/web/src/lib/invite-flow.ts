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

/** Shared safe destination after authentication or email verification. */
export function decideAuthNavigation(stage: 'register' | 'login' | 'verified', requested: string | null, base?: string) {
  const returnTo = safeRedirect(requested, base);
  const url = stage === 'register' && returnTo.includes('/invite/')
    ? verificationUrl(returnTo) : returnTo;
  return { url, fullPage: url.includes('/invite/') || url.includes('%2Finvite%2F') };
}

export function verificationUrl(returnTo: string): string {
  return `/verify-email?redirect=${encodeURIComponent(safeRedirect(returnTo))}`;
}

export function decideInviteError(code: string, errorCode: string) {
  if (errorCode !== 'EMAIL_NOT_VERIFIED') return null;
  return {
    message: 'Verify your email first to view and accept this invitation.',
    verificationUrl: verificationUrl(`/invite/${encodeURIComponent(code)}`),
  };
}
