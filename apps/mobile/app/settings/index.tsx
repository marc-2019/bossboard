/**
 * Settings Screen
 * User profile and app settings (moved from profile tab)
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { authApi, notificationsApi } from '../../src/services/api';
import { registerForPushNotificationsAsync } from '../../src/hooks/useNotifications';
import { InContentBack } from '../../src/components/InContentBack';

interface MenuItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
  color?: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data including invoices, quotes, expenses, job logs, SWMS documents, certifications, and team memberships.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            // Double-confirm for safety
            Alert.alert(
              'Are you absolutely sure?',
              'All your data will be permanently deleted. You will be signed out immediately.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await authApi.deleteAccount();
                      await logout();
                      Alert.alert('Account Deleted', 'Your account and all data have been permanently deleted.');
                    } catch (error: any) {
                      Alert.alert('Error', error.message || 'Failed to delete account. Please try again or contact support@instilligent.com.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function handleTestNotification() {
    try {
      // Make sure we have a token registered first
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        Alert.alert('Notifications', 'Push notifications are not available on this device. Please use a physical device.');
        return;
      }
      await notificationsApi.registerPushToken(token);
      const response = await notificationsApi.sendTest();
      if ((response.data as any).success) {
        Alert.alert('Success', 'Test notification sent! You should receive it shortly.');
      } else {
        Alert.alert('Error', 'Failed to send test notification. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send test notification.');
    }
  }

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Account',
      items: [
        { id: 'profile', icon: 'person-outline', label: 'Edit Profile', showChevron: true, onPress: () => router.push('/settings/profile' as any) },
        { id: 'business', icon: 'business-outline', label: 'Business Details', showChevron: true, onPress: () => router.push('/settings/business-profile' as any) },
        { id: 'bank', icon: 'card-outline', label: 'Bank Details', showChevron: true, onPress: () => router.push('/settings/bank-details' as any) },
        { id: 'notifications', icon: 'notifications-outline', label: 'Test Notifications', onPress: handleTestNotification },
      ],
    },
    {
      title: 'Subscription',
      items: [
        { id: 'subscription', icon: 'diamond-outline', label: 'Manage Plan', showChevron: true, onPress: () => router.push('/subscription' as any) },
        {
          id: 'invite-mate',
          icon: 'gift-outline',
          label: 'Invite a mate (free month)',
          showChevron: true,
          onPress: () => router.push('/settings/invite-mate' as any),
        },
      ],
    },
    {
      title: 'Team',
      items: [
        { id: 'team', icon: 'people-outline', label: 'Manage Team', showChevron: true, onPress: () => router.push('/teams' as any) },
      ],
    },
    {
      title: 'Data',
      items: [
        { id: 'export', icon: 'download-outline', label: 'Export Data', showChevron: true, onPress: () => Alert.alert('Coming Soon', 'Data export will be available in a future update.') },
        { id: 'sync', icon: 'sync-outline', label: 'Sync Status', showChevron: true, onPress: () => Alert.alert('Sync Status', 'All data is synced and up to date.') },
      ],
    },
    {
      title: 'Support',
      items: [
        { id: 'help', icon: 'help-circle-outline', label: 'Help Centre', showChevron: true, onPress: () => Alert.alert('Help Centre', 'Visit our website for help and FAQs.') },
        { id: 'feedback', icon: 'chatbubble-outline', label: 'Send Feedback', showChevron: true, onPress: () => router.push('/settings/feedback' as any) },
        { id: 'about', icon: 'information-circle-outline', label: 'About', showChevron: true, onPress: () => Alert.alert('About', 'BossBoard v0.5.0\nBuilt by Instilligent Limited\n\nYour whole business. One screen.\nCompliance, cashflow & operations for NZ tradies.') },
        { id: 'legal', icon: 'shield-checkmark-outline', label: 'Legal & Disclaimer', showChevron: true, onPress: () => Alert.alert('Legal & Disclaimer', 'BossBoard is not affiliated with, endorsed by, or officially connected to WorkSafe New Zealand, any New Zealand government agency, or any regulatory body.\n\nCompliance information and templates provided are for guidance only and should not be considered legal or professional advice.\n\nUsers should verify all safety documentation meets their specific requirements.\n\nFor official compliance guidance, visit worksafe.govt.nz\n\nPrivacy Policy: https://api.instilligent.com/legal/privacy') },
      ],
    },
    {
      title: '',
      items: [
        {
          id: 'logout',
          icon: 'log-out-outline',
          label: 'Sign Out',
          color: '#EF4444',
          onPress: handleLogout,
        },
        {
          id: 'delete-account',
          icon: 'trash-outline',
          label: 'Delete Account',
          color: '#DC2626',
          onPress: handleDeleteAccount,
        },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <InContentBack fallback="/(tabs)" />
      {/* Profile Header */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name ? user.name[0].toUpperCase() : user?.email[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || 'User'}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          {user?.businessName && (
            <Text style={styles.profileBusiness}>{user.businessName}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.editButton} onPress={() => router.push('/settings/profile' as any)}>
          <Ionicons name="pencil" size={20} color="#FF6B35" />
        </TouchableOpacity>
      </View>

      {/* Trade Badge */}
      {user?.tradeType && (
        <View style={styles.tradeBadge}>
          <Ionicons name="construct" size={16} color="#FF6B35" />
          <Text style={styles.tradeText}>
            {user.tradeType.charAt(0).toUpperCase() + user.tradeType.slice(1)}
          </Text>
        </View>
      )}

      {/* Menu Sections */}
      {menuSections.map((section) => (
        <View key={section.title || 'last'} style={styles.section}>
          {section.title ? (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          ) : null}
          <View style={styles.menuCard}>
            {section.items.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  index < section.items.length - 1 && styles.menuItemBorder,
                ]}
                onPress={item.onPress}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={item.color || '#374151'}
                />
                <Text
                  style={[styles.menuLabel, item.color && { color: item.color }]}
                >
                  {item.label}
                </Text>
                {item.showChevron && (
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.version}>BossBoard v0.5.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  profileBusiness: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  editButton: {
    padding: 8,
  },
  tradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 24,
  },
  tradeText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  version: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 8,
  },
});
