import type { CallResult } from '@mesa/core/phone';
import Check from 'lucide-react-native/icons/check';
import { use } from 'react';
import { Pressable, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';

/** The checkout's local branches, the current one checked; a tap on another switches to it. */
export function BranchList({
  branches,
  pending,
  onSwitch,
}: {
  branches: Promise<MacRead<CallResult<'branches'>>>;
  pending: boolean;
  onSwitch: (name: string) => void;
}) {
  const { result, error } = use(branches);
  return (
    <View>
      {error ? <ErrorNote text={error} /> : null}
      {result?.names.map((name) => {
        const current = name === result.current;
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected: current, disabled: pending || current }}
            accessibilityHint={current ? undefined : 'Switches the checkout to this branch'}
            disabled={pending || current}
            onPress={() => onSwitch(name)}
            className="min-h-11 flex-row items-center gap-2 active:bg-accent"
          >
            <Text numberOfLines={1} className="flex-1 font-mono text-sm">
              {name}
            </Text>
            {current ? <Icon as={Check} className="size-4 text-state-done" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
