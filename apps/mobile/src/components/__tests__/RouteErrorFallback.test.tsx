/**
 * Teams route ErrorBoundary: the fallback must report to Sentry, offer a real
 * retry, and always offer a way out (the nested stack header is gone).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockCapture = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => {
    function Host(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    }
    Host.displayName = name;
    return Host;
  };
  return {
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles, flatten: (s: unknown) => s },
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
    push: jest.fn(),
  }),
  Stack: Object.assign(() => null, { Screen: () => null }),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: (...args: unknown[]) => mockCapture(...args),
}));

jest.mock('../../navigation/headerOptions', () => ({
  withBackHeader: (title: string, opts: Record<string, unknown>) => ({ title, ...opts }),
}));

import { RouteErrorFallback } from '../RouteErrorFallback';
import { ErrorBoundary as TeamsErrorBoundary } from '../../../app/teams/_layout';

type TestNode = renderer.ReactTestInstance;

function findByA11yLabel(root: TestNode, label: string): TestNode {
  const found = root.findAll((n: TestNode) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  if (!found.length) throw new Error(`no node with accessibilityLabel ${label}`);
  return found[0];
}

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}

describe('RouteErrorFallback', () => {
  const error = new TypeError("undefined is not an object (evaluating 'x[0]')");

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('reports the error to Sentry with the boundary tag', () => {
    render(<RouteErrorFallback error={error} retry={jest.fn(async () => {})} label="teams" fallbackHref="/(tabs)/people" />);
    expect(mockCapture).toHaveBeenCalledWith(error, { tags: { boundary: 'teams' } });
  });

  it('Reload calls expo-router retry (re-mounts the route so it refetches)', async () => {
    const retry = jest.fn(async () => {});
    const tree = render(<RouteErrorFallback error={error} retry={retry} label="teams" fallbackHref="/(tabs)/people" />);
    await act(async () => {
      await findByA11yLabel(tree.root, 'Reload this screen').props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('Go back pops history when there is history', () => {
    const tree = render(<RouteErrorFallback error={error} retry={jest.fn(async () => {})} label="teams" fallbackHref="/(tabs)/people" />);
    act(() => findByA11yLabel(tree.root, 'Go back').props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Go back replaces to the fallback route when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);
    const tree = render(<RouteErrorFallback error={error} retry={jest.fn(async () => {})} label="teams" fallbackHref="/(tabs)/people" />);
    act(() => findByA11yLabel(tree.root, 'Go back').props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/people');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('Teams layout ErrorBoundary export', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is exported for expo-router and renders the fallback with a People exit', () => {
    expect(typeof TeamsErrorBoundary).toBe('function');
    mockCanGoBack.mockReturnValue(false);
    const tree = render(<TeamsErrorBoundary error={new Error('boom')} retry={jest.fn(async () => {})} />);
    expect(tree.root.findAll((n: TestNode) => n.props.testID === 'route-error-fallback').length).toBeGreaterThan(0);
    expect(mockCapture).toHaveBeenCalledWith(expect.any(Error), { tags: { boundary: 'teams' } });
    act(() => findByA11yLabel(tree.root, 'Go back').props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/people');
  });
});
