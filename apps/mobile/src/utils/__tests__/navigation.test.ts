import { goHome, safeGoBack } from '../navigation';

describe('safeGoBack', () => {
  it('uses history back when the stack can go back', () => {
    const router = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
    };
    safeGoBack(router, '/(tabs)');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates to Home when there is no stack history', () => {
    const router = {
      canGoBack: () => false,
      back: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
    };
    safeGoBack(router, '/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('navigates to Home if canGoBack throws', () => {
    const router = {
      canGoBack: () => {
        throw new Error('no nav');
      },
      back: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
    };
    safeGoBack(router, '/(tabs)');
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)');
  });

  it('navigates to Home when forceFallback even if canGoBack is true', () => {
    const router = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
    };
    safeGoBack(router, '/(tabs)', { forceFallback: true });
    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('goHome', () => {
  it('navigates to Home and does not replace', () => {
    const router = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
    };
    goHome(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses dismissTo if navigate is missing', () => {
    const router = {
      replace: jest.fn(),
      dismissTo: jest.fn(),
    };
    goHome(router);
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces only if navigate and dismissTo are missing', () => {
    const router = {
      replace: jest.fn(),
    };
    goHome(router);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
