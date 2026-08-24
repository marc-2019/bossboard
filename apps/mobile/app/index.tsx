/**
 * Cold-start entry. Does not paint (auth)/login. Redirect is owned here
 * only while segments are empty or `index` — layout owns every other hop
 * so the two files cannot Redirect at once.
 */

import { Redirect, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { resolveOwnedAuthRedirect } from '../src/utils/authLanding';

export default function Index() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const landing = resolveOwnedAuthRedirect('index', {
    isAuthenticated,
    isVerified: !!user?.isVerified,
    onboardingCompleted: !!user?.onboardingCompleted,
    segments: segments as string[],
  });

  if (!landing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return <Redirect href={landing as any} />;
}
