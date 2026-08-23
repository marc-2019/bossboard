/**
 * Invite a mate — SaaS free-month referral (parity with web Settings).
 * Paid users: copy/share /r/{code} link.
 * Unpaid: explain unlock + optional attach a friend's code.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { referralsApi, type ReferralMe } from '../../src/services/api';
import { fetchReferralMe, shareReferralInvite } from '../../src/services/referralShare';
import { InContentBack } from '../../src/components/InContentBack';

export default function InviteMateScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<ReferralMe | null>(null);
  const [attachInput, setAttachInput] = useState('');
  const [attaching, setAttaching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchReferralMe();
    setMe(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleShare() {
    const ok = await shareReferralInvite(me);
    if (!ok && !me?.eligible) {
      Alert.alert(
        'Subscribe to invite',
        'Friend invites unlock on a paid Tradie or Team plan. You can still enter a mate’s code below before you subscribe.'
      );
    } else if (!ok) {
      Alert.alert('Could not share', 'Try copying the link instead.');
    }
  }

  async function handleAttach() {
    const code = attachInput.trim();
    if (!code) {
      Alert.alert('Enter a code', 'Paste the invite code your mate sent you.');
      return;
    }
    setAttaching(true);
    try {
      const res = await referralsApi.attach(code);
      const msg =
        (res.data as { message?: string })?.message ||
        'Friend code saved. When you subscribe, you both get a free month.';
      Alert.alert('Saved', msg);
      setAttachInput('');
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert('Could not save code', err.message || 'Check the code and try again.');
    } finally {
      setAttaching(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <InContentBack fallback="/settings" />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const offer =
    me?.offerCopy ||
    'Give a mate a free month of BossBoard — when they pay, you both get a free month. Free months stack up to 1 year.';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <InContentBack fallback="/settings" />
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="gift-outline" size={28} color="#059669" />
        </View>
        <Text style={styles.title}>Invite a mate</Text>
        <Text style={styles.offer}>{offer}</Text>
      </View>

      {me && me.freeMonthsBalance > 0 && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Free months on your account</Text>
          <Text style={styles.balanceValue}>{me.freeMonthsBalance}</Text>
        </View>
      )}

      {me?.eligible && me.shareUrl ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your invite link</Text>
          <Text style={styles.link} selectable>
            {me.shareUrl}
          </Text>
          {me.code ? (
            <Text style={styles.codeLine}>
              Code: <Text style={styles.codeMono}>{me.code}</Text>
              {me.stats.activated > 0
                ? ` · ${me.stats.activated} mate${me.stats.activated === 1 ? '' : 's'} subscribed`
                : ''}
            </Text>
          ) : null}

          <Text style={styles.hint}>Long-press the link to copy, or share it:</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Share invite</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Unlock invites</Text>
          <Text style={styles.body}>
            Paid Tradie or Team subscribers get a personal invite link. Share it with mates — when
            they pay, you both get a free month.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/subscription' as any)}
          >
            <Ionicons name="diamond-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>View plans</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Got a mate’s code?</Text>
        <Text style={styles.body}>
          Enter it before you subscribe so both of you get a free month when you pay.
        </Text>
        {me?.pendingReferralCode ? (
          <Text style={styles.pending}>
            Saved code: <Text style={styles.codeMono}>{me.pendingReferralCode}</Text>
          </Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Invite code"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="characters"
          autoCorrect={false}
          value={attachInput}
          onChangeText={setAttachInput}
        />
        <TouchableOpacity
          style={[styles.secondaryBtn, styles.fullWidth, attaching && styles.disabled]}
          onPress={handleAttach}
          disabled={attaching}
        >
          {attaching ? (
            <ActivityIndicator color="#1A2A44" />
          ) : (
            <>
              <Ionicons name="link-outline" size={18} color="#1A2A44" />
              <Text style={styles.secondaryBtnText}>Save friend code</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.footnote}>
        This is a BossBoard plan reward — not a discount on invoices you send clients. Share your
        invite outside the invoice (text, email, social).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  hero: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1A2A44', marginBottom: 8 },
  offer: { fontSize: 15, lineHeight: 22, color: '#4B5563' },
  balanceCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: { fontSize: 14, color: '#065F46', fontWeight: '600' },
  balanceValue: { fontSize: 24, fontWeight: '800', color: '#059669' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1A2A44', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, color: '#4B5563', marginBottom: 12 },
  link: {
    fontSize: 13,
    color: '#1A2A44',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  codeLine: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  codeMono: { fontFamily: 'monospace', fontWeight: '700', color: '#1A2A44' },
  hint: { fontSize: 12, color: '#9CA3AF', marginBottom: 10 },
  pending: { fontSize: 13, color: '#059669', marginBottom: 8 },
  primaryBtn: {
    flex: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF6B35',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  secondaryBtnText: { color: '#1A2A44', fontWeight: '600', fontSize: 14 },
  fullWidth: { flex: 0, alignSelf: 'stretch' },
  disabled: { opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A2A44',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  footnote: { fontSize: 12, color: '#9CA3AF', lineHeight: 18, marginTop: 4, paddingHorizontal: 4 },
});
