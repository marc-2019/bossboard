/**
 * Remaining pushed screens must expose a labeled, a11y-reachable Back/Done
 * that leaves without deleting. Root withBackHeader is not a usable Back.
 *
 * Job Details after Clock Out / Later is owned by PR #91 — not tested here.
 * New Quote / Quote already have an in-content arrow — not churned here.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPush = jest.fn();

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
    Platform: { OS: 'ios', select: (opts: { ios?: unknown; default?: unknown }) => opts.ios ?? opts.default },
    StyleSheet: { create: (styles: unknown) => styles, flatten: (s: unknown) => s },
    View: host('View'),
    Text: host('Text'),
    ScrollView: host('ScrollView'),
    FlatList: (props: { data?: unknown[]; ListEmptyComponent?: React.ReactNode; ListHeaderComponent?: React.ReactNode } & Record<string, unknown>) => {
      const React = require('react');
      return React.createElement(
        'FlatList',
        props,
        props.ListHeaderComponent,
        props.ListEmptyComponent,
        ...(props.data || []).map((item: { id?: string }, i: number) =>
          props.renderItem
            ? props.renderItem({ item, index: i })
            : null
        )
      );
    },
    TouchableOpacity: host('TouchableOpacity'),
    TextInput: host('TextInput'),
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    RefreshControl: host('RefreshControl'),
    Switch: host('Switch'),
    Modal: host('Modal'),
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn() },
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      back: mockBack,
      replace: mockReplace,
      canGoBack: mockCanGoBack,
      push: mockPush,
    }),
    useLocalSearchParams: () => ({ id: 'entity-1' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, []);
    },
    Stack: {
      Screen: () => null,
    },
  };
});

const ok = (data: unknown) =>
  Promise.resolve({ data: { success: true, data } });

jest.mock('../../src/services/api', () => ({
  jobLogsApi: {
    list: jest.fn(() =>
      ok({
        jobLogs: [
          {
            id: 'job-1',
            description: 'Fix tap',
            siteAddress: '1 Queen St',
            customerId: null,
            startTime: '2026-08-23T01:00:00.000Z',
            endTime: '2026-08-23T03:00:00.000Z',
            status: 'completed',
            notes: null,
          },
        ],
      })
    ),
    getStats: jest.fn(() =>
      ok({
        stats: {
          totalLogs: 1,
          thisWeek: 1,
          activeLog: false,
          totalHoursThisWeek: 2,
        },
      })
    ),
    create: jest.fn(),
  },
  swmsApi: {
    get: jest.fn(() =>
      ok({
        document: {
          id: 'entity-1',
          title: 'SWMS',
          trade_type: 'plumber',
          status: 'draft',
          job_description: 'Tap',
          site_address: null,
          client_name: null,
          expected_duration: null,
          hazards: [],
          ppe_required: [],
          emergency_procedures: [],
          signatures: [],
          created_at: '2026-08-23T01:00:00.000Z',
          updated_at: '2026-08-23T01:00:00.000Z',
        },
      })
    ),
  },
  expensesApi: {
    list: jest.fn(() => ok({ expenses: [] })),
    getStats: jest.fn(() =>
      ok({ stats: { thisMonth: 0, thisMonthAmount: 0, gstClaimable: 0 } })
    ),
    get: jest.fn(() =>
      ok({
        expense: {
          id: 'entity-1',
          date: '2026-08-23',
          amount: 1000,
          category: 'fuel',
          description: 'Diesel',
          vendor: 'BP',
          isGstClaimable: true,
          gstAmount: 130,
          notes: null,
          createdAt: '2026-08-23T01:00:00.000Z',
          updatedAt: '2026-08-23T01:00:00.000Z',
        },
      })
    ),
    create: jest.fn(),
    delete: jest.fn(),
  },
  customersApi: {
    list: jest.fn(() => ok({ customers: [] })),
    get: jest.fn(() =>
      ok({
        customer: {
          id: 'entity-1',
          name: 'Acme',
          email: 'a@b.c',
          phone: null,
          address: null,
          notes: null,
        },
      })
    ),
    create: jest.fn(),
  },
  productsApi: {
    list: jest.fn(() => ok({ products: [] })),
    get: jest.fn(() =>
      ok({
        product: {
          id: 'entity-1',
          name: 'Callout',
          description: null,
          unit_price: 10000,
          type: 'fixed',
          is_gst_applicable: true,
        },
      })
    ),
    create: jest.fn(),
  },
  quotesApi: {
    list: jest.fn(() => ok({ quotes: [] })),
  },
  recurringInvoicesApi: {
    list: jest.fn(() => ok({ recurringInvoices: [] })),
    get: jest.fn(() =>
      ok({
        recurringInvoice: {
          id: 'entity-1',
          name: 'Weekly',
          customer_name: 'Acme',
          include_gst: true,
          line_items: [],
        },
      })
    ),
    getLastAmounts: jest.fn(() => ok({ lastAmounts: {} })),
  },
  bankTransactionsApi: {
    list: jest.fn(() => ok({ transactions: [] })),
    getSummary: jest.fn(() =>
      ok({ summary: { total: 0, reconciled: 0, unreconciled: 0 } })
    ),
  },
  certificationsApi: {
    list: jest.fn(() => ok({ certifications: [] })),
    get: jest.fn(() =>
      ok({
        certification: {
          id: 'entity-1',
          type: 'electrical',
          name: 'Practicing licence',
          cert_number: 'E-1',
          issuing_body: 'EW Board',
          issue_date: null,
          expiry_date: null,
          created_at: '2026-08-23T01:00:00.000Z',
        },
      })
    ),
    delete: jest.fn(),
  },
  teamsApi: {
    getMyTeam: jest.fn(() =>
      ok({
        team: { id: 'team-1', name: 'Crew' },
        role: 'owner',
        members: [
          {
            id: 'entity-1',
            userId: 'u-1',
            name: 'Pam',
            email: 'pam@test.com',
            role: 'worker',
          },
        ],
      })
    ),
    getMyPendingInvites: jest.fn(() => ok({ invites: [] })),
    listInvites: jest.fn(() => ok({ invites: [] })),
    listMembers: jest.fn(() =>
      ok({
        members: [
          {
            id: 'entity-1',
            userId: 'u-1',
            name: 'Pam',
            email: 'pam@test.com',
            role: 'worker',
          },
        ],
      })
    ),
  },
  businessProfileApi: {
    get: jest.fn(() => ok({ profile: {} })),
  },
  referralsApi: {},
  feedbackApi: { create: jest.fn() },
  authApi: { deleteAccount: jest.fn() },
  notificationsApi: { removePushToken: jest.fn() },
}));

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      name: 'Marc',
      email: 'marc@test.com',
      businessName: 'Instilligent',
      tradeType: 'plumber',
      phone: '021',
    },
    logout: jest.fn(),
    updateProfile: jest.fn(),
  }),
}));

jest.mock('../../src/components/PhotoAttachments', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/services/referralShare', () => ({
  fetchReferralMe: jest.fn(async () => ({
    canInvite: false,
    code: null,
    inviteUrl: null,
  })),
  shareReferralInvite: jest.fn(),
}));

jest.mock('../../src/hooks/useNotifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} }, nativeAppVersion: '0.5.1' },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import JobLogsListScreen from '../jobs/index';
import CreateJobLogScreen from '../jobs/create';
import SWMSDetailScreen from '../swms/[id]';
import ExpensesListScreen from '../expenses/index';
import CreateExpenseScreen from '../expenses/create';
import ExpenseDetailScreen from '../expenses/[id]';
import CustomersListScreen from '../customers/index';
import CreateCustomerScreen from '../customers/create';
import CustomerDetailScreen from '../customers/[id]';
import ProductsListScreen from '../products/index';
import CreateProductScreen from '../products/create';
import ProductDetailScreen from '../products/[id]';
import RecurringListScreen from '../recurring/index';
import CreateRecurringScreen from '../recurring/create';
import RecurringDetailScreen from '../recurring/[id]';
import GenerateInvoiceScreen from '../recurring/generate';
import BankIndexScreen from '../bank/index';
import BankUploadScreen from '../bank/upload';
import SettingsScreen from '../settings/index';
import EditProfileScreen from '../settings/profile';
import BusinessProfileScreen from '../settings/business-profile';
import BankDetailsScreen from '../settings/bank-details';
import InviteMateScreen from '../settings/invite-mate';
import FeedbackScreen from '../settings/feedback';
import CertificationsScreen from '../certifications/index';
import AddCertificationScreen from '../certifications/add';
import CertificationDetailScreen from '../certifications/[id]';
import TeamsScreen from '../teams/index';
import TeamMemberDetailScreen from '../teams/[id]';
import QuotesListScreen from '../quotes/index';

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

const SCREENS: Array<{
  name: string;
  Component: React.ComponentType;
  fallback: string;
}> = [
  { name: 'Job Logs list', Component: JobLogsListScreen, fallback: '/(tabs)' },
  { name: 'New Job', Component: CreateJobLogScreen, fallback: '/(tabs)' },
  { name: 'SWMS detail', Component: SWMSDetailScreen, fallback: '/(tabs)/work' },
  { name: 'Expenses list', Component: ExpensesListScreen, fallback: '/(tabs)/money' },
  { name: 'New Expense', Component: CreateExpenseScreen, fallback: '/(tabs)/money' },
  { name: 'Expense detail', Component: ExpenseDetailScreen, fallback: '/(tabs)/money' },
  { name: 'Customers list', Component: CustomersListScreen, fallback: '/(tabs)/money' },
  { name: 'Add Customer', Component: CreateCustomerScreen, fallback: '/(tabs)/money' },
  { name: 'Customer detail', Component: CustomerDetailScreen, fallback: '/(tabs)/money' },
  { name: 'Products list', Component: ProductsListScreen, fallback: '/(tabs)/money' },
  { name: 'Add Product', Component: CreateProductScreen, fallback: '/(tabs)/money' },
  { name: 'Product detail', Component: ProductDetailScreen, fallback: '/(tabs)/money' },
  { name: 'Recurring list', Component: RecurringListScreen, fallback: '/(tabs)/money' },
  { name: 'New Recurring', Component: CreateRecurringScreen, fallback: '/(tabs)/money' },
  { name: 'Recurring detail', Component: RecurringDetailScreen, fallback: '/(tabs)/money' },
  { name: 'Recurring generate', Component: GenerateInvoiceScreen, fallback: '/(tabs)/money' },
  { name: 'Bank transactions', Component: BankIndexScreen, fallback: '/(tabs)/money' },
  { name: 'Bank upload', Component: BankUploadScreen, fallback: '/(tabs)/money' },
  { name: 'Settings', Component: SettingsScreen, fallback: '/(tabs)' },
  { name: 'Edit Profile', Component: EditProfileScreen, fallback: '/settings' },
  { name: 'Business Profile', Component: BusinessProfileScreen, fallback: '/settings' },
  { name: 'Bank Details', Component: BankDetailsScreen, fallback: '/settings' },
  { name: 'Invite a mate', Component: InviteMateScreen, fallback: '/settings' },
  { name: 'Send Feedback', Component: FeedbackScreen, fallback: '/settings' },
  { name: 'Certifications list', Component: CertificationsScreen, fallback: '/(tabs)/people' },
  { name: 'Add Certification', Component: AddCertificationScreen, fallback: '/(tabs)/people' },
  { name: 'Certification detail', Component: CertificationDetailScreen, fallback: '/(tabs)/people' },
  { name: 'Team', Component: TeamsScreen, fallback: '/(tabs)/people' },
  { name: 'Team member', Component: TeamMemberDetailScreen, fallback: '/(tabs)/people' },
  { name: 'Quotes list', Component: QuotesListScreen, fallback: '/(tabs)/money' },
];

async function renderScreen(Component: React.ComponentType): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(Component));
  });
  return tree;
}

describe('pushed screens have a labeled Back that leaves without deleting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it.each(SCREENS)(
    '$name exposes an a11y Go back button that uses history when present',
    async ({ Component }) => {
      const tree = await renderScreen(Component);
      const back = findByA11yLabel(tree.root, 'Go back');
      expect(back).toBeDefined();
      expect(back!.props.accessibilityRole).toBe('button');

      await act(async () => {
        back!.props.onPress();
      });

      expect(mockBack).toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    }
  );

  it.each(SCREENS)(
    '$name replaces to its parent when the stack has no history',
    async ({ Component, fallback }) => {
      mockCanGoBack.mockReturnValue(false);
      const tree = await renderScreen(Component);
      const back = findByA11yLabel(tree.root, 'Go back');
      expect(back).toBeDefined();

      await act(async () => {
        back!.props.onPress();
      });

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith(fallback);
    }
  );
});
