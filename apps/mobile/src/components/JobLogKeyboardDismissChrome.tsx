/**
 * Tap-outside keyboard dismiss for job-log screens.
 * Wrap empty chrome only — never Clock In / Clock Out / Done / Go back.
 */

import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { dismissJobLogKeyboard } from '../utils/jobLogKeyboard';

export const JOB_LOG_KEYBOARD_DISMISS_CHROME_TEST_ID =
  'job-log-keyboard-dismiss-chrome';

export function JobLogKeyboardDismissChrome({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={dismissJobLogKeyboard}
      accessible={false}
      testID={JOB_LOG_KEYBOARD_DISMISS_CHROME_TEST_ID}
      style={style}
    >
      {children}
    </Pressable>
  );
}
