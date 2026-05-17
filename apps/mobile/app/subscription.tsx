/**
 * Subscription Screen
 * Shows current plan, usage stats, tier comparison, and upgrade CTA
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { subscriptionsApi } from '../src/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TierInfo {
  name: string;
  slug: string;
  priceWeekly: string;
  priceMonthly: string;
  features: string[];
  limits: Record<string, number | string>;
}

interface UsageData {
  invoicesThisMonth: number;
  invoiceLimit: number | null;
  swmsThisMonth: number;
  swmsLimit: number | null;
  aiCallsThisMonth: number;
  aiCallLimit: number | null;
  teamMembers: number;
  teamMemberLimit: number | null;
}

// ... (TIERS constant)

const TIERS: TierInfo[] = [
  {
    name: 'Free',
    slug: 'free',
    priceWeekly: '$0',
    priceMonthly: '$0',
    features: [
      '3 invoices / month',
      '2 SWMS / month',
      '5 AI calls / month',
      'Basic dashboard',
      'Certification tracker',
    ],
    limits: { invoices: 3, swms: 2, aiCalls: 5, teamMembers: 0 },
  },
  {
    name: 'Tradie',
    slug: 'tradie',
    priceWeekly: '$4.99',
    priceMonthly: '$19.99',
    features: [
      'Unlimited invoices',
      'Unlimited SWMS',
      '50 AI calls / month',
      'PDF export',
      'Email invoices',
      'Quotes & estimates',
      'Expense tracking',
      'Job logs',
      'Photo attachments',
    ],
    limits: { invoices: 'Unlimited', swms: 'Unlimited', aiCalls: 50, teamMembers: 0 },
  },
  {
    name: 'Team',
    slug: 'team',
    priceWeekly: '$9.99',
    priceMonthly: '$39.99',
    features: [
      'Everything in Tradie',
      '200 AI calls / month',
      'Up to 5 team members',
      'Team dashboard',
      'Role-based access',
      'All features included',
    ],
    limits: { invoices: 'Unlimited', swms: 'Unlimited', aiCalls: 200, teamMembers: 5 },
  },
];

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  free: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
  tradie: { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' },
  team: { bg: '#F5F3FF', text: '#6D28D9', border: '#C4B5FD' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentTier = user?.subscriptionTier || 'free';

  const loadUsage = useCallback(async () => {
    try {
      const res = await subscriptionsApi.getUsage();
      if (res.data?.success) {
        const { usage, limits } = res.data.data;
        setUsage({
          invoicesThisMonth: usage.invoicesThisMonth,
          invoiceLimit: limits.invoicesPerMonth,
          swmsThisMonth: usage.swmsThisMonth,
          swmsLimit: limits.swmsPerMonth,
          aiCallsThisMonth: usage.aiCallsThisMonth,
          aiCallLimit: limits.aiCallsPerMonth,
          teamMembers: usage.teamMemberCount,
          teamMemberLimit: limits.teamMembers,
        });
      }
    } catch {
      // Silently fail - usage is supplementary
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadUsage();
      setLoading(false);
    })();
  }, [loadUsage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUsage();
    setRefreshing(false);
  }, [loadUsage]);

  async function handleUpgrade(tier: string) {
    if (tier === currentTier) return;
    if (tier !== 'tradie' && tier !== 'team') return; // free tier has no checkout

    try {
      const res = await subscriptionsApi.createCheckoutSession({ tier });
      const data = res.data?.data;

      // Beta mode: backend returned betaMode flag — show launch-pricing message
      if (data?.betaMode) {
        Alert.alert(
          'Launch Pricing',
          data.message ?? 'All features are free during our launch period.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Real checkout: open Stripe Checkout URL in the device's default browser.
      // After payment Stripe redirects to the API's successUrl; the user returns
      // to the app manually and the subscription_tier refreshes on next auth-check.
      if (!data?.url) {
        Alert.alert('Checkout error', 'No checkout URL returned. Please try again or contact support.');
        return;
      }

      const supported = await Linking.canOpenURL(data.url);
      if (!supported) {
        Alert.alert(
          'Could not open browser',
          'Please copy this URL into your browser to complete checkout:\n\n' + data.url
        );
        return;
      }
      await Linking.openURL(data.url);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Could not start checkout. Please try again.';
      Alert.alert('Upgrade failed', msg);
    }
  }

  // ---------------------------------------------------------------------------
  // Usage Bar Component
  // ---------------------------------------------------------------------------

  function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
    if (limit === null || limit === 0) return null;
    const pct = Math.min((used / limit) * 100, 100);
    const isNearLimit = pct >= 80;

    return (
      <View style={styles.usageRow}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>{label}</Text>
          <Text style={[styles.usageCount, isNearLimit && styles.usageCountWarning]}>
            {used} / {limit}
          </Text>
        </View>
        <View style={styles.usageBarBg}>
          <View
            style={[
              styles.usageBarFill,
              { width: `${pct}%` },
              isNearLimit && styles.usageBarFillWarning,
            ]}
          />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Subscription' }} />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Subscription' }} />

      {/* Launch Banner */}
      <View style={styles.betaBanner}>
        <Ionicons name="gift-outline" size={20} color="#059669" />
        <View style={styles.betaTextWrap}>
          <Text style={styles.betaTitle}>Launch Pricing</Text>
          <Text style={styles.betaSubtitle}>
            All features are completely free during our launch period!
          </Text>
        </View>
      </View>

      {/* Current Plan Card */}
      <View
        style={[
          styles.currentPlanCard,
          { borderColor: TIER_COLORS[currentTier].border },
        ]}
      >
        <View style={styles.currentPlanHeader}>
          <View>
            <Text style={styles.currentPlanLabel}>Current Plan</Text>
            <Text
              style={[
                styles.currentPlanName,
                { color: TIER_COLORS[currentTier].text },
              ]}
            >
              {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            </Text>
          </View>
          <View
            style={[
              styles.tierBadge,
              { backgroundColor: TIER_COLORS[currentTier].bg },
            ]}
          >
            <Ionicons
              name={currentTier === 'team' ? 'people' : currentTier === 'tradie' ? 'hammer' : 'person'}
              size={16}
              color={TIER_COLORS[currentTier].text}
            />
            <Text style={[styles.tierBadgeText, { color: TIER_COLORS[currentTier].text }]}>
              {currentTier === 'free' ? 'Free' : currentTier === 'tradie' ? '$4.99/wk' : '$9.99/wk'}
            </Text>
          </View>
        </View>

        {/* Usage Stats */}
        {usage && (
          <View style={styles.usageSection}>
            <Text style={styles.usageSectionTitle}>This Month's Usage</Text>
            <UsageBar label="Invoices" used={usage.invoicesThisMonth} limit={usage.invoiceLimit} />
            <UsageBar label="SWMS" used={usage.swmsThisMonth} limit={usage.swmsLimit} />
            <UsageBar label="AI Assistant" used={usage.aiCallsThisMonth} limit={usage.aiCallLimit} />
            {usage.teamMemberLimit && usage.teamMemberLimit > 0 && (
              <UsageBar label="Team Members" used={usage.teamMembers} limit={usage.teamMemberLimit} />
            )}
            
            {currentTier !== 'free' && !usage.invoiceLimit && !usage.swmsLimit && (
              <View style={styles.unlimitedRow}>
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
                <Text style={styles.unlimitedText}>Unlimited invoices & SWMS</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Tier Comparison */}
      <Text style={styles.sectionTitle}>Compare Plans</Text>

      {TIERS.map((tier) => {
        const isCurrent = tier.slug === currentTier;
        const colors = TIER_COLORS[tier.slug];

        return (
          <View
            key={tier.slug}
            style={[
              styles.tierCard,
              { borderColor: isCurrent ? colors.border : '#E5E7EB' },
              isCurrent && { borderWidth: 2 },
            ]}
          >
            <View style={styles.tierHeader}>
              <View>
                <Text style={[styles.tierName, { color: colors.text }]}>{tier.name}</Text>
                <Text style={styles.tierPrice}>
                  {tier.priceWeekly}
                  <Text style={styles.tierPricePer}>
                    {tier.slug !== 'free' ? ' NZD/week' : ''}
                  </Text>
                </Text>
                {tier.slug !== 'free' && (
                  <Text style={styles.tierMonthly}>~{tier.priceMonthly}/month</Text>
                )}
              </View>
              {isCurrent && (
                <View style={[styles.currentBadge, { backgroundColor: colors.bg }]}>
                  <Text style={[styles.currentBadgeText, { color: colors.text }]}>
                    Current
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.featureList}>
              {tier.features.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={16} color="#059669" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            {!isCurrent && (
              <TouchableOpacity
                style={[styles.upgradeButton, { backgroundColor: colors.text }]}
                onPress={() => handleUpgrade(tier.slug)}
              >
                <Text style={styles.upgradeButtonText}>
                  {TIERS.findIndex((t) => t.slug === tier.slug) >
                  TIERS.findIndex((t) => t.slug === currentTier)
                    ? 'Upgrade'
                    : 'Downgrade'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Footer Note */}
      <Text style={styles.footerNote}>
        Less than a coffee a week. Cancel anytime.{'\n'}
        Prices in NZD. GST inclusive.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },

  // Beta Banner
  betaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  betaTextWrap: {
    flex: 1,
  },
  betaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  betaSubtitle: {
    fontSize: 13,
    color: '#065F46',
    marginTop: 2,
  },

  // Current Plan
  currentPlanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  currentPlanLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  currentPlanName: {
    fontSize: 24,
    fontWeight: '800',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  tierBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Usage
  usageSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  usageSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  usageRow: {
    marginBottom: 12,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  usageLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  usageCount: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  usageCountWarning: {
    color: '#DC2626',
  },
  usageBarBg: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 4,
  },
  usageBarFillWarning: {
    backgroundColor: '#DC2626',
  },
  unlimitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  unlimitedText: {
    fontSize: 14,
    color: '#374151',
  },

  // Section Title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },

  // Tier Cards
  tierCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tierName: {
    fontSize: 20,
    fontWeight: '700',
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  tierPricePer: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
  },
  tierMonthly: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  currentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Features
  featureList: {
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
  },

  // Upgrade Button
  upgradeButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Footer
  footerNote: {
    textAlign: 'center',
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 16,
    lineHeight: 20,
  },
});
