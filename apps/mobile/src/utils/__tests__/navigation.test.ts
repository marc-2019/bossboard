/**
 * safeGoBack — never trap the user on a screen with no history.
 */
import { safeGoBack } from '../navigation';

describe('safeGoBack', () => {
  it('calls router.back when canGoBack is true', () => {
    const back = jest.fn();
    const replace = jest.fn();
    safeGoBack(
      {
        canGoBack: () => true,
        back,
        replace,
      },
      '/(tabs)',
    );
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces to fallback when canGoBack is false', () => {
    const back = jest.fn();
    const replace = jest.fn();
    safeGoBack(
      {
        canGoBack: () => false,
        back,
        replace,
      },
      '/(tabs)',
    );
    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('replaces to fallback when canGoBack throws', () => {
    const back = jest.fn();
    const replace = jest.fn();
    safeGoBack(
      {
        canGoBack: () => {
          throw new Error('nav not ready');
        },
        back,
        replace,
      },
      '/swms/list',
    );
    expect(replace).toHaveBeenCalledWith('/swms/list');
  });
});
