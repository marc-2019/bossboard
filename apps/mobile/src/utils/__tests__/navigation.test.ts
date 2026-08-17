import { safeGoBack } from '../navigation';

describe('safeGoBack', () => {
  it('uses history back when the stack can go back', () => {
    const router = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
    };
    safeGoBack(router, '/(tabs)');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces to Home when there is no stack history', () => {
    const router = {
      canGoBack: () => false,
      back: jest.fn(),
      replace: jest.fn(),
    };
    safeGoBack(router, '/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('replaces to Home if canGoBack throws', () => {
    const router = {
      canGoBack: () => {
        throw new Error('no nav');
      },
      back: jest.fn(),
      replace: jest.fn(),
    };
    safeGoBack(router, '/(tabs)');
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
