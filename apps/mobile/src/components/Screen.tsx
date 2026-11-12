import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { cn } from '@/lib/utils';

/** A screen's scrolling body, on the background, padded the same everywhere. */
export function Screen({
  children,
  className,
  keyboardInsets,
}: {
  children: ReactNode;
  className?: string;
  /** For a form: a field or button under the keyboard scrolls into view. */
  keyboardInsets?: boolean;
}) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName={cn('gap-4 p-4', className)}
      contentInsetAdjustmentBehavior="automatic"
      // A tap on a button while the keyboard is up presses it, instead of only closing the keyboard.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={keyboardInsets}
    >
      {children}
    </ScrollView>
  );
}
