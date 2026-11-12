import { type DiffLine, noteLines } from '@mesa/core/phone';
import { use } from 'react';
import { FlatList, View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import { isSelected, type LineSelection } from '@/lib/lineSelection';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { CommentForm } from './CommentForm';
import { DiffLineRow } from './DiffLineRow';
import { noteLabel } from './noteLabel';
import type { DiffRead } from './useDiff';

/**
 * One file's diff, read on as it scrolls; tapping lines selects them, and a note on them goes to
 * the session's agent.
 */
export function DiffBody({
  id,
  path,
  first,
  more,
  onEnd,
  selection,
  onTap,
}: {
  id: string;
  path: string;
  first: Promise<DiffRead>;
  more?: DiffRead;
  onEnd: (shown: DiffRead) => void;
  selection?: LineSelection;
  onTap: (at: number) => void;
}) {
  const link = useMac();
  const shown = more ?? use(first);
  const selected: DiffLine[] = selection
    ? shown.rows.slice(selection.start, selection.end + 1)
    : [];
  const lines = noteLines(selected);
  return (
    <View className="flex-1 bg-background">
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
        data={shown.rows}
        keyExtractor={(_, at) => String(at)}
        extraData={selection}
        onEndReached={() => onEnd(shown)}
        onEndReachedThreshold={2}
        ListHeaderComponent={
          <View className="gap-2 p-4">
            {shown.error ? <ErrorNote text={shown.error} /> : null}
            <Text variant="muted">Tap a line, then another, to note them for the agent.</Text>
          </View>
        }
        ListFooterComponent={
          shown.next < shown.total ? (
            <View className="p-4">
              <BusyLine label="Reading more of the diff..." />
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <DiffLineRow
            row={item}
            selected={isSelected(selection, index)}
            onPress={() => onTap(index)}
          />
        )}
      />
      {selection ? (
        <CommentForm
          label={noteLabel(path, lines)}
          send={(text) =>
            tryCall(link, () => link.call({ method: 'note', id, path, ...lines, text }))
          }
        />
      ) : null}
    </View>
  );
}
