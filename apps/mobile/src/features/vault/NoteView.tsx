import type { PhoneNote } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { NoteBlock } from './NoteBlock';
import { noteBlocks } from './noteBlocks';

/** A note's Markdown drawn natively, its links followed; one Mesa cannot show says why. */
export function NoteView({ note }: { note: PhoneNote }) {
  if (note.unsupported) return <Text variant="muted">{note.unsupported}</Text>;
  return (
    <View className="gap-3">
      {noteBlocks(note.body, note.links).map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a note's blocks are a fixed cut of its text.
        <NoteBlock key={i} block={block} />
      ))}
      {note.clipped ? (
        <Text variant="muted">The rest of this note is on the Mac, in Obsidian.</Text>
      ) : null}
    </View>
  );
}
