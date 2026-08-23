/**
 * safeGoBack: history back when possible, else replace to a parent.
 * Never traps the user on a one-screen nested stack.
 */

import { safeGoBack } from '../navigation';

describe('safeGoBack', () => {
  it('calls router.back when history exists', () => {
    const router = {
      canGoBack: jest.fn(() => true),
      back: jest.fn(),
      replace: jest.fn(),
    };

    safeGoBack(router, '/(tabs)/money');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces to the fallback when the stack has no history', () => {
    const router = {
      canGoBack: jest.fn(() => false),
      back: jest.fn(),
      replace: jest.fn(),
    };

    safeGoBack(router, '/(tabs)/money');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/money');
  });

  it('defaults the fallback to Home tabs', () => {
    const router = {
      canGoBack: jest.fn(() => false),
      back: jest.fn(),
      replace: jest.fn(),
    };

    safeGoBack(router);

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('falls through to replace when canGoBack throws', () => {
    const router = {
      canGoBack: jest.fn(() => {
        throw new Error('navigator unready');
      }),
      back: jest.fn(),
      replace: jest.fn(),
    };

    safeGoBack(router, '/settings');

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/settings');
  });
});
