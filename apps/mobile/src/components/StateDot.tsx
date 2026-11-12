import { View } from 'react-native';
import { cn } from '@/lib/utils';

/** A small round mark in a state's colour class (stateColor); decoration, the words say the state. */
export function StateDot({ color, className }: { color: string; className?: string }) {
  return <View accessible={false} className={cn('size-2.5 rounded-full', color, className)} />;
}
