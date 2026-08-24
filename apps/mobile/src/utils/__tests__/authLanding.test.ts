import { resolveAuthLanding } from '../authLanding';

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
