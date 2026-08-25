/**
 * Where the root navigator should send the user after auth state settles.
 *
 * Cold start: expo-router's default stack screen is (auth)/login. If a
 * stored session is valid we must leave that screen — including when
 * `useSegments()` is still empty before the navigator reports a group.
 */

export type AuthLandingHref =
  | '/(auth)/login'
  | '/(auth)/verify-email'
  | '/(auth)/onboarding'
  | '/(tabs)';

export function resolveAuthLanding(input: {
  isAuthenticated: boolean;
  isVerified: boolean;
  onboardingCompleted: boolean;
  segments: string[];
}): AuthLandingHref | null {
  const { isAuthenticated, isVerified, onboardingCompleted, segments } = input;
  const inAuthGroup = segments[0] === '(auth)';
  const screen = segments[1];

  if (!isAuthenticated) {
    if (inAuthGroup) {
      return null;
    }
    return '/(auth)/login';
  }

  if (!isVerified) {
    if (inAuthGroup && screen === 'verify-email') {
      return null;
    }
    return '/(auth)/verify-email';
  }

  if (!onboardingCompleted) {
    if (inAuthGroup && screen === 'onboarding') {
      return null;
    }
    return '/(auth)/onboarding';
  }

  if (inAuthGroup || segments.length === 0 || segments[0] === 'index') {
    return '/(tabs)';
  }

  return null;
}

export type AuthRedirectOwner = 'index' | 'layout';

/** Cold start / index owns the hop; layout owns every other group. Never both. */
export function authRedirectOwner(segments: string[]): AuthRedirectOwner {
  if (segments.length === 0 || segments[0] === 'index') {
    return 'index';
  }
  return 'layout';
}

export function resolveOwnedAuthRedirect(
  owner: AuthRedirectOwner,
  input: {
    isAuthenticated: boolean;
    isVerified: boolean;
    onboardingCompleted: boolean;
    segments: string[];
  }
): AuthLandingHref | null {
  if (authRedirectOwner(input.segments) !== owner) {
    return null;
  }
  return resolveAuthLanding(input);
}
