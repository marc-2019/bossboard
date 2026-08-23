/**
 * Shared keyboard dismiss for job-log text fields.
 * Done/Return blurs and dismisses so Clock In / Clock Out / Done stay tappable.
 */

import { Keyboard, type ReturnKeyTypeOptions } from 'react-native';

export function dismissJobLogKeyboard(): void {
  Keyboard.dismiss();
}

export const jobLogTextFieldKeyboard = {
  returnKeyType: 'done' as ReturnKeyTypeOptions,
  blurOnSubmit: true,
  onSubmitEditing: dismissJobLogKeyboard,
};

export const jobLogScrollKeyboard = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
  automaticallyAdjustKeyboardInsets: true,
};
