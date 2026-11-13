import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { Screen } from '@/components/Screen';
import { FileList } from './FileList';
import { SearchField } from './SearchField';
import { SearchHits } from './SearchHits';
import { useFiles } from './useFiles';

/** A session's worktree: browse its folders, search it, and open a file to read. */
export function FilesScreen({ id }: { id: string }) {
  const { tree, folder, open, inText, setInText, found, search } = useFiles(id);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Files' }} />
      <SearchField inText={inText} onInText={setInText} onSearch={search} />
      <Suspense fallback={<BusyLine label="Asking your Mac..." />}>
        {found ? (
          <SearchHits id={id} found={found} />
        ) : (
          <FileList id={id} tree={tree} folder={folder} onOpen={open} />
        )}
      </Suspense>
    </Screen>
  );
}
