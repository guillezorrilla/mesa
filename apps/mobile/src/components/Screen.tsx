import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * A screen's scrolling body, on the background, padded the same everywhere; `header` (a tab's
 * title row) sits above the padding, edge to edge, where a list would put it.
 */
export function Screen({
  children,
  className,
  header,
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
}) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName={header ? 'pb-4' : cn('gap-4 p-4', className)}
      contentInsetAdjustmentBehavior="automatic"
      // A tap on a button while the keyboard is up presses it, instead of only closing the keyboard.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {header ? (
        <>
          {header}
          <View className={cn('gap-4 px-4 pt-2', className)}>{children}</View>
        </>
      ) : (
        children
      )}
    </ScrollView>
  );
}
