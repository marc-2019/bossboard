/**
 * Clock In + Job Details notes must have a labeled keyboard dismiss
 * (Done/Return) and must not trap the user under the keyboard.
 *
 * Proven 23 Aug 2026 NZ on Elfaba: notes / Clock In left the keyboard
 * up; the only dismiss was a guessed tap-on-background. Clock Out /
 * Done / Clock In must stay tappable — not covered by keyboard or by
 * the dismiss control.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockKeyboardDismiss = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockGet = jest.fn();
const mockDelete = jest.fn();
const mockClockOut = jest.fn();
const mockCreate = jest.fn();

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
    Pressable: host('Pressable'),
    TouchableWithoutFeedback: host('TouchableWithoutFeedback'),
    TextInput: host('TextInput'),
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Alert: { alert: jest.fn() },
    Keyboard: {
      dismiss: (...args: unknown[]) => mockKeyboardDismiss(...args),
      addListener: () => ({ remove: jest.fn() }),
    },
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
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

jest.mock('../../../src/components/InContentBack', () => ({
  InContentBack: () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import CreateJobLogScreen from '../create';
import JobLogDetailScreen from '../[id]';

const activeJob = {
  id: 'job-1',
  description: 'Back walk 23Aug',
  siteAddress: '1 Queen St',
  customerId: null,
  startTime: '2026-08-23T01:00:00.000Z',
  endTime: null,
  status: 'active' as const,
  notes: 'Test',
  createdAt: '2026-08-23T01:00:00.000Z',
  updatedAt: '2026-08-23T01:00:00.000Z',
};

const completedJob = {
  ...activeJob,
  endTime: '2026-08-23T01:31:00.000Z',
  status: 'completed' as const,
};

type TestNode = renderer.ReactTestInstance;

function walk(node: TestNode, visit: (n: TestNode) => void): void {
  visit(node);
  for (const child of node.children) {
    if (typeof child !== 'string') walk(child, visit);
  }
}

function findAllByType(root: TestNode, type: string): TestNode[] {
  const found: TestNode[] = [];
  walk(root, (node) => {
    if (node.type === type) found.push(node);
  });
  return found;
}

function findByPlaceholder(root: TestNode, placeholder: string): TestNode | undefined {
  let found: TestNode | undefined;
  walk(root, (node) => {
    if (node.type === 'TextInput' && node.props.placeholder === placeholder) {
      found = node;
    }
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

function findByA11yLabel(root: TestNode, label: string): TestNode | undefined {
  let found: TestNode | undefined;
  walk(root, (node) => {
    if (node.props.accessibilityLabel === label) found = node;
  });
  return found;
}

function pressableAncestor(node: TestNode): TestNode | undefined {
  let current: TestNode | undefined = node.parent as TestNode | undefined;
  while (current) {
    if (typeof current.props?.onPress === 'function') return current;
    current = current.parent as TestNode | undefined;
  }
  return undefined;
}

function hasAncestorType(node: TestNode, type: string): boolean {
  let current: TestNode | undefined = node.parent as TestNode | undefined;
  while (current) {
    if (current.type === type) return true;
    current = current.parent as TestNode | undefined;
  }
  return false;
}

function expectDoneReturnDismiss(input: TestNode | undefined, label: string): void {
  expect(input).toBeDefined();
  expect(input!.props.returnKeyType).toBe('done');
  expect(input!.props.blurOnSubmit).toBe(true);
  expect(typeof input!.props.onSubmitEditing).toBe('function');

  mockKeyboardDismiss.mockClear();
  input!.props.onSubmitEditing();
  expect(mockKeyboardDismiss).toHaveBeenCalled();
  void label;
}

function expectActionStillTappable(root: TestNode, label: string): void {
  const text = findByText(root, label);
  expect(text).toBeDefined();
  const button = pressableAncestor(text!);
  expect(button).toBeDefined();
  expect(typeof button!.props.onPress).toBe('function');
  expect(button!.props.disabled).not.toBe(true);
}

async function renderCreate(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(CreateJobLogScreen));
  });
  return tree;
}

async function renderJobDetails(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(JobLogDetailScreen));
  });
  return tree;
}

describe('Clock In job-log fields — visible keyboard dismiss', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('gives every Clock In text field Done/Return that dismisses the keyboard', async () => {
    const tree = await renderCreate();
    const root = tree.root;

    expectDoneReturnDismiss(
      findByPlaceholder(root, 'e.g. Bathroom renovation, Wiring install'),
      'Job Description'
    );
    expectDoneReturnDismiss(
      findByPlaceholder(root, 'e.g. 42 Queen St, Auckland'),
      'Site Address'
    );
    expectDoneReturnDismiss(
      findByPlaceholder(root, 'Any details about this job...'),
      'Clock In notes'
    );
  });

  it('keeps Clock In tappable above the keyboard (avoiding view + persist taps)', async () => {
    const tree = await renderCreate();
    const root = tree.root;

    expectActionStillTappable(root, 'Clock In');

    const clockInText = findByText(root, 'Clock In');
    expect(hasAncestorType(clockInText!, 'KeyboardAvoidingView')).toBe(true);

    const scrolls = findAllByType(root, 'ScrollView');
    expect(scrolls.length).toBeGreaterThan(0);
    expect(scrolls[0].props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('Job Details job-log fields — visible keyboard dismiss', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockGet.mockResolvedValue({
      data: { success: true, data: { jobLog: activeJob } },
    });
  });

  it('gives Clock Out notes Done/Return that dismisses the keyboard', async () => {
    const tree = await renderJobDetails();
    const clockOut = findByText(tree.root, 'Clock Out');
    expect(clockOut).toBeDefined();

    await act(async () => {
      pressableAncestor(clockOut!)!.props.onPress();
    });

    expectDoneReturnDismiss(
      findByPlaceholder(tree.root, 'Add any notes about the job (optional)...'),
      'Job Details / Clock Out notes'
    );
  });

  it('keeps Clock Out tappable and not covered by keyboard chrome', async () => {
    const tree = await renderJobDetails();
    const root = tree.root;

    expectActionStillTappable(root, 'Clock Out');
    expect(hasAncestorType(findByText(root, 'Clock Out')!, 'KeyboardAvoidingView')).toBe(
      true
    );

    await act(async () => {
      pressableAncestor(findByText(root, 'Clock Out')!)!.props.onPress();
    });

    expectActionStillTappable(root, 'Confirm Clock Out');
    expect(
      hasAncestorType(findByText(root, 'Confirm Clock Out')!, 'KeyboardAvoidingView')
    ).toBe(true);

    const scrolls = findAllByType(root, 'ScrollView');
    expect(scrolls[0].props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('does not hide the completed Done control (PR #91)', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { jobLog: completedJob } },
    });

    const tree = await renderJobDetails();
    const done = findByA11yLabel(tree.root, 'Done');
    expect(done).toBeDefined();
    expect(done!.props.accessibilityRole).toBe('button');
    expect(typeof done!.props.onPress).toBe('function');
    expect(hasAncestorType(done!, 'KeyboardAvoidingView')).toBe(true);
  });
});
