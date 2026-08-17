import { goHome, safeGoBack } from '../navigation';

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

  it('replaces to Home when forceFallback even if canGoBack is true', () => {
    const router = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
    };
    safeGoBack(router, '/(tabs)', { forceFallback: true });
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});

describe('goHome', () => {
  it('always replaces to Home and never calls back', () => {
    const router = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
    };
    goHome(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
