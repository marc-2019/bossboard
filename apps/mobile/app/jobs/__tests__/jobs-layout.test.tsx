/**
 * The nested jobs stack owns Job Details. Root _layout withBackHeader
 * ('Job Details') is not the control that renders on device.
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

jest.mock('../../../src/navigation/headerOptions', () => ({
  withBackHeader: (title: string, opts?: { fallback?: string }) => ({
    title,
    headerShown: true,
    headerBackVisible: false,
    headerLeft: () => null,
    fallback: opts?.fallback ?? '/(tabs)',
  }),
}));

import JobsLayout from '../_layout';

describe('jobs nested layout', () => {
  it('uses withBackHeader on Job Details so the nested stack is not title-only', () => {
    const tree = JobsLayout();
    const screens = React.Children.toArray(
      (tree as React.ReactElement<{ children?: React.ReactNode }>).props.children
    ) as React.ReactElement<{
      name: string;
      options: Record<string, unknown>;
    }>[];

    const jobDetails = screens.find((child) => child.props.name === '[id]');
    expect(jobDetails).toBeDefined();
    expect(jobDetails!.props.options).toEqual(
      expect.objectContaining({
        title: 'Job Details',
        headerShown: true,
        headerBackVisible: false,
        fallback: '/(tabs)',
      })
    );
    expect(typeof jobDetails!.props.options.headerLeft).toBe('function');
  });
});
