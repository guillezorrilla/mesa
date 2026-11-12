import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { canStage, canUnstage, statusWords } from './gitStatus';

/** The checkout's changed files, each staged or unstaged with a tap. */
export function StatusList({
  status,
  pending,
  onStage,
}: {
  status: Promise<MacRead<CallResult<'status'>>>;
  pending: boolean;
  onStage: (path: string, staged: boolean) => void;
}) {
  const { result, error } = use(status);
  return (
    <View className="gap-1">
      {error ? <ErrorNote text={error} /> : null}
      {result && !result.files.length ? <Text variant="muted">Nothing to commit.</Text> : null}
      {result?.files.map((file) => (
        <View key={file.path} className="min-h-11 flex-row items-center gap-2">
          <View className="flex-1">
            <Text numberOfLines={1} ellipsizeMode="head" className="font-mono text-sm">
              {file.path}
            </Text>
            <Text variant="muted">{statusWords(file)}</Text>
          </View>
          {canStage(file) ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onPress={() => onStage(file.path, true)}
            >
              <Text>Stage</Text>
            </Button>
          ) : null}
          {canUnstage(file) ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onPress={() => onStage(file.path, false)}
            >
              <Text>Unstage</Text>
            </Button>
          ) : null}
        </View>
      ))}
    </View>
  );
}
