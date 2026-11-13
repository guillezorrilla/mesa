import type { CallResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import File from 'lucide-react-native/icons/file';
import Folder from 'lucide-react-native/icons/folder';
import { use } from 'react';
import { Pressable, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { pathParts } from '@/lib/pathParts';
import type { MacRead } from '../mac/tryCall';
import { entryLabel } from './fileWords';
import { folderEntries } from './folderEntries';

/** What a folder of the worktree holds: a folder opens in place, a file in its preview. */
export function FileList({
  id,
  tree,
  folder,
  onOpen,
}: {
  id: string;
  tree: Promise<MacRead<CallResult<'files'>>>;
  folder: string;
  onOpen: (folder: string) => void;
}) {
  const { result, error } = use(tree);
  const rows = [
    ...(folder ? [{ path: pathParts(folder).folder, dir: true, name: '..' }] : []),
    ...folderEntries(result?.entries ?? [], folder).map((e) => ({
      ...e,
      name: pathParts(e.path).name,
    })),
  ];
  return (
    <View>
      {error ? <ErrorNote text={error} /> : null}
      {folder ? <Text variant="muted">{folder}</Text> : null}
      {rows.map((row) => (
        <Pressable
          key={`${row.name}:${row.path}`}
          accessibilityRole="button"
          accessibilityLabel={entryLabel(row)}
          onPress={() =>
            row.dir
              ? onOpen(row.path)
              : router.push({ pathname: '/agents/file', params: { id, path: row.path } })
          }
          className="min-h-11 flex-row items-center gap-3 active:bg-accent"
        >
          <Icon as={row.dir ? Folder : File} className="size-4 text-muted-foreground" />
          <Text numberOfLines={1} className="flex-1 font-mono text-sm">
            {row.name}
          </Text>
        </Pressable>
      ))}
      {result?.truncated ? <Text variant="muted">Only the first files are listed.</Text> : null}
    </View>
  );
}
