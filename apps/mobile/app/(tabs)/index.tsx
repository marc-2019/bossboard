/**
 * Home Screen
 * Dashboard with stats, quick actions, and recent documents
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { swmsApi, statsApi, recurringInvoicesApi, jobLogsApi } from '../../src/services/api';
import {
  getLastLiveJob,
  hasSuppressedActiveJobLogs,
  isActiveJobLogSuppressed,
  rememberLastLiveJob,
  setActiveJobLogOwner,
  subscribeActiveJobInvalidation,
} from '../../src/services/activeJobLog';

// Insights types
interface RevenueComparison {
  thisMonth: number;
  lastMonth: number;
  percentChange: number;
}

interface InvoiceAging {
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyPlus: number;
  currentAmount: number;
  thirtyDayAmount: number;
  sixtyDayAmount: number;
  ninetyPlusAmount: number;
}

interface TopCustomer {
  customerId: string;
  customerName: string;
  revenue: number;
  invoiceCount: number;
}

interface MonthlyRevenue {
  month: string;
  label: string;
  revenue: number;
  count: number;
}

interface InsightsData {
  revenue: RevenueComparison;
  aging: InvoiceAging;
  topCustomers: TopCustomer[];
  monthlyRevenue: MonthlyRevenue[];
}

interface SWMSDocument {
  id: string;
  title: string;
  trade_type: string;
  status: string;
  created_at: string;
}

interface ActiveJobLog {
  id: string;
  description: string;
  siteAddress: string | null;
  startTime: string;
}

function asLiveJobLog(jobLog: unknown): ActiveJobLog | null {
  if (!jobLog || typeof jobLog !== 'object') return null;
  const row = jobLog as {
    id?: unknown;
    description?: unknown;
    siteAddress?: unknown;
    startTime?: unknown;
    status?: unknown;
  };
  if (row.status !== 'active') return null;
  if (typeof row.id !== 'string' || typeof row.description !== 'string' || typeof row.startTime !== 'string') {
    return null;
  }
  return {
    id: row.id,
    description: row.description,
    siteAddress: typeof row.siteAddress === 'string' ? row.siteAddress : null,
    startTime: row.startTime,
  };
}

interface DashboardStats {
  swms: {
    total: number;
    thisMonth: number;
    signed: number;
    draft: number;
  };
  invoices: {
    total: number;
    unpaid: number;
    unpaidAmount: number;
    thisMonth: number;
  };
  certifications: {
    total: number;
    expiringSoon: number;
    expired: number;
  };
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [recentDocs, setRecentDocs] = useState<SWMSDocument[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeJobLog, setActiveJobLog] = useState<ActiveJobLog | null>(null);
  const [jobElapsed, setJobElapsed] = useState('');
  const [pendingCount, setPendingCount] = useState({ auto: 0, review: 0 });
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeJobError, setActiveJobError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    setActiveJobLogOwner(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    return subscribeActiveJobInvalidation(() => {
      loadGenerationRef.current += 1;
      setActiveJobLog(null);
      setActiveJobError(null);
    });
  }, []);

  function liveJobFromActivePayload(jobLog: unknown): ActiveJobLog | null {
    const live = asLiveJobLog(jobLog);
    if (!live) return null;
    if (isActiveJobLogSuppressed(live.id)) return null;
    return live;
  }

  const loadData = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    try {
      // Load recent docs, stats, and insights in parallel
      const [docsResponse, statsResponse, pendingResponse, activeJobOutcome, insightsResponse] = await Promise.all([
        swmsApi.list({ limit: 3 }).catch(() => null),
        statsApi.getDashboard().catch(() => null),
        recurringInvoicesApi.getPending().catch(() => null),
        jobLogsApi.getActive().then(
          (res) => ({ ok: true as const, res }),
          (error: unknown) => ({ ok: false as const, error })
        ),
        statsApi.getInsights().catch(() => null),
      ]);

      if (generation !== loadGenerationRef.current) return;

      if (docsResponse?.data?.success) {
        setRecentDocs(docsResponse.data.data.documents || []);
      }

      if (statsResponse?.data?.success) {
        setStats(statsResponse.data.data.stats);
      }

      if (pendingResponse?.data?.success) {
        const data = pendingResponse.data.data;
        setPendingCount({
          auto: (data.autoGenerate || []).length,
          review: (data.needsInput || []).length,
        });
      }

      if (!activeJobOutcome.ok) {
        const last = getLastLiveJob();
        const justHadLive = last !== null || hasSuppressedActiveJobLogs();
        if (justHadLive) {
          setActiveJobError("Couldn't check clock-in status.");
          if (last && !isActiveJobLogSuppressed(last.id)) {
            setActiveJobLog(last);
          } else {
            setActiveJobLog(null);
          }
        }
      } else {
        setActiveJobError(null);
        const jobLog = activeJobOutcome.res?.data?.success
          ? (activeJobOutcome.res.data as { data?: { jobLog?: unknown } }).data?.jobLog
          : null;
        const live = liveJobFromActivePayload(jobLog);
        setActiveJobLog(live);
        rememberLastLiveJob(live);
      }

      if (insightsResponse?.data?.success) {
        setInsights((insightsResponse.data as any).data.insights || null);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Live timer for active job log
  useEffect(() => {
    if (activeJobLog) {
      updateJobElapsed();
      const timer = setInterval(updateJobElapsed, 1000);
      return () => clearInterval(timer);
    } else {
      setJobElapsed('');
    }
  }, [activeJobLog?.id, activeJobLog?.startTime]);

  function updateJobElapsed() {
    if (!activeJobLog?.startTime) return;
    const start = new Date(activeJobLog.startTime).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    if (hours > 0) {
      setJobElapsed(`${hours}h ${minutes}m ${seconds}s`);
    } else if (minutes > 0) {
      setJobElapsed(`${minutes}m ${seconds}s`);
    } else {
      setJobElapsed(`${seconds}s`);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
    });
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'signed':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings' as any)}
            >
              <Ionicons name="settings-outline" size={24} color="#374151" />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Welcome Card */}
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
          </Text>
          <Text style={styles.businessText}>
            {user?.businessName || 'Your Business'}
          </Text>
        </View>

        {/* After-job wedge tip */}
        <View style={styles.afterJobTip} testID="home-after-job-tip">
          <Text style={styles.afterJobTipTitle}>Finish a job faster</Text>
          <Text style={styles.afterJobTipBody}>
            After SWMS, tap Invoice this job. Or clock out a job and choose SWMS / draft invoice.
          </Text>
          <View style={styles.afterJobTipActions}>
            <TouchableOpacity
              style={styles.afterJobTipBtn}
              onPress={() => router.push('/swms/generate' as any)}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
              <Text style={styles.afterJobTipBtnText}>New SWMS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.afterJobTipBtn, styles.afterJobTipBtnSecondary]}
              onPress={() => router.push('/(tabs)/work' as any)}
            >
              <Text style={styles.afterJobTipBtnTextSecondary}>Open Work</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Overview */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push('/(tabs)/work' as any)}
              >
                <Text style={styles.statValue}>{stats.swms.thisMonth}</Text>
                <Text style={styles.statLabel}>SWMS this month</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push('/(tabs)/money' as any)}
              >
                <Text style={[styles.statValue, stats.invoices.unpaid > 0 && styles.statValueWarning]}>
                  {stats.invoices.unpaid > 0
                    ? formatCurrency(stats.invoices.unpaidAmount)
                    : stats.invoices.thisMonth}
                </Text>
                <Text style={styles.statLabel}>
                  {stats.invoices.unpaid > 0 ? 'Unpaid invoices' : 'Invoices this month'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push('/(tabs)/people' as any)}
              >
                <Text
                  style={[
                    styles.statValue,
                    (stats.certifications.expiringSoon > 0 || stats.certifications.expired > 0) &&
                      styles.statValueWarning,
                  ]}
                >
                  {stats.certifications.expiringSoon + stats.certifications.expired || stats.certifications.total}
                </Text>
                <Text style={styles.statLabel}>
                  {stats.certifications.expiringSoon > 0
                    ? 'Certs expiring'
                    : stats.certifications.expired > 0
                    ? 'Certs expired'
                    : 'Certifications'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Business Insights */}
        {insights && (
          <>
            {/* Revenue Comparison */}
            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Ionicons name="trending-up" size={20} color="#FF6B35" />
                <Text style={styles.insightTitle}>Revenue</Text>
              </View>
              <View style={styles.revenueRow}>
                <View style={styles.revenueItem}>
                  <Text style={styles.revenueAmount}>
                    {formatCurrency(insights.revenue.thisMonth)}
                  </Text>
                  <Text style={styles.revenueLabel}>This month</Text>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueItem}>
                  <Text style={styles.revenueAmountMuted}>
                    {formatCurrency(insights.revenue.lastMonth)}
                  </Text>
                  <Text style={styles.revenueLabel}>Last month</Text>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueItem}>
                  <Text
                    style={[
                      styles.revenueChange,
                      {
                        color:
                          insights.revenue.percentChange > 0
                            ? '#10B981'
                            : insights.revenue.percentChange < 0
                            ? '#EF4444'
                            : '#6B7280',
                      },
                    ]}
                  >
                    {insights.revenue.percentChange > 0 ? '↑' : insights.revenue.percentChange < 0 ? '↓' : '—'}
                    {' '}{Math.abs(insights.revenue.percentChange)}%
                  </Text>
                  <Text style={styles.revenueLabel}>Change</Text>
                </View>
              </View>
            </View>

            {/* Monthly Revenue Mini Chart */}
            {insights.monthlyRevenue.length > 0 && (
              <View style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <Ionicons name="bar-chart" size={20} color="#8B5CF6" />
                  <Text style={styles.insightTitle}>6-Month Revenue</Text>
                </View>
                <View style={styles.chartRow}>
                  {insights.monthlyRevenue.map((m) => {
                    const maxRevenue = Math.max(
                      ...insights.monthlyRevenue.map((r) => r.revenue),
                      1
                    );
                    const barHeight = Math.max((m.revenue / maxRevenue) * 80, 4);
                    return (
                      <View key={m.month} style={styles.chartBar}>
                        <Text style={styles.chartAmount}>
                          {m.revenue > 0 ? formatCurrency(m.revenue) : ''}
                        </Text>
                        <View
                          style={[
                            styles.chartBarFill,
                            {
                              height: barHeight,
                              backgroundColor:
                                m.month ===
                                insights.monthlyRevenue[
                                  insights.monthlyRevenue.length - 1
                                ].month
                                  ? '#FF6B35'
                                  : '#BFDBFE',
                            },
                          ]}
                        />
                        <Text style={styles.chartLabel}>{m.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Invoice Aging */}
            {(insights.aging.current > 0 ||
              insights.aging.thirtyDay > 0 ||
              insights.aging.sixtyDay > 0 ||
              insights.aging.ninetyPlus > 0) && (
              <View style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <Ionicons name="time" size={20} color="#F59E0B" />
                  <Text style={styles.insightTitle}>Outstanding Invoices</Text>
                </View>
                <View style={styles.agingRow}>
                  <View style={styles.agingBucket}>
                    <Text style={styles.agingCount}>{insights.aging.current}</Text>
                    <Text style={styles.agingAmount}>
                      {formatCurrency(insights.aging.currentAmount)}
                    </Text>
                    <Text style={styles.agingLabel}>0-30d</Text>
                  </View>
                  <View style={styles.agingBucket}>
                    <Text
                      style={[
                        styles.agingCount,
                        insights.aging.thirtyDay > 0 && { color: '#F59E0B' },
                      ]}
                    >
                      {insights.aging.thirtyDay}
                    </Text>
                    <Text style={styles.agingAmount}>
                      {formatCurrency(insights.aging.thirtyDayAmount)}
                    </Text>
                    <Text style={styles.agingLabel}>31-60d</Text>
                  </View>
                  <View style={styles.agingBucket}>
                    <Text
                      style={[
                        styles.agingCount,
                        insights.aging.sixtyDay > 0 && { color: '#F97316' },
                      ]}
                    >
                      {insights.aging.sixtyDay}
                    </Text>
                    <Text style={styles.agingAmount}>
                      {formatCurrency(insights.aging.sixtyDayAmount)}
                    </Text>
                    <Text style={styles.agingLabel}>61-90d</Text>
                  </View>
                  <View style={styles.agingBucket}>
                    <Text
                      style={[
                        styles.agingCount,
                        insights.aging.ninetyPlus > 0 && { color: '#EF4444' },
                      ]}
                    >
                      {insights.aging.ninetyPlus}
                    </Text>
                    <Text style={styles.agingAmount}>
                      {formatCurrency(insights.aging.ninetyPlusAmount)}
                    </Text>
                    <Text style={styles.agingLabel}>90+d</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Top Customers */}
            {insights.topCustomers.length > 0 && (
              <View style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <Ionicons name="people" size={20} color="#10B981" />
                  <Text style={styles.insightTitle}>Top Customers</Text>
                </View>
                {insights.topCustomers.map((c, i) => (
                  <View
                    key={c.customerId || i}
                    style={[
                      styles.customerRow,
                      i < insights.topCustomers.length - 1 && styles.customerRowBorder,
                    ]}
                  >
                    <View style={styles.customerRank}>
                      <Text style={styles.customerRankText}>{i + 1}</Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName} numberOfLines={1}>
                        {c.customerName}
                      </Text>
                      <Text style={styles.customerMeta}>
                        {c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Text style={styles.customerRevenue}>
                      {formatCurrency(c.revenue)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Pending Recurring Invoices */}
        {(pendingCount.auto > 0 || pendingCount.review > 0) && (
          <TouchableOpacity
            style={styles.pendingCard}
            onPress={() => router.push('/recurring/' as any)}
          >
            <View style={styles.pendingLeft}>
              <Ionicons name="repeat" size={24} color="#F59E0B" />
              <View>
                <Text style={styles.pendingTitle}>Recurring Invoices Due</Text>
                <Text style={styles.pendingSubtext}>
                  {pendingCount.auto > 0 && `${pendingCount.auto} auto-generate`}
                  {pendingCount.auto > 0 && pendingCount.review > 0 && ' • '}
                  {pendingCount.review > 0 && `${pendingCount.review} need review`}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* Clock In/Out Card */}
        {activeJobError ? (
          <View style={styles.jobActiveErrorCard}>
            <Text style={styles.jobActiveErrorText}>{activeJobError}</Text>
          </View>
        ) : null}
        {activeJobLog ? (
          <TouchableOpacity
            style={styles.jobActiveCard}
            onPress={() => router.push(`/jobs/${activeJobLog.id}` as any)}
          >
            <View style={styles.jobActiveLeft}>
              <View style={styles.jobActivePulse}>
                <Ionicons name="radio-button-on" size={20} color="#0D9488" />
              </View>
              <View style={styles.jobActiveInfo}>
                <Text style={styles.jobActiveTitle} numberOfLines={1}>
                  {activeJobLog.description}
                </Text>
                <Text style={styles.jobActiveTime}>{jobElapsed}</Text>
              </View>
            </View>
            <View style={styles.jobActiveAction}>
              <Ionicons name="stop-circle" size={22} color="#DC2626" />
              <Text style={styles.jobActiveActionText}>Clock Out</Text>
            </View>
          </TouchableOpacity>
        ) : activeJobError ? null : (
          <TouchableOpacity
            style={styles.jobClockInCard}
            onPress={() => router.push('/jobs/create' as any)}
          >
            <View style={styles.jobClockInLeft}>
              <Ionicons name="timer" size={24} color="#0D9488" />
              <View>
                <Text style={styles.jobClockInTitle}>Clock In</Text>
                <Text style={styles.jobClockInSubtext}>Start tracking a job</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/swms/generate' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="add-circle" size={28} color="#FF6B35" />
            </View>
            <Text style={styles.actionLabel}>New SWMS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/invoices/create' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="receipt" size={28} color="#10B981" />
            </View>
            <Text style={styles.actionLabel}>New Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/certifications/add' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="ribbon" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.actionLabel}>Add Cert</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/work' as any)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="folder-open" size={28} color="#8B5CF6" />
            </View>
            <Text style={styles.actionLabel}>Documents</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Documents */}
        <Text style={styles.sectionTitle}>Recent Documents</Text>
        {recentDocs.length > 0 ? (
          recentDocs.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              style={styles.docCard}
              onPress={() => router.push(`/swms/${doc.id}` as any)}
            >
              <View style={styles.docInfo}>
                <Text style={styles.docTitle} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Text style={styles.docMeta}>
                  {doc.trade_type} • {formatDate(doc.created_at)}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(doc.status) + '20' },
                ]}
              >
                <Text
                  style={[styles.statusText, { color: getStatusColor(doc.status) }]}
                >
                  {doc.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No documents yet</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/swms/generate' as any)}
            >
              <Text style={styles.emptyButtonText}>Create Your First SWMS</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  settingsButton: {
    padding: 8,
    marginRight: 8,
  },
  welcomeCard: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  welcomeText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  businessText: {
    color: '#BFDBFE',
    fontSize: 14,
    marginTop: 4,
  },
  afterJobTip: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  afterJobTipTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 6,
  },
  afterJobTipBody: {
    fontSize: 14,
    color: '#047857',
    lineHeight: 20,
    marginBottom: 12,
  },
  afterJobTipActions: {
    flexDirection: 'row',
    gap: 8,
  },
  afterJobTipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  afterJobTipBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  afterJobTipBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#059669',
  },
  afterJobTipBtnTextSecondary: {
    color: '#059669',
    fontWeight: '600',
    fontSize: 13,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statValueWarning: {
    color: '#F59E0B',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  pendingCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
  },
  pendingSubtext: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  docCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  docMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  jobActiveErrorCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  jobActiveErrorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  jobActiveCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  jobActiveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  jobActivePulse: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobActiveInfo: {
    flex: 1,
  },
  jobActiveTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#134E4A',
  },
  jobActiveTime: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0D9488',
    marginTop: 2,
  },
  jobActiveAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  jobActiveActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  jobClockInCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  jobClockInLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  jobClockInTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  jobClockInSubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
  // Insights styles
  insightCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  // Revenue
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  revenueItem: {
    flex: 1,
    alignItems: 'center',
  },
  revenueDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E5E7EB',
  },
  revenueAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  revenueAmountMuted: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  revenueChange: {
    fontSize: 18,
    fontWeight: '700',
  },
  revenueLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  // Monthly chart
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 16,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartAmount: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 4,
  },
  chartBarFill: {
    width: 28,
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
    fontWeight: '500',
  },
  // Aging
  agingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  agingBucket: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  agingCount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  agingAmount: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  agingLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  // Top customers
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  customerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  customerRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerRankText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  customerMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  customerRevenue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
});
