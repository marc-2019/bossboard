/**
 * BossBoard Mobile App
 *
 * React Native (Expo) entry point.
 * Offline-first architecture with SQLite for local storage.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Network from 'expo-network';
import { getSWMSList } from './src/services/offline';
import { getPendingSyncItems } from './src/services/syncQueue';
import { getItemAsync } from './src/utils/storage';
import { setAuthToken } from './src/services/api';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Storage keys (must match AuthContext.tsx)
const TOKEN_KEY = 'bossboard_access_token';
const USER_KEY = 'bossboard_user';

interface AppState {
  isReady: boolean;
  isOnline: boolean;
  isAuthenticated: boolean;
  cachedDocCount: number;
  error: string | null;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    isReady: false,
    isOnline: true,
    isAuthenticated: false,
    cachedDocCount: 0,
    error: null,
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Check network status
        const networkState = await Network.getNetworkStateAsync();
        const isOnline = networkState.isConnected && networkState.isInternetReachable;

        // Initialize SQLite database — triggers openDatabaseAsync and schema
        // migrations for both the offline storage tables (swms_documents,
        // certifications, sync_queue, user_data) and the enhanced sync queue
        // tables (sync_queue_v2, sync_metrics, sync_conflicts).
        const [cachedDocs] = await Promise.all([
          getSWMSList(),       // warms offline.ts DB (swms + user_data tables)
          getPendingSyncItems(), // warms syncQueue.ts DB (sync_queue_v2 tables)
        ]);

        // Load cached data — SWMS list was already fetched above for DB init;
        // capture the count so the UI can show offline document availability.
        const cachedDocCount = cachedDocs.length;

        // Check authentication status — read JWT from SecureStore and restore
        // the in-memory auth token so API requests made before the AuthProvider
        // mounts (e.g. background sync) are already authenticated.
        const [storedToken, storedUser] = await Promise.all([
          getItemAsync(TOKEN_KEY),
          getItemAsync(USER_KEY),
        ]);
        const isAuthenticated = !!(storedToken && storedUser);
        if (storedToken) {
          setAuthToken(storedToken);
        }

        setState({
          isReady: true,
          isOnline: isOnline ?? false,
          isAuthenticated,
          cachedDocCount,
          error: null,
        });
      } catch (e) {
        console.error('App initialization error:', e);
        setState({
          isReady: true,
          isOnline: false,
          isAuthenticated: false,
          cachedDocCount: 0,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!state.isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading BossBoard...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Offline Banner */}
      {!state.isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Offline Mode - Changes will sync when connected
          </Text>
        </View>
      )}

      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>BossBoard</Text>
        </View>

        {/* Welcome Message */}
        <Text style={styles.title}>Welcome to BossBoard</Text>
        <Text style={styles.subtitle}>
          Invoicing, quotes and job records for NZ tradies
        </Text>

        {/* Feature Cards */}
        <View style={styles.featureContainer}>
          <FeatureCard
            title="Invoicing & Quotes"
            description="GST invoices, quotes, payment status"
            icon="💰"
            status="Available"
          />
          <FeatureCard
            title="Jobs"
            description="Clock in/out, hours per site, photos"
            icon="👷"
            status="Available"
          />
          <FeatureCard
            title="SWMS Drafts"
            description="Aligned to HSWA 2015, you stay the PCBU and sign off"
            icon="📋"
            status="Available"
          />
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Status: {state.isOnline ? '🟢 Online' : '🟡 Offline'}
          </Text>
          <Text style={styles.statusText}>
            Auth: {state.isAuthenticated ? '🔐 Signed in' : '🔓 Not signed in'}
          </Text>
          {state.cachedDocCount > 0 && (
            <Text style={styles.statusText}>
              Cached: {state.cachedDocCount} document{state.cachedDocCount !== 1 ? 's' : ''}
            </Text>
          )}
          <Text style={styles.versionText}>Version 0.1.0</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

interface FeatureCardProps {
  title: string;
  description: string;
  icon: string;
  status: string;
}

function FeatureCard({ title, description, icon, status }: FeatureCardProps) {
  return (
    <View style={styles.featureCard}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
        <Text style={styles.featureStatus}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
  },
  offlineBanner: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A2A44',
  },
  logoSubtext: {
    fontSize: 20,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 32,
  },
  featureContainer: {
    flex: 1,
    gap: 16,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  featureStatus: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '500',
  },
  statusContainer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  statusText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
