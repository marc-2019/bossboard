import {
  authRedirectOwner,
  resolveAuthLanding,
  resolveOwnedAuthRedirect,
} from '../authLanding';

const signedIn = {
  isAuthenticated: true,
  isVerified: true,
  onboardingCompleted: true,
};

describe('resolveAuthLanding', () => {
  it('sends a restored session to Home when segments are empty (process-death cold start)', () => {
    expect(resolveAuthLanding({ ...signedIn, segments: [] })).toBe('/(tabs)');
  });

  it('sends a restored session to Home from the index entry route', () => {
    expect(resolveAuthLanding({ ...signedIn, segments: ['index'] })).toBe('/(tabs)');
  });

  it('sends a restored session off Sign In to Home', () => {
    expect(resolveAuthLanding({ ...signedIn, segments: ['(auth)', 'login'] })).toBe(
      '/(tabs)'
    );
  });

  it('does not bounce Home once already in tabs', () => {
    expect(resolveAuthLanding({ ...signedIn, segments: ['(tabs)', 'index'] })).toBeNull();
  });

  it('leaves unauthenticated users on the auth group (Sign In / Sign Up)', () => {
    expect(
      resolveAuthLanding({
        isAuthenticated: false,
        isVerified: false,
        onboardingCompleted: false,
        segments: ['(auth)', 'login'],
      })
    ).toBeNull();
  });

  it('sends unauthenticated users to Sign In when outside auth', () => {
    expect(
      resolveAuthLanding({
        isAuthenticated: false,
        isVerified: false,
        onboardingCompleted: false,
        segments: ['(tabs)'],
      })
    ).toBe('/(auth)/login');
  });
});

describe('dual Redirect must not fire', () => {
  const signedOut = {
    isAuthenticated: false,
    isVerified: false,
    onboardingCompleted: false,
  };
  const segmentSets = [[], ['index'], ['(auth)', 'login'], ['(tabs)', 'index']];
  const auths = [signedIn, signedOut];

  it('assigns exactly one owner per segment snapshot', () => {
    for (const segments of segmentSets) {
      expect(['index', 'layout']).toContain(authRedirectOwner(segments));
    }
  });

  it('never emits a Redirect from both index and layout', () => {
    for (const auth of auths) {
      for (const segments of segmentSets) {
        const indexHref = resolveOwnedAuthRedirect('index', { ...auth, segments });
        const layoutHref = resolveOwnedAuthRedirect('layout', { ...auth, segments });
        expect(indexHref && layoutHref).toBeFalsy();
      }
    }
  });
});
