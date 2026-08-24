/**
 * Root Layout
 * Provides auth context and navigation structure
 */

import { useEffect } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { useNotifications } from '../src/hooks/useNotifications';
import { View, ActivityIndicator } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { withBackHeader } from '../src/navigation/headerOptions';
import { resolveAuthLanding } from '../src/utils/authLanding';

// Cold start must not paint (auth)/login before restore decides.
export const unstable_settings = {
  initialRouteName: 'index',
};

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

  // Register for push notifications when authenticated
  useNotifications(isAuthenticated);

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

  const landing = resolveAuthLanding({
    isAuthenticated,
    isVerified: !!user?.isVerified,
    onboardingCompleted: !!user?.onboardingCompleted,
    segments: segments as string[],
  });

  return (
    <>
      {landing ? <Redirect href={landing as any} /> : null}
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="swms/[id]"
        options={withBackHeader('SWMS Document')}
      />
      <Stack.Screen
        name="swms/generate"
        options={withBackHeader('Generate SWMS')}
      />
      {/* Invoices */}
      <Stack.Screen
        name="invoices/create"
        options={withBackHeader('New Invoice', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="invoices/[id]"
        options={withBackHeader('Invoice', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="invoices/edit/[id]"
        options={withBackHeader('Edit Invoice', { fallback: '/(tabs)/money' })}
      />
      {/* Quotes */}
      <Stack.Screen
        name="quotes/index"
        options={withBackHeader('Quotes')}
      />
      <Stack.Screen
        name="quotes/create"
        options={withBackHeader('New Quote')}
      />
      <Stack.Screen
        name="quotes/[id]"
        options={withBackHeader('Quote')}
      />
      {/* Expenses */}
      <Stack.Screen
        name="expenses/index"
        options={withBackHeader('Expenses')}
      />
      <Stack.Screen
        name="expenses/create"
        options={withBackHeader('New Expense')}
      />
      <Stack.Screen
        name="expenses/[id]"
        options={withBackHeader('Expense')}
      />
      {/* Jobs */}
      <Stack.Screen name="jobs/index" options={withBackHeader('Job Logs')} />
      <Stack.Screen name="jobs/create" options={withBackHeader('New Job')} />
      <Stack.Screen name="jobs/[id]" options={withBackHeader('Job Details')} />
      {/* Settings (group with its own _layout.tsx) */}
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
        }}
      />
      {/* Subscription */}
      <Stack.Screen name="subscription" options={withBackHeader('Subscription')} />
      {/* Certifications */}
      <Stack.Screen name="certifications/index" options={withBackHeader('Certifications')} />
      <Stack.Screen name="certifications/add" options={withBackHeader('Add Certification')} />
      <Stack.Screen name="certifications/[id]" options={withBackHeader('Certification')} />
      {/* Customers */}
      <Stack.Screen name="customers/index" options={withBackHeader('Customers')} />
      <Stack.Screen name="customers/create" options={withBackHeader('Add Customer')} />
      <Stack.Screen name="customers/[id]" options={withBackHeader('Customer Details')} />
      {/* Products */}
      <Stack.Screen name="products/index" options={withBackHeader('Products & Services')} />
      <Stack.Screen name="products/create" options={withBackHeader('Add Product')} />
      <Stack.Screen name="products/[id]" options={withBackHeader('Product Details')} />
      {/* Recurring Invoices */}
      <Stack.Screen name="recurring/index" options={withBackHeader('Recurring Invoices')} />
      <Stack.Screen name="recurring/create" options={withBackHeader('New Recurring Invoice')} />
      <Stack.Screen name="recurring/[id]" options={withBackHeader('Recurring Invoice')} />
      <Stack.Screen name="recurring/generate" options={withBackHeader('Generate Invoice')} />
      {/* Teams */}
      <Stack.Screen name="teams/index" options={withBackHeader('Team')} />
      <Stack.Screen name="teams/[id]" options={withBackHeader('Team Member')} />
      {/* Bank Reconciliation */}
      <Stack.Screen name="bank/index" options={withBackHeader('Bank Transactions')} />
      <Stack.Screen name="bank/upload" options={withBackHeader('Upload CSV')} />
    </Stack>
    </>
  );
}

function StripeMaybeProvider({ children }: { children: React.ReactNode }) {
  // Publishable key only (safe in client). PaymentSheet no-ops until this is set.
  const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  if (!pk) {
    return <>{children}</>;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StripeProvider } = require('@stripe/stripe-react-native');
    return (
      <StripeProvider
        publishableKey={pk}
        merchantIdentifier="merchant.nz.instilligent.bossboard"
        urlScheme="bossboard"
      >
        {children}
      </StripeProvider>
    );
  } catch {
    return <>{children}</>;
  }
}

export default Sentry.wrap(function RootLayout() {
  return (
    <AuthProvider>
      <StripeMaybeProvider>
        <StatusBar style="dark" />
        <RootLayoutNav />
      </StripeMaybeProvider>
    </AuthProvider>
  );
});
