/**
 * In-content Back/Done — labeled and a11y-reachable.
 * Nested-stack withBackHeader is not a usable device Back.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

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
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import { InContentBack } from '../InContentBack';

type TestNode = renderer.ReactTestInstance;

function walk(node: TestNode, visit: (n: TestNode) => void): void {
  visit(node);
  for (const child of node.children) {
    if (typeof child !== 'string') walk(child, visit);
  }
}

function findByA11yLabel(root: TestNode, label: string): TestNode | undefined {
  let found: TestNode | undefined;
  walk(root, (node) => {
    if (node.props.accessibilityLabel === label) found = node;
  });
  return found;
}

function findByText(root: TestNode, text: string): TestNode | undefined {
  let found: TestNode | undefined;
  walk(root, (node) => {
    const kids = node.children;
    if (kids.length === 1 && kids[0] === text) found = node;
  });
  return found;
}

describe('InContentBack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('exposes a labeled Go back button that leaves via history', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(React.createElement(InContentBack, { fallback: '/(tabs)/money' }));
    });

    const back = findByA11yLabel(tree.root, 'Go back');
    expect(back).toBeDefined();
    expect(back!.props.accessibilityRole).toBe('button');
    expect(findByText(tree.root, 'Go back')).toBeDefined();

    act(() => {
      back!.props.onPress();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the fallback when the stack has no history', () => {
    mockCanGoBack.mockReturnValue(false);

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        React.createElement(InContentBack, { fallback: '/(tabs)/people' })
      );
    });

    const back = findByA11yLabel(tree.root, 'Go back');
    act(() => {
      back!.props.onPress();
    });

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/people');
  });

  it('supports a Done label for completed flows', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        React.createElement(InContentBack, { label: 'Done', fallback: '/(tabs)' })
      );
    });

    const done = findByA11yLabel(tree.root, 'Done');
    expect(done).toBeDefined();
    expect(done!.props.accessibilityRole).toBe('button');
    expect(findByText(tree.root, 'Done')).toBeDefined();
  });
});
