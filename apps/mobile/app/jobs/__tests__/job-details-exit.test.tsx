/**
 * Job Details must offer a labeled exit after clock-out / Later.
 * Delete Job Log is not an acceptable only way off this screen.
 *
 * Proven 23 Aug 2026 NZ on Elfaba: after Clock Out → Later, the a11y tree
 * had Job Details header, Completed log, and Delete Job Log — no Back.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockGet = jest.fn();
const mockDelete = jest.fn();
const mockClockOut = jest.fn();

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
    ScrollView: host('ScrollView'),
    TouchableOpacity: host('TouchableOpacity'),
    TextInput: host('TextInput'),
    ActivityIndicator: host('ActivityIndicator'),
    Alert: { alert: jest.fn() },
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      back: mockBack,
      replace: mockReplace,
      canGoBack: mockCanGoBack,
      push: jest.fn(),
    }),
    useLocalSearchParams: () => ({ id: 'job-1' }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, []);
    },
  };
});

jest.mock('../../../src/services/api', () => ({
  jobLogsApi: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    clockOut: (...args: unknown[]) => mockClockOut(...args),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import JobLogDetailScreen from '../[id]';

const completedJob = {
  id: 'job-1',
  description: 'Fix tap',
  siteAddress: '1 Queen St',
  customerId: null,
  startTime: '2026-08-23T01:00:00.000Z',
  endTime: '2026-08-23T03:00:00.000Z',
  status: 'completed' as const,
  notes: null,
  createdAt: '2026-08-23T01:00:00.000Z',
  updatedAt: '2026-08-23T03:00:00.000Z',
};

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

async function renderCompletedJob(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(JobLogDetailScreen));
  });
  return tree;
}

describe('Job Details exit after completed clock-out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockGet.mockResolvedValue({
      data: { success: true, data: { jobLog: completedJob } },
    });
  });

  it('exposes a labeled Done control that leaves without deleting', async () => {
    const tree = await renderCompletedJob();
    const root = tree.root;

    const done = findByA11yLabel(root, 'Done');
    const goBack = findByA11yLabel(root, 'Go back');
    expect(done).toBeDefined();
    expect(done!.props.accessibilityRole).toBe('button');
    expect(goBack).toBeDefined();
    expect(goBack!.props.accessibilityRole).toBe('button');
    expect(findByText(root, 'Delete Job Log')).toBeDefined();

    await act(async () => {
      done!.props.onPress();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockClockOut).not.toHaveBeenCalled();
  });

  it('falls back to Home when the stack has no history', async () => {
    mockCanGoBack.mockReturnValue(false);

    const tree = await renderCompletedJob();
    const done = findByA11yLabel(tree.root, 'Done');
    expect(done).toBeDefined();

    await act(async () => {
      done!.props.onPress();
    });

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
