import { startTransition } from 'react';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { mergeText } from './crewText';
import { useMerge } from './useMerge';

/** Merges a worker's branch into its coordinator; a conflict is listed by file, never resolved. */
export function MergeButton({ worker, branch }: { worker: string; branch: string }) {
  const [state, merge, merging] = useMerge(worker);
  return (
    <View className="gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={merging}
        accessibilityLabel={`Merge ${branch} into this session`}
        onPress={() => startTransition(merge)}
      >
        <Text>{merging ? 'Merging...' : 'Merge'}</Text>
      </Button>
      {state.error ? <ErrorNote text={state.error} /> : null}
      {state.merge ? <Text variant="muted">{mergeText(state.merge)}</Text> : null}
      {state.merge?.conflicts.map((file) => (
        <Text key={file} selectable className="font-mono text-xs text-destructive">
          {file}
        </Text>
      ))}
    </View>
  );
}
