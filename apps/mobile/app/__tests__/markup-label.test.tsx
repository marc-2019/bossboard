/**
 * Visible pricing copy says Markup %. Field names (marginPercent,
 * default_margin_percent) stay.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { join } from 'path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => {
    function Host(props: Record<string, unknown>) {
      return React.createElement(
        name,
        props,
        props.children as React.ReactNode,
      );
    }
    Host.displayName = name;
    return Host;
  };
  return {
    Platform: {
      OS: 'ios',
      select: (opts: { ios?: unknown; default?: unknown }) =>
        opts.ios ?? opts.default,
    },
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (s: unknown) => s,
    },
    View: host('View'),
    Text: host('Text'),
    ScrollView: host('ScrollView'),
    FlatList: host('FlatList'),
    TouchableOpacity: host('TouchableOpacity'),
    TextInput: host('TextInput'),
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Switch: host('Switch'),
    Modal: host('Modal'),
    Alert: { alert: jest.fn() },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: (props: Record<string, unknown>) =>
      React.createElement('Ionicons', props),
  };
});

jest.mock('../../src/services/api', () => ({
  productsApi: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invoicesApi: { create: jest.fn() },
  customersApi: { list: jest.fn() },
  businessProfileApi: {
    get: jest.fn().mockResolvedValue({ data: { success: false } }),
  },
  swmsApi: { get: jest.fn() },
}));

jest.mock(
  '@bossboard/shared',
  () => ({
    looksLikeInternalInvoiceNotes: () => false,
    INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE: 'blocked',
  }),
  { virtual: true },
);

import { Alert, TextInput, TouchableOpacity } from 'react-native';
import CreateProductScreen from '../products/create';
import CreateInvoiceScreen from '../invoices/create';

function treeText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object' || !('children' in node)) return '';
  const kids = (node as { children?: unknown }).children;
  if (!Array.isArray(kids)) return '';
  return kids.map((child: unknown) => treeText(child)).join('\n');
}

function instanceText(node: { children: unknown[] }): string {
  return node.children
    .map((child: unknown) =>
      typeof child === 'string'
        ? child
        : instanceText(child as { children: unknown[] }),
    )
    .join('');
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('Markup % label', () => {
  beforeEach(() => {
    (Alert.alert as unknown as { mockClear: () => void }).mockClear();
  });

  it('shows Markup % on the product form and in the sell-price error', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(React.createElement(CreateProductScreen));
    });
    const text = treeText(tree.toJSON());
    expect(text).toContain('Markup %');
    expect(text).toContain(
      'Customer sees sell price only. Cost + markup stay internal.',
    );
    expect(text).not.toMatch(/Margin %/);
    expect(text).not.toMatch(/cost \+ margin/i);

    const name = tree.root.findAllByType(TextInput).find(
      (input: { props: { placeholder?: string; onChangeText: (value: string) => void } }) =>
        input.props.placeholder === 'e.g., Standard Callout Fee',
    );
    expect(name).toBeDefined();
    await act(async () => {
      name!.props.onChangeText('Copper pipe');
    });

    const submit = tree.root
      .findAllByType(TouchableOpacity)
      .find((node: { children: unknown[]; props: { onPress: () => void } }) =>
        instanceText(node).includes('Create Product'),
      );
    expect(submit).toBeDefined();
    await act(async () => {
      submit!.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Please enter a valid sell price or cost + markup %',
    );
  });

  it('shows markup helper text on a new invoice', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(React.createElement(CreateInvoiceScreen));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const text = treeText(tree.toJSON());
    expect(text).toContain('Cost + markup internal only — PDF shows sell');
    expect(text).toContain('markup stay internal on line items.');
    expect(text).not.toMatch(/Margin %/);
    expect(text).not.toMatch(/cost \+ margin/i);
  });

  it('keeps marginPercent field names in the screen sources', () => {
    const banned = [
      'Margin %',
      'margin %',
      'cost + margin',
      'Cost and margin',
      'Cost/margin',
    ];
    for (const rel of ['../products/create.tsx', '../invoices/create.tsx']) {
      const src = stripComments(
        readFileSync(join(__dirname, rel), 'utf8'),
      );
      for (const phrase of banned) {
        expect(src.toLowerCase().includes(phrase.toLowerCase())).toBe(false);
      }
    }
    const product = readFileSync(
      join(__dirname, '../products/create.tsx'),
      'utf8',
    );
    const invoice = readFileSync(
      join(__dirname, '../invoices/create.tsx'),
      'utf8',
    );
    expect(product).toContain('default_margin_percent');
    expect(product).toContain('marginDisplay');
    expect(invoice).toContain('marginPercent');
  });
});
