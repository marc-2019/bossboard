/**
 * After a successful clock-out, Home must not keep that job live.
 * Done / focus / remount back to Home must show Clock In, not Clock Out.
 *
 * #94 suppress was instance-only. A remounted Home accepted a live-shaped
 * GET, and getActive fail could restore last-live as Clock Out.
 *
 * This is a props/tree test. It does not claim device a11y. HTTP 200 is
 * not proof. Device walk is later (WDA down).
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
import {
  invalidateActiveJobLog,
  resetActiveJobLogSuppressionsForTests,
} from '../../../src/services/activeJobLog';

const activeKbWalk = {
  id: 'job-kb-walk',
  description: 'KB walk',
  siteAddress: '1 Queen St',
  startTime: '2026-08-23T02:54:00.000Z',
  status: 'active' as const,
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
    resetActiveJobLogSuppressionsForTests();
    idleApis();
  });

  afterEach(() => {
    act(() => {
      mounted?.unmount();
    });
    mounted = undefined;
  });

  it('does not restore a live banner after clock-out + Done/focus when /active is empty', async () => {
    mockGetActive
      .mockResolvedValueOnce(okJob(activeKbWalk))
      .mockResolvedValueOnce(okJob(null));

    const tree = await renderHome();
    expect(findByText(tree.root, 'KB walk')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();
    expect(findByText(tree.root, 'Clock In')).toBeUndefined();

    // Clock-out on Job Details, then Done → Home focus (tabs stay mounted).
    await act(async () => {
      invalidateActiveJobLog(activeKbWalk.id);
    });
    await refocusHome();

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
  });

  it('does not restore Clock Out when /active still returns the same job after clock-out + Done/focus', async () => {
    mockGetActive
      .mockResolvedValueOnce(okJob(activeKbWalk))
      .mockResolvedValueOnce(okJob(activeKbWalk));

    const tree = await renderHome();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();

    await act(async () => {
      invalidateActiveJobLog(activeKbWalk.id);
    });
    await refocusHome();

    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
    expect(findByText(tree.root, "Couldn't check clock-in status.")).toBeUndefined();
    expect(findByText(tree.root, 'Clock In')).toBeDefined();
  });

  it('shows Clock In plus a visible error when getActive fails after clock-out', async () => {
    mockGetActive
      .mockResolvedValueOnce(okJob(activeKbWalk))
      .mockRejectedValueOnce(new Error('5xx'));

    const tree = await renderHome();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();

    await act(async () => {
      invalidateActiveJobLog(activeKbWalk.id);
    });
    await refocusHome();

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, "Couldn't check clock-in status.")).toBeDefined();
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
      resolveFresh!(okJob(null));
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
      invalidateActiveJobLog(activeKbWalk.id);
    });

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
    expect(mockGetActive).toHaveBeenCalledTimes(1);
  });

  it('does not restore the banner when a hanging getActive resolves after clock-out invalidation', async () => {
    let resolveHanging: ((value: unknown) => void) | undefined;
    mockGetActive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHanging = resolve;
        })
    );

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(React.createElement(HomeScreen));
    });
    mounted = tree;

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();

    await act(async () => {
      invalidateActiveJobLog(activeKbWalk.id);
    });

    await act(async () => {
      resolveHanging!(okJob(activeKbWalk));
    });

    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
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

  it('shows Clock In after remount following clock-out, even if GET still returns the same live job', async () => {
    mockGetActive.mockResolvedValue(okJob(activeKbWalk));

    const tree = await renderHome();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();
    expect(findByText(tree.root, 'KB walk')).toBeDefined();

    await act(async () => {
      invalidateActiveJobLog(activeKbWalk.id);
    });
    expect(findByText(tree.root, 'Clock In')).toBeDefined();

    await act(async () => {
      tree.unmount();
    });
    mounted = undefined;

    const remounted = await renderHome();
    expect(findByText(remounted.root, 'Clock In')).toBeDefined();
    expect(findByText(remounted.root, 'Clock Out')).toBeUndefined();
    expect(findByText(remounted.root, 'KB walk')).toBeUndefined();
  });

  it('does not restore last-live as Clock Out when getActive fails', async () => {
    mockGetActive
      .mockResolvedValueOnce(okJob(activeKbWalk))
      .mockRejectedValueOnce(new Error('network down'));

    const tree = await renderHome();
    expect(findByText(tree.root, 'Clock Out')).toBeDefined();
    expect(findByText(tree.root, 'KB walk')).toBeDefined();

    await refocusHome();

    expect(findByText(tree.root, 'Clock Out')).toBeUndefined();
    expect(findByText(tree.root, 'KB walk')).toBeUndefined();
    expect(findByText(tree.root, 'Clock In')).toBeDefined();
    expect(findByText(tree.root, "Couldn't check clock-in status.")).toBeDefined();
  });
});
