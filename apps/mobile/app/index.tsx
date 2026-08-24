/**
 * Cold-start entry. Default stack used to be (auth)/login, so a restored
 * session could paint Sign In. This route waits for auth restore then
 * Redirects — Home when a stored session is valid.
 */

import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { resolveAuthLanding } from '../src/utils/authLanding';

export default function Index() {
  const { user, isAuthenticated, isLoading } = useAuth();

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
    segments: [],
  });

  return <Redirect href={(landing ?? '/(tabs)') as any} />;
}
