/**
 * Team Member Detail Screen
 * View team member details and manage their role
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { safeGoBack } from '../../src/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { teamsApi } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'worker';
  joined_at?: string;
  trade_type?: string;
  phone?: string;
}

interface Team {
  id: string;
  name: string;
}

export default function TeamMemberDetailScreen() {
  const { id: memberId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string>('worker');

  const loadMemberData = useCallback(async () => {
    try {
      const teamResponse = await teamsApi.getMyTeam();
      if (teamResponse.data.success) {
        const teamData = teamResponse.data.data.team || teamResponse.data.data;
        setTeam(teamData);

        const membersResponse = await teamsApi.listMembers(teamData.id);
        if (membersResponse.data.success) {
          const members = membersResponse.data.data.members || membersResponse.data.data || [];
          const foundMember = members.find((m: TeamMember) => m.id === memberId);
          if (foundMember) {
            setMember(foundMember);
          }

          // Find current user's role
          const currentMember = members.find((m: TeamMember) => m.userId === user?.id);
          if (currentMember) {
            setCurrentUserRole(currentMember.role);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load member:', error);
    } finally {
      setIsLoading(false);
    }
  }, [memberId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadMemberData();
    }, [loadMemberData])
  );

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';
  const isCurrentUser = member?.userId === user?.id;
  const isMemberOwner = member?.role === 'owner';

  async function handleChangeRole(newRole: 'admin' | 'worker') {
    if (!team || !member) return;

    Alert.alert(
      'Change Role',
      `Change ${member.name}'s role to ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await teamsApi.updateMemberRole(team.id, member.id, newRole);
              setMember((prev) => prev ? { ...prev, role: newRole } : null);
              Alert.alert('Success', `${member.name} is now a${newRole === 'admin' ? 'n admin' : ' worker'}`);
            } catch (error) {
              Alert.alert('Error', 'Failed to update role');
            }
          },
        },
      ]
    );
  }

  async function handleRemoveMember() {
    if (!team || !member) return;

    Alert.alert(
      'Remove Team Member',
      `Are you sure you want to remove ${member.name} from the team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await teamsApi.removeMember(team.id, member.id);
              safeGoBack(router, '/(tabs)');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove team member');
            }
          },
        },
      ]
    );
  }

  function getRoleColor(role: string): string {
    switch (role) {
      case 'owner': return '#7C3AED';
      case 'admin': return '#2563EB';
      case 'worker': return '#059669';
      default: return '#6B7280';
    }
  }

  function getRoleIcon(role: string): keyof typeof Ionicons.glyphMap {
    switch (role) {
      case 'owner': return 'shield';
      case 'admin': return 'key';
      case 'worker': return 'construct';
      default: return 'person';
    }
  }

  function getRoleDescription(role: string): string {
    switch (role) {
      case 'owner': return 'Full control over the team, billing, and settings';
      case 'admin': return 'Can manage team members and view all team data';
      case 'worker': return 'Can view team info and manage their own work';
      default: return '';
    }
  }

  function formatDate(dateString: string | undefined): string {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!member) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="person-outline" size={48} color="#D1D5DB" />
        <Text style={styles.errorText}>Team member not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => safeGoBack(router, '/(tabs)')}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const roleColor = getRoleColor(member.role);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: roleColor + '20' }]}>
            <Text style={[styles.avatarText, { color: roleColor }]}>
              {getInitials(member.name)}
            </Text>
          </View>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberEmail}>{member.email}</Text>

          <View style={[styles.roleBadge, { backgroundColor: roleColor + '15' }]}>
            <Ionicons name={getRoleIcon(member.role)} size={16} color={roleColor} />
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>
              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
            </Text>
          </View>
          <Text style={styles.roleDescription}>{getRoleDescription(member.role)}</Text>

          {isCurrentUser && (
            <View style={styles.youBadge}>
              <Ionicons name="person" size={14} color="#6B7280" />
              <Text style={styles.youBadgeText}>This is you</Text>
            </View>
          )}
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="mail-outline" size={18} color="#6B7280" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailValue}>{member.email}</Text>
            </View>
          </View>

          {member.phone && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="call-outline" size={18} color="#6B7280" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Phone</Text>
                <Text style={styles.detailValue}>{member.phone}</Text>
              </View>
            </View>
          )}

          {member.trade_type && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="construct-outline" size={18} color="#6B7280" />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Trade</Text>
                <Text style={styles.detailValue}>{member.trade_type}</Text>
              </View>
            </View>
          )}

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Joined</Text>
              <Text style={styles.detailValue}>{formatDate(member.joined_at)}</Text>
            </View>
          </View>
        </View>

        {/* Role Management - only for owners/admins and not for self or owner */}
        {canManage && !isCurrentUser && !isMemberOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Manage Role</Text>
            <Text style={styles.sectionSubtext}>
              Change this member's permissions within the team
            </Text>

            <View style={styles.roleOptions}>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  member.role === 'admin' && styles.roleOptionActive,
                ]}
                onPress={() => member.role !== 'admin' && handleChangeRole('admin')}
              >
                <View style={styles.roleOptionHeader}>
                  <Ionicons name="key" size={20} color={member.role === 'admin' ? '#2563EB' : '#6B7280'} />
                  <Text style={[styles.roleOptionTitle, member.role === 'admin' && styles.roleOptionTitleActive]}>
                    Admin
                  </Text>
                  {member.role === 'admin' && (
                    <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                  )}
                </View>
                <Text style={styles.roleOptionDesc}>
                  Can manage team members and view all team data
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  member.role === 'worker' && styles.roleOptionActive,
                ]}
                onPress={() => member.role !== 'worker' && handleChangeRole('worker')}
              >
                <View style={styles.roleOptionHeader}>
                  <Ionicons name="construct" size={20} color={member.role === 'worker' ? '#059669' : '#6B7280'} />
                  <Text style={[styles.roleOptionTitle, member.role === 'worker' && { color: '#059669' }]}>
                    Worker
                  </Text>
                  {member.role === 'worker' && (
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                  )}
                </View>
                <Text style={styles.roleOptionDesc}>
                  Can view team info and manage their own work
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Remove Member - only for owners/admins and not for self or owner */}
        {canManage && !isCurrentUser && !isMemberOwner && (
          <TouchableOpacity style={styles.dangerButton} onPress={handleRemoveMember}>
            <Ionicons name="person-remove" size={20} color="#EF4444" />
            <Text style={styles.dangerButtonText}>Remove from Team</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#374151',
    marginTop: 12,
  },
  backButton: {
    marginTop: 16,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  roleBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  roleDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  youBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  youBadgeText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  roleOptions: {
    gap: 10,
  },
  roleOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
  },
  roleOptionActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  roleOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  roleOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  roleOptionTitleActive: {
    color: '#2563EB',
  },
  roleOptionDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 28,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
});
