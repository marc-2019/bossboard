/**
 * After a successful clock-out, Home must not keep that job live.
 * Done / focus back to Home must show Clock In, not Clock Out.
 *
 * Device walk 23 Aug 2026 NZ (WDA E2E, job "KB walk"): Job Details showed
 * Clocked Out / Completed / Later, then Done, then Home still showed a live
 * banner "KB walk, 1m 26s, Clock Out".
 *
 * This is a props/tree test. It does not claim device a11y.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetActive = jest.fn();
const mockSwmsList = jest.fn();
const mockGetDashboard = jest.fn();
const mockGetPending = jest.fn();
const mockGetInsights = jest.fn();

let latestFocus: (() => void) | undefined;

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
    RefreshControl: host('RefreshControl'),
    ActivityIndicator: host('ActivityIndicator'),
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      latestFocus = cb;
      React.useEffect(() => {
        cb();
      }, []);
    },
    Stack: {
      Screen: () => null,
    },
  };
});

jest.mock('../../../src/services/api', () => ({
  swmsApi: {
    list: (...args: unknown[]) => mockSwmsList(...args),
  },
  statsApi: {
    getDashboard: (...args: unknown[]) => mockGetDashboard(...args),
    getInsights: (...args: unknown[]) => mockGetInsights(...args),
  },
  recurringInvoicesApi: {
    getPending: (...args: unknown[]) => mockGetPending(...args),
  },
  jobLogsApi: {
    getActive: (...args: unknown[]) => mockGetActive(...args),
  },
}));

jest.mock('../../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Marc', businessName: 'KB Plumbing' },
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import HomeScreen from '../index';
import { invalidateActiveJobLog } from '../../../src/services/activeJobLog';

const activeKbWalk = {
  id: 'job-kb-walk',
  description: 'KB walk',
  siteAddress: '1 Queen St',
  startTime: '2026-08-23T02:54:00.000Z',
  status: 'active' as const,
};

const completedKbWalk = {
  ...activeKbWalk,
  status: 'completed' as const,
  endTime: '2026-08-23T02:55:26.000Z',
};

function okJob(jobLog: unknown) {
  return { data: { success: true, data: { jobLog } } };
}

function idleApis() {
  mockSwmsList.mockResolvedValue({ data: { success: true, data: { documents: [] } } });
  mockGetDashboard.mockResolvedValue({ data: { success: false } });
  mockGetPending.mockResolvedValue({ data: { success: false } });
  mockGetInsights.mockResolvedValue({ data: { success: false } });
}

type TestNode = renderer.ReactTestInstance;

function walk(node: TestNode, visit: (n: TestNode) => void): void {
  visit(node);
  for (const child of node.children) {
    if (typeof child !== 'string') walk(child, visit);
  }
}

function findByText(root: TestNode, text: string): TestNode | undefined {
  let found: TestNode | undefined;
  walk(root, (node) => {
    const kids = node.children;
    if (kids.length === 1 && kids[0] === text) found = node;
  });
  return found;
}

let mounted: renderer.ReactTestRenderer | undefined;

async function renderHome(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(HomeScreen));
  });
  mounted = tree;
  return tree;
}

async function refocusHome(): Promise<void> {
  if (!latestFocus) {
    throw new Error('useFocusEffect did not register');
  }
  await act(async () => {
    latestFocus!();
  });
}

describe('Home active job banner after clock-out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestFocus = undefined;
    idleApis();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it('does not restore a completed job after clock-out + Done/focus', async () => {
    mockGetActive
      .mockResolvedValueOnce(okJob(activeKbWalk))
      .mockResolvedValueOnce(okJob(completedKbWalk));

    const tree = await renderHome();
    expect(findByText(tree.root, 'KB walk')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();
    expect(findByText(tree.root, 'Clock In')).toBeUndefined();

    // Clock-out on Job Details, then Done → Home focus (tabs stay mounted).
    await act(async () => {
      invalidateActiveJobLog();
    });
    await refocusHome();

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
  });

  it('ignores a stale pre-clock-out getActive that arrives after a newer load', async () => {
    let resolveStale: ((value: unknown) => void) | undefined;
    let resolveFresh: ((value: unknown) => void) | undefined;

    mockGetActive
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFresh = resolve;
          })
      );

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(React.createElement(HomeScreen));
    });
    mounted = tree;

    await refocusHome();

    await act(async () => {
      resolveFresh!(okJob(completedKbWalk));
    });
    await act(async () => {
      resolveStale!(okJob(activeKbWalk));
    });

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
  });

  it('drops the live banner as soon as clock-out invalidates, before Done/focus', async () => {
    mockGetActive.mockResolvedValue(okJob(activeKbWalk));

    const tree = await renderHome();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();

    await act(async () => {
      invalidateActiveJobLog();
    });

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
    expect(mockGetActive).toHaveBeenCalledTimes(1);
  });

  it('clears the banner when SWMS list fails and getActive has no live job', async () => {
    mockGetActive
      .mockResolvedValueOnce(okJob(activeKbWalk))
      .mockResolvedValueOnce(okJob(null));
    mockSwmsList
      .mockResolvedValueOnce({ data: { success: true, data: { documents: [] } } })
      .mockRejectedValueOnce(new Error('swms list failed'));

    const tree = await renderHome();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();

    await refocusHome();

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
  });
});
