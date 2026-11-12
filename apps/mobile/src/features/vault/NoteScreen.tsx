import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { NoteBody } from './NoteBody';
import { useVaultRead } from './useVaultRead';

/** One vault item through the Vault reader: its path, then its Markdown with links followed. */
export function NoteScreen({ path }: { path: string }) {
  const read = useVaultRead({ method: 'note', path });
  return (
    <Suspense fallback={<BusyScreen label="Reading the note..." />}>
      <NoteBody read={read} path={path} />
    </Suspense>
  );
}
