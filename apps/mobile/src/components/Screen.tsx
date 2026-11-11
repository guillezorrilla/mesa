import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { cn } from '@/lib/utils';

/** A screen's scrolling body, on the background, padded the same everywhere. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName={cn('gap-4 p-4', className)}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}
