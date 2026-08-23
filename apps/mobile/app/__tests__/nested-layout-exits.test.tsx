/**
 * Nested stacks own these screens. Root _layout withBackHeader is not
 * the control that renders on device — the nested layout must supply
 * withBackHeader (headerLeft) itself.
 *
 * jobs/_layout is owned by PR #91 — do not assert or change it here.
 */

import React from 'react';

jest.mock('expo-router', () => {
  const React = require('react');
  function Stack({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }
  Stack.Screen = function Screen(props: {
    name: string;
    options: Record<string, unknown>;
  }) {
    return React.createElement('Screen', props);
  };
  return { Stack };
});

jest.mock('../../src/navigation/headerOptions', () => ({
  withBackHeader: (title: string, opts?: { fallback?: string }) => ({
    title,
    headerShown: true,
    headerBackVisible: false,
    headerLeft: () => null,
    fallback: opts?.fallback ?? '/(tabs)',
  }),
}));

import QuotesLayout from '../quotes/_layout';
import ExpensesLayout from '../expenses/_layout';
import CustomersLayout from '../customers/_layout';
import ProductsLayout from '../products/_layout';
import RecurringLayout from '../recurring/_layout';
import BankLayout from '../bank/_layout';
import CertificationsLayout from '../certifications/_layout';
import TeamsLayout from '../teams/_layout';

type ScreenEl = React.ReactElement<{
  name: string;
  options: Record<string, unknown>;
}>;

function screensOf(tree: React.ReactElement): ScreenEl[] {
  return React.Children.toArray(
    (tree as React.ReactElement<{ children?: React.ReactNode }>).props.children
  ) as ScreenEl[];
}

function expectWithBackHeader(
  layout: React.ReactElement,
  name: string,
  title: string,
  fallback?: string
) {
  const screen = screensOf(layout).find((child) => child.props.name === name);
  expect(screen).toBeDefined();
  expect(screen!.props.options).toEqual(
    expect.objectContaining({
      title,
      headerShown: true,
      headerBackVisible: false,
      ...(fallback ? { fallback } : {}),
    })
  );
  expect(typeof screen!.props.options.headerLeft).toBe('function');
}

describe('nested layouts supply withBackHeader (not title-only)', () => {
  it('quotes list uses withBackHeader', () => {
    expectWithBackHeader(QuotesLayout(), 'index', 'Quotes', '/(tabs)/money');
  });

  it('expenses screens use withBackHeader', () => {
    const tree = ExpensesLayout();
    expectWithBackHeader(tree, 'index', 'Expenses', '/(tabs)/money');
    expectWithBackHeader(tree, 'create', 'New Expense', '/(tabs)/money');
    expectWithBackHeader(tree, '[id]', 'Expense Details', '/(tabs)/money');
  });

  it('customers screens use withBackHeader', () => {
    const tree = CustomersLayout();
    expectWithBackHeader(tree, 'index', 'Customers', '/(tabs)/money');
    expectWithBackHeader(tree, 'create', 'New Customer', '/(tabs)/money');
    expectWithBackHeader(tree, '[id]', 'Customer Details', '/(tabs)/money');
  });

  it('products screens use withBackHeader', () => {
    const tree = ProductsLayout();
    expectWithBackHeader(tree, 'index', 'Products & Services', '/(tabs)/money');
    expectWithBackHeader(tree, 'create', 'New Product', '/(tabs)/money');
    expectWithBackHeader(tree, '[id]', 'Product Details', '/(tabs)/money');
  });

  it('recurring screens use withBackHeader', () => {
    const tree = RecurringLayout();
    expectWithBackHeader(tree, 'index', 'Recurring Invoices', '/(tabs)/money');
    expectWithBackHeader(tree, 'create', 'New Recurring Invoice', '/(tabs)/money');
    expectWithBackHeader(tree, 'generate', 'Generate Invoices', '/(tabs)/money');
    expectWithBackHeader(tree, '[id]', 'Recurring Invoice', '/(tabs)/money');
  });

  it('bank screens use withBackHeader', () => {
    const tree = BankLayout();
    expectWithBackHeader(tree, 'index', 'Bank Transactions', '/(tabs)/money');
    expectWithBackHeader(tree, 'upload', 'Upload Statement', '/(tabs)/money');
  });

  it('certifications screens use withBackHeader', () => {
    const tree = CertificationsLayout();
    expectWithBackHeader(tree, 'index', 'Certifications', '/(tabs)/people');
    expectWithBackHeader(tree, 'add', 'Add Certification', '/(tabs)/people');
    expectWithBackHeader(tree, '[id]', 'Certification Details', '/(tabs)/people');
  });

  it('teams screens use withBackHeader', () => {
    const tree = TeamsLayout();
    expectWithBackHeader(tree, 'index', 'Team', '/(tabs)/people');
    expectWithBackHeader(tree, '[id]', 'Team Member', '/(tabs)/people');
  });
});
