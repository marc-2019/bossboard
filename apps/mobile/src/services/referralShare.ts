/**
 * Friend referral (free month each) — share helpers for mobile.
 * Program is SaaS subscription invite, not client-invoice promo.
 */

import { Alert, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { referralsApi, type ReferralMe } from './api';

/** After first successful invoice send/email we may prompt once (paid users). */
const INVOICE_PROMPT_SEEN_STORAGE = 'bb_referral_invoice_prompt_v1';

function unwrapMe(res: { data: unknown }): ReferralMe | null {
  const body = res.data as { success?: boolean; data?: ReferralMe } | ReferralMe;
  if (!body || typeof body !== 'object') return null;
  if ('data' in body && body.data && typeof body.data === 'object') {
    return body.data as ReferralMe;
  }
  if ('eligible' in body) return body as ReferralMe;
  return null;
}

export async function fetchReferralMe(): Promise<ReferralMe | null> {
  try {
    const res = await referralsApi.me();
    return unwrapMe(res);
  } catch {
    return null;
  }
}

export async function shareReferralInvite(me?: ReferralMe | null): Promise<boolean> {
  const data = me ?? (await fetchReferralMe());
  if (!data?.shareUrl) {
    return false;
  }
  const offer =
    data.offerCopy ||
    'Give a mate a free month of BossBoard — when they pay, you both get a free month.';
  const message = `${offer}\n\nJoin with my link:\n${data.shareUrl}`;
  try {
    await Share.share({
      message,
      url: data.shareUrl,
      title: 'Invite a mate to BossBoard',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * After invoice marked sent / emailed: one-time soft prompt for paid users
 * who can invite mates. Unpaid users are not nagged (Settings explains unlock).
 */
export async function maybePromptReferralAfterInvoiceSend(): Promise<void> {
  try {
    const seen = await AsyncStorage.getItem(INVOICE_PROMPT_SEEN_STORAGE);
    if (seen === '1') return;

    const me = await fetchReferralMe();
    if (!me?.eligible || !me.shareUrl) {
      // Don't burn the one-time flag if not eligible yet — show when they upgrade.
      return;
    }

    await AsyncStorage.setItem(INVOICE_PROMPT_SEEN_STORAGE, '1');

    const offer =
      me.offerCopy ||
      'Give a mate a free month of BossBoard — when they pay, you both get a free month.';

    Alert.alert('Invite a mate — free month each', offer, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Share invite',
        onPress: () => {
          void shareReferralInvite(me);
        },
      },
    ]);
  } catch {
    // Non-blocking — never fail invoice send UX
  }
}
