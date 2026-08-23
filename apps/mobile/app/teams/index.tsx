/**
 * Team Management Screen
 * View team, invite members, manage roles
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { teamsApi } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { InContentBack } from '../../src/components/InContentBack';

interface TeamMember {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'worker';
  acceptedAt: string | null;
}

interface TeamInvite {
  id: string;
  email: string;
  role: string;
  inviteCode: string;
  expiresAt: string;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  teamName: string;
  invitedByName: string;
  invitedByEmail: string;
  role: string;
  inviteCode: string;
  expiresAt: string;
}

type TabType = 'members' | 'invites' | 'pending';

export default function TeamsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [team, setTeam] = useState<any>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('members');

  // Create team
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite member
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'worker'>('worker');
  const [inviting, setInviting] = useState(false);

  const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin';

  async function loadData() {
    try {
      const [teamRes, pendingRes] = await Promise.all([
        teamsApi.getMyTeam(),
        teamsApi.getMyPendingInvites(),
      ]);

      const teamData = (teamRes.data as any).data;
      const pendingData = (pendingRes.data as any).data;

      if (teamData.team) {
        setTeam(teamData.team);
        setMyRole(teamData.role);
        setMembers(teamData.members || []);

        // Load invites if owner/admin
        if (teamData.role === 'owner' || teamData.role === 'admin') {
          try {
            const invitesRes = await teamsApi.listInvites(teamData.team.id);
            setInvites((invitesRes.data as any).data.invites || []);
          } catch {
            setInvites([]);
          }
        }
      } else {
        setTeam(null);
        setMyRole(null);
        setMembers([]);
        setInvites([]);
      }

      setPendingInvites(pendingData.invites || []);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load team data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function handleCreateTeam() {
    if (!teamName.trim()) {
      Alert.alert('Error', 'Team name is required');
      return;
    }
    setCreating(true);
    try {
      await teamsApi.create({ name: teamName.trim() });
      setTeamName('');
      setShowCreateForm(false);
      await loadData();
      Alert.alert('Success', 'Team created! You are the owner.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create team');
    } finally {
      setCreating(false);
    }
  }

  async function handleInviteMember() {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Email address is required');
      return;
    }
    setInviting(true);
    try {
      await teamsApi.inviteMember(team.id, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });
      setInviteEmail('');
      setShowInviteForm(false);
      await loadData();
      Alert.alert('Success', `Invite sent to ${inviteEmail.trim()}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleAcceptInvite(inviteCode: string) {
    try {
      await teamsApi.acceptInvite(inviteCode);
      await loadData();
      Alert.alert('Success', 'You have joined the team!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to accept invite');
    }
  }

  async function handleDeclineInvite(inviteCode: string) {
    Alert.alert('Decline Invite', 'Are you sure you want to decline this invite?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await teamsApi.declineInvite(inviteCode);
            await loadData();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to decline invite');
          }
        },
      },
    ]);
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    Alert.alert('Remove Member', `Remove ${memberName || 'this member'} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await teamsApi.removeMember(team.id, memberId);
            await loadData();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to remove member');
          }
        },
      },
    ]);
  }

  async function handleCancelInvite(inviteId: string) {
    Alert.alert('Cancel Invite', 'Cancel this pending invite?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Invite',
        style: 'destructive',
        onPress: async () => {
          try {
            await teamsApi.cancelInvite(team.id, inviteId);
            await loadData();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to cancel invite');
          }
        },
      },
    ]);
  }

  async function handleChangeRole(memberId: string, memberName: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'worker' : 'admin';
    Alert.alert(
      'Change Role',
      `Change ${memberName || 'this member'} to ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            try {
              await teamsApi.updateMemberRole(team.id, memberId, newRole);
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to change role');
            }
          },
        },
      ]
    );
  }

  async function handleLeaveTeam() {
    Alert.alert('Leave Team', 'Are you sure you want to leave this team?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await teamsApi.leaveTeam(team.id);
            await loadData();
            Alert.alert('Done', 'You have left the team');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to leave team');
          }
        },
      },
    ]);
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'owner': return '#7C3AED';
      case 'admin': return '#FF6B35';
      case 'worker': return '#059669';
      default: return '#6B7280';
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <InContentBack fallback="/(tabs)/people" />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  // No team - show create or pending invites
  if (!team) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
      >
        <InContentBack fallback="/(tabs)/people" />
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Team Yet</Text>
          <Text style={styles.emptyText}>
            Create a team to start collaborating with your crew, or accept a pending invite.
          </Text>
        </View>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Invites</Text>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteTeamName}>{invite.teamName}</Text>
                  <Text style={styles.inviteFrom}>
                    From: {invite.invitedByName || invite.invitedByEmail}
                  </Text>
                  <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(invite.role) + '20' }]}>
                    <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(invite.role) }]}>
                      {invite.role}
                    </Text>
                  </View>
                </View>
                <View style={styles.inviteActions}>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptInvite(invite.inviteCode)}
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineButton}
                    onPress={() => handleDeclineInvite(invite.inviteCode)}
                  >
                    <Ionicons name="close" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Create Team */}
        {!showCreateForm ? (
          <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateForm(true)}>
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.createButtonText}>Create a Team</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create Team</Text>
            <TextInput
              style={styles.input}
              placeholder="Team name (e.g. Smith Plumbing)"
              placeholderTextColor="#9CA3AF"
              value={teamName}
              onChangeText={setTeamName}
              autoFocus
            />
            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.cancelFormButton}
                onPress={() => { setShowCreateForm(false); setTeamName(''); }}
              >
                <Text style={styles.cancelFormText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, creating && styles.submitButtonDisabled]}
                onPress={handleCreateTeam}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  // Has a team - show team management
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
    >
      <InContentBack fallback="/(tabs)/people" />
      {/* Team Header */}
      <View style={styles.teamHeader}>
        <View style={styles.teamIcon}>
          <Ionicons name="people" size={28} color="#FF6B35" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamMeta}>
            {members.length} member{members.length !== 1 ? 's' : ''} &bull; You are {myRole}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'members' && styles.activeTab]}
          onPress={() => setActiveTab('members')}
        >
          <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>
            Members ({members.length})
          </Text>
        </TouchableOpacity>
        {isOwnerOrAdmin && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'invites' && styles.activeTab]}
            onPress={() => setActiveTab('invites')}
          >
            <Text style={[styles.tabText, activeTab === 'invites' && styles.activeTabText]}>
              Invites ({invites.length})
            </Text>
          </TouchableOpacity>
        )}
        {pendingInvites.length > 0 && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
              My Invites ({pendingInvites.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <View>
          {members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {(member.name || member.email)[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{member.name || 'Unnamed'}</Text>
                <Text style={styles.memberEmail}>{member.email}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(member.role) + '20' }]}>
                <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(member.role) }]}>
                  {member.role}
                </Text>
              </View>
              {/* Actions for owner: change role or remove (not self, not owner) */}
              {myRole === 'owner' && member.role !== 'owner' && member.userId !== user?.id && (
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    onPress={() => handleChangeRole(member.userId, member.name || member.email, member.role)}
                    style={styles.memberActionBtn}
                  >
                    <Ionicons name="swap-horizontal" size={18} color="#6B7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(member.userId, member.name || member.email)}
                    style={styles.memberActionBtn}
                  >
                    <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}
              {/* Admin can remove workers */}
              {myRole === 'admin' && member.role === 'worker' && member.userId !== user?.id && (
                <TouchableOpacity
                  onPress={() => handleRemoveMember(member.userId, member.name || member.email)}
                  style={styles.memberActionBtn}
                >
                  <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Invite button */}
          {isOwnerOrAdmin && !showInviteForm && (
            <TouchableOpacity style={styles.inviteButton} onPress={() => setShowInviteForm(true)}>
              <Ionicons name="person-add-outline" size={20} color="#FF6B35" />
              <Text style={styles.inviteButtonText}>Invite Team Member</Text>
            </TouchableOpacity>
          )}

          {/* Invite form */}
          {isOwnerOrAdmin && showInviteForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Invite Member</Text>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#9CA3AF"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              <View style={styles.roleSelector}>
                <Text style={styles.roleLabel}>Role:</Text>
                <TouchableOpacity
                  style={[styles.roleOption, inviteRole === 'worker' && styles.roleOptionActive]}
                  onPress={() => setInviteRole('worker')}
                >
                  <Text style={[styles.roleOptionText, inviteRole === 'worker' && styles.roleOptionTextActive]}>
                    Worker
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleOption, inviteRole === 'admin' && styles.roleOptionActive]}
                  onPress={() => setInviteRole('admin')}
                >
                  <Text style={[styles.roleOptionText, inviteRole === 'admin' && styles.roleOptionTextActive]}>
                    Admin
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelFormButton}
                  onPress={() => { setShowInviteForm(false); setInviteEmail(''); }}
                >
                  <Text style={styles.cancelFormText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, inviting && styles.submitButtonDisabled]}
                  onPress={handleInviteMember}
                  disabled={inviting}
                >
                  {inviting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Send Invite</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Leave team (non-owners) */}
          {myRole !== 'owner' && (
            <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveTeam}>
              <Ionicons name="exit-outline" size={20} color="#EF4444" />
              <Text style={styles.leaveButtonText}>Leave Team</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Invites Tab (owner/admin) */}
      {activeTab === 'invites' && isOwnerOrAdmin && (
        <View>
          {invites.length === 0 ? (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>No pending invites</Text>
            </View>
          ) : (
            invites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteEmail}>{invite.email}</Text>
                  <Text style={styles.inviteMeta}>
                    Role: {invite.role} &bull; Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleCancelInvite(invite.id)}
                  style={styles.cancelInviteBtn}
                >
                  <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))
          )}

          {!showInviteForm && (
            <TouchableOpacity style={styles.inviteButton} onPress={() => { setShowInviteForm(true); setActiveTab('members'); }}>
              <Ionicons name="person-add-outline" size={20} color="#FF6B35" />
              <Text style={styles.inviteButtonText}>Send New Invite</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Pending Invites Tab (user's own incoming invites) */}
      {activeTab === 'pending' && (
        <View>
          {pendingInvites.map((invite) => (
            <View key={invite.id} style={styles.inviteCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteTeamName}>{invite.teamName}</Text>
                <Text style={styles.inviteFrom}>
                  From: {invite.invitedByName || invite.invitedByEmail}
                </Text>
                <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(invite.role) + '20' }]}>
                  <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(invite.role) }]}>
                    {invite.role}
                  </Text>
                </View>
              </View>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleAcceptInvite(invite.inviteCode)}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={() => handleDeclineInvite(invite.inviteCode)}
                >
                  <Ionicons name="close" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
    lineHeight: 20,
  },

  // Section
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

  // Team Header
  teamHeader: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  teamIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  teamName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  teamMeta: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FF6B35',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#fff',
  },

  // Member Card
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 1,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  memberEmail: {
    fontSize: 13,
    color: '#6B7280',
  },
  memberActions: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
  },
  memberActionBtn: {
    padding: 6,
  },

  // Role Badge
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    marginLeft: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // Invite Card
  inviteCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 1,
  },
  inviteTeamName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  inviteFrom: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  inviteEmail: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  inviteMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  acceptButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelInviteBtn: {
    padding: 6,
    marginLeft: 8,
  },

  // Buttons
  createButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#FF6B35',
    borderRadius: 10,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  inviteButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FF6B35',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 24,
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#EF4444',
  },

  // Form
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  roleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  roleLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  roleOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  roleOptionActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  roleOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  roleOptionTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelFormButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelFormText: {
    fontSize: 15,
    color: '#6B7280',
  },
  submitButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Empty Tab
  emptyTab: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTabText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
});
