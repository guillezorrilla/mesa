import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { NoteBody } from './NoteBody';

/** One vault item through the Vault reader: its path, then its Markdown with links followed. */
export function NoteScreen({ path }: { path: string }) {
  const { answer: read } = useMacRead({ method: 'vaultNote', path });
  return (
    <Suspense fallback={<BusyScreen label="Reading the note..." />}>
      <NoteBody read={read} path={path} />
    </Suspense>
  );
}
