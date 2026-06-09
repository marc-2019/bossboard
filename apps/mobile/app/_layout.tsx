/**
 * Root Layout
 * Provides auth context and navigation structure
 */

import { useEffect, useState } from 'react';
import { colors } from '@/src/theme/colors';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { useNotifications } from '../src/hooks/useNotifications';
import { View, ActivityIndicator } from 'react-native';
import * as Sentry from '@sentry/react-native';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Initialize Sentry
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  release: 'bossboard-mobile@0.5.1',
  tracesSampleRate: 0.2,
  enableAutoSessionTracking: true,
  // Silent initialization if DSN is missing or empty
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN
});

function RootLayoutNav() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Register for push notifications when authenticated
  useNotifications(isAuthenticated);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login' as any);
    } else if (isAuthenticated && inAuthGroup) {
      // Check if user needs verification or onboarding
      if (!user?.isVerified) {
        // Need email verification - only redirect if not already on verify screen
        if ((segments as string[])[1] !== 'verify-email') {
          router.replace('/(auth)/verify-email' as any);
        }
      } else if (!user?.onboardingCompleted) {
        // Need onboarding - only redirect if not already on onboarding screen
        if ((segments as string[])[1] !== 'onboarding') {
          router.replace('/(auth)/onboarding' as any);
        }
      } else {
        // Fully set up - go to tabs
        router.replace('/(tabs)' as any);
      }
    } else if (isAuthenticated && !inAuthGroup) {
      // Authenticated and in app - check if they still need verification/onboarding
      if (!user?.isVerified) {
        router.replace('/(auth)/verify-email' as any);
      } else if (!user?.onboardingCompleted) {
        router.replace('/(auth)/onboarding' as any);
      }
    }
  }, [isAuthenticated, user?.isVerified, user?.onboardingCompleted, segments, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="swms/[id]"
        options={{
          headerShown: true,
          title: 'SWMS Document',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="swms/generate"
        options={{
          headerShown: true,
          title: 'Generate SWMS',
          headerTintColor: colors.primary,
        }}
      />
      {/* Invoices */}
      <Stack.Screen
        name="invoices/create"
        options={{
          headerShown: true,
          title: 'New Invoice',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="invoices/[id]"
        options={{
          headerShown: true,
          title: 'Invoice',
          headerTintColor: colors.primary,
        }}
      />
      {/* Quotes */}
      <Stack.Screen
        name="quotes/index"
        options={{
          headerShown: true,
          title: 'Quotes',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="quotes/create"
        options={{
          headerShown: true,
          title: 'New Quote',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="quotes/[id]"
        options={{
          headerShown: true,
          title: 'Quote',
          headerTintColor: colors.primary,
        }}
      />
      {/* Expenses */}
      <Stack.Screen
        name="expenses/index"
        options={{
          headerShown: true,
          title: 'Expenses',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="expenses/create"
        options={{
          headerShown: true,
          title: 'New Expense',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="expenses/[id]"
        options={{
          headerShown: true,
          title: 'Expense',
          headerTintColor: colors.primary,
        }}
      />
      {/* Jobs */}
      <Stack.Screen
        name="jobs/index"
        options={{
          headerShown: true,
          title: 'Job Logs',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="jobs/create"
        options={{
          headerShown: true,
          title: 'New Job',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="jobs/[id]"
        options={{
          headerShown: true,
          title: 'Job Details',
          headerTintColor: colors.primary,
        }}
      />
      {/* Settings (group with its own _layout.tsx) */}
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
        }}
      />
      {/* Subscription */}
      <Stack.Screen
        name="subscription"
        options={{
          headerShown: true,
          title: 'Subscription',
          headerTintColor: colors.primary,
        }}
      />
      {/* Certifications */}
      <Stack.Screen
        name="certifications/add"
        options={{
          headerShown: true,
          title: 'Add Certification',
          headerTintColor: colors.primary,
        }}
      />
      {/* Customers */}
      <Stack.Screen
        name="customers/index"
        options={{
          headerShown: true,
          title: 'Customers',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="customers/create"
        options={{
          headerShown: true,
          title: 'Add Customer',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="customers/[id]"
        options={{
          headerShown: true,
          title: 'Customer Details',
          headerTintColor: colors.primary,
        }}
      />
      {/* Products */}
      <Stack.Screen
        name="products/index"
        options={{
          headerShown: true,
          title: 'Products & Services',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="products/create"
        options={{
          headerShown: true,
          title: 'Add Product',
          headerTintColor: colors.primary,
        }}
      />
      {/* Recurring Invoices */}
      <Stack.Screen
        name="recurring/index"
        options={{
          headerShown: true,
          title: 'Recurring Invoices',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="recurring/create"
        options={{
          headerShown: true,
          title: 'New Recurring Invoice',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="recurring/[id]"
        options={{
          headerShown: true,
          title: 'Recurring Invoice',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="recurring/generate"
        options={{
          headerShown: true,
          title: 'Generate Invoice',
          headerTintColor: colors.primary,
        }}
      />
      {/* Teams */}
      <Stack.Screen
        name="teams/index"
        options={{
          headerShown: true,
          title: 'Team',
          headerTintColor: colors.primary,
        }}
      />
      {/* Bank Reconciliation */}
      <Stack.Screen
        name="bank/index"
        options={{
          headerShown: true,
          title: 'Bank Transactions',
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Screen
        name="bank/upload"
        options={{
          headerShown: true,
          title: 'Upload CSV',
          headerTintColor: colors.primary,
        }}
      />
    </Stack>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootLayoutNav />
    </AuthProvider>
  );
});
