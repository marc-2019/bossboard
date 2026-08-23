/**
 * Job Log Detail Screen
 * View job log details, clock out, or delete
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { jobLogsApi } from '../../src/services/api';
import { safeGoBack } from '../../src/utils/navigation';
import { JobLogKeyboardDismissChrome } from '../../src/components/JobLogKeyboardDismissChrome';
import {
  jobLogScrollKeyboard,
  jobLogTextFieldKeyboard,
} from '../../src/utils/jobLogKeyboard';

interface JobLog {
  id: string;
  description: string;
  siteAddress: string | null;
  customerId: string | null;
  startTime: string;
  endTime: string | null;
  status: 'active' | 'completed';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function JobLogDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [jobLog, setJobLog] = useState<JobLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClockingOut, setIsClockingOut] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [showClockOutForm, setShowClockOutForm] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadJobLog();
    }, [id])
  );

  // Live timer for active logs
  useEffect(() => {
    if (jobLog?.status === 'active') {
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else if (jobLog) {
      // Completed - show final duration
      setElapsed(getDuration(jobLog.startTime, jobLog.endTime));
    }
  }, [jobLog?.status, jobLog?.startTime]);

  function updateElapsed() {
    if (jobLog?.startTime) {
      setElapsed(getDuration(jobLog.startTime, null));
    }
  }

  function getDuration(start: string, end: string | null): string {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  async function loadJobLog() {
    try {
      const response = await jobLogsApi.get(id as string);
      if ((response.data as any).success) {
        setJobLog((response.data as any).data.jobLog);
      }
    } catch (error) {
      console.error('Failed to load job log:', error);
      Alert.alert('Error', 'Failed to load job log');
      router.back();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClockOut() {
    setIsClockingOut(true);
    try {
      await jobLogsApi.clockOut(id as string, clockOutNotes.trim() || undefined);
      setShowClockOutForm(false);
      await loadJobLog();
      // After-job wedge (Radar): SWMS then invoice — free-tier path is SWMS→invoice; job log is optional trigger
      const desc = jobLog?.description || '';
      const site = jobLog?.siteAddress || '';
      const params = new URLSearchParams();
      if (desc) params.set('jobDescription', desc.slice(0, 500));
      if (site) params.set('siteAddress', site.slice(0, 200));
      const qs = params.toString();
      Alert.alert(
        'Job clocked out',
        'Finish the paperwork while it’s fresh — SWMS for the site, then invoice so you get paid.',
        [
          {
            text: 'SWMS for this job',
            onPress: () =>
              router.push(
                (qs ? `/swms/generate?${qs}` : '/swms/generate') as any
              ),
          },
          {
            text: 'Draft invoice',
            onPress: () =>
              router.push(
                (qs ? `/invoices/create?${qs}` : '/invoices/create') as any
              ),
          },
          { text: 'Later', style: 'cancel' },
        ]
      );
    } catch (error: any) {
      const message = error?.response?.data?.message || error.message || 'Failed to clock out';
      Alert.alert('Error', message);
    } finally {
      setIsClockingOut(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Job Log',
      'Are you sure you want to delete this job log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await jobLogsApi.delete(id as string);
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete job log');
            }
          },
        },
      ]
    );
  }

  function formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (isLoading || !jobLog) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  const isActive = jobLog.status === 'active';

  function leaveJobDetails() {
    safeGoBack(router, '/(tabs)');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        {...jobLogScrollKeyboard}
      >
        <TouchableOpacity
          style={styles.inContentExit}
          onPress={leaveJobDetails}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="job-details-exit"
        >
          <Ionicons name="chevron-back" size={20} color="#0D9488" />
          <Text style={styles.inContentExitText}>Go back</Text>
        </TouchableOpacity>

        <JobLogKeyboardDismissChrome>
          <View style={[styles.timerCard, isActive && styles.timerCardActive]}>
            <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusCompleted]}>
              <Ionicons
                name={isActive ? 'radio-button-on' : 'checkmark-circle'}
                size={16}
                color={isActive ? '#0D9488' : '#10B981'}
              />
              <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextCompleted]}>
                {isActive ? 'Active' : 'Completed'}
              </Text>
            </View>
            <Text style={[styles.timerValue, isActive && styles.timerValueActive]}>
              {elapsed}
            </Text>
            <Text style={styles.timerLabel}>
              {isActive ? 'Time on site' : 'Total duration'}
            </Text>
          </View>

          <View style={styles.detailCard}>
            <DetailRow icon="briefcase" label="Job" value={jobLog.description} />
            <DetailRow icon="time" label="Clocked In" value={formatDateTime(jobLog.startTime)} />
            {jobLog.endTime && (
              <DetailRow icon="time-outline" label="Clocked Out" value={formatDateTime(jobLog.endTime)} />
            )}
            {jobLog.siteAddress && (
              <DetailRow icon="location" label="Site" value={jobLog.siteAddress} />
            )}
            {jobLog.notes && (
              <DetailRow icon="chatbox" label="Notes" value={jobLog.notes} />
            )}
          </View>
        </JobLogKeyboardDismissChrome>

        {isActive && !showClockOutForm && (
          <TouchableOpacity
            style={styles.clockOutButton}
            onPress={() => setShowClockOutForm(true)}
          >
            <Ionicons name="stop-circle" size={22} color="#fff" />
            <Text style={styles.clockOutButtonText}>Clock Out</Text>
          </TouchableOpacity>
        )}

        {isActive && showClockOutForm && (
          <View style={styles.clockOutForm}>
            <JobLogKeyboardDismissChrome>
              <Text style={styles.clockOutFormTitle}>Clock Out</Text>
            </JobLogKeyboardDismissChrome>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={clockOutNotes}
              onChangeText={setClockOutNotes}
              placeholder="Add any notes about the job (optional)..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              {...jobLogTextFieldKeyboard}
            />
            <View style={styles.clockOutActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowClockOutForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmClockOutButton, isClockingOut && styles.buttonDisabled]}
                onPress={handleClockOut}
                disabled={isClockingOut}
              >
                <Ionicons name="stop-circle" size={18} color="#fff" />
                <Text style={styles.confirmClockOutText}>
                  {isClockingOut ? 'Clocking Out...' : 'Confirm Clock Out'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {!isActive && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={leaveJobDetails}
              accessibilityRole="button"
              accessibilityLabel="Done"
              testID="job-details-done"
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteText}>Delete Job Log</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon as any} size={18} color="#6B7280" />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  inContentExit: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 4,
    paddingRight: 12,
    gap: 2,
  },
  inContentExitText: {
    fontSize: 16,
    color: '#0D9488',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  timerCard: {
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
  timerCardActive: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  statusActive: {
    backgroundColor: '#CCFBF1',
  },
  statusCompleted: {
    backgroundColor: '#D1FAE5',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#0D9488',
  },
  statusTextCompleted: {
    color: '#10B981',
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
  },
  timerValueActive: {
    color: '#0D9488',
  },
  timerLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  detailRow: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailIcon: {
    width: 32,
    alignItems: 'center',
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    color: '#111827',
    marginTop: 2,
  },
  clockOutButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  clockOutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  clockOutForm: {
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
  clockOutFormTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  clockOutActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmClockOutButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  confirmClockOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  doneButton: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
});
