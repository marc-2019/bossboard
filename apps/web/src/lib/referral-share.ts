/**
 * Web: one-time post–invoice-send prompt to share SaaS friend invite.
 * Mirrors mobile `referralShare.ts`. Paid users only (server eligibility).
 */

import { referralsClient } from './api-client';

const PROMPT_SEEN = 'bb_referral_invoice_prompt_v1';

/**
 * After mark-sent / email / share: optionally invite a mate (free month each).
 * Non-blocking; never throws to the invoice page.
 */
export async function maybePromptReferralAfterInvoiceSend(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage.getItem(PROMPT_SEEN) === '1') return;

    const me = await referralsClient.me();
    if (!me.eligible || !me.shareUrl) {
      // Don't burn the flag while unpaid — prompt after they subscribe.
      return;
    }

    window.sessionStorage.setItem(PROMPT_SEEN, '1');

    const offer =
      me.offerCopy ||
      'Give a mate a free month of BossBoard — when they pay, you both get a free month.';

    const share = window.confirm(
      `${offer}\n\nShare your BossBoard invite link now? (This is not your client invoice link.)`,
    );
    if (!share) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Invite a mate to BossBoard',
          text: offer,
          url: me.shareUrl,
        });
        return;
      }
    } catch {
      // User cancelled share sheet — fall through to clipboard
    }

    try {
      await navigator.clipboard.writeText(me.shareUrl);
      window.alert(`Invite link copied:\n${me.shareUrl}`);
    } catch {
      window.prompt('Copy your invite link:', me.shareUrl);
    }
  } catch {
    // optional surface
  }
}
