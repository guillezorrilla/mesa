import type { CallResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { use } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { ChangedFileRow } from './ChangedFileRow';
import { changesSummary } from './changesSummary';
import { viewedKey } from './viewedKey';

/** A session's changed files against its base, each opening its diff, pulled to read again. */
export function ChangesList({
  id,
  answer,
  refreshing,
  onRefresh,
  seen,
  onToggleViewed,
}: {
  id: string;
  answer: Promise<MacRead<CallResult<'changes'>>>;
  refreshing: boolean;
  onRefresh: () => void;
  seen: ReadonlySet<string>;
  onToggleViewed: (key: string) => void;
}) {
  const { result, error } = use(answer);
  const files = result?.files ?? [];
  const viewed = files.filter((file) => seen.has(viewedKey(file))).length;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      data={files}
      keyExtractor={(file) => file.path}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View className="gap-2 px-4 pb-2">
          {error ? <ErrorNote text={error} /> : null}
          {result ? <Text variant="muted">{changesSummary(result, viewed)}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        result ? (
          <Text className="px-4 py-8 text-center text-muted-foreground">No changes yet.</Text>
        ) : undefined
      }
      renderItem={({ item }) => (
        <ChangedFileRow
          file={item}
          viewed={seen.has(viewedKey(item))}
          onPress={() =>
            router.push({
              pathname: '/agents/diff',
              params: { id, path: item.path, rev: item.rev },
            })
          }
          onToggleViewed={() => onToggleViewed(viewedKey(item))}
        />
      )}
    />
  );
}
