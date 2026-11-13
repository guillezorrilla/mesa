import type { CallResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { use } from 'react';
import { Pressable, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { PathText } from '@/components/PathText';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { hitPlace } from './fileWords';

/** A search's hits, each opening its file. */
export function SearchHits({
  id,
  found,
}: {
  id: string;
  found: Promise<MacRead<CallResult<'search'>>>;
}) {
  const { result, error } = use(found);
  if (error) return <ErrorNote text={error} />;
  if (!result?.hits.length) return <Text variant="muted">Nothing found.</Text>;
  return (
    <View>
      {result.hits.map((hit) => (
        <Pressable
          key={`${hit.path}:${hit.line}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/agents/file', params: { id, path: hit.path } })}
          className="min-h-11 justify-center py-1 active:bg-accent"
        >
          <PathText path={hitPlace(hit)} />
          {hit.preview ? (
            <Text numberOfLines={1} variant="muted" className="font-mono">
              {hit.preview}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
