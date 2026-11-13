import { Stack } from 'expo-router';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import { NoteView } from './NoteView';
import type { VaultRead } from './useVaultRead';

/** A note read: its title in the bar, its path, and its Markdown, or why it could not be read. */
export function NoteBody({ read, path }: { read: Promise<VaultRead<'vaultNote'>>; path: string }) {
  const { result: note, error } = use(read);
  return (
    <Screen className="gap-5">
      <Stack.Screen options={{ title: note?.title ?? '' }} />
      <Text selectable className="font-mono text-xs text-muted-foreground">
        {path}
      </Text>
      {error ? <ErrorNote text={error} /> : null}
      {note ? <NoteView note={note} /> : null}
    </Screen>
  );
}
