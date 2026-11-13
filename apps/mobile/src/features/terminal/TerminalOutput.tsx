import { OUTPUT_LINES } from '@mesa/core/phone';
import type { ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { JumpButton } from '../sessions/JumpButton';
import { OutputLine } from './OutputLine';
import { ScrollbackTop } from './ScrollbackTop';
import { useOutputScreen } from './useOutputScreen';

/**
 * A session's output as orca draws its terminal: edge to edge in the terminal's colours, mono
 * lines wrapped to the phone, following the newest until the person scrolls up, when a button
 * jumps back; the top loads older lines and copies them all. One screen for a terminal session
 * (`header` above its output) and an agent's output (`agent`, its screen chrome left out).
 */
export function TerminalOutput({
  id,
  first,
  pushed,
  agent = false,
  header,
}: {
  id: string;
  first: string[];
  pushed: boolean;
  agent?: boolean;
  header?: ReactNode;
}) {
  const view = useOutputScreen(id, first, pushed, agent);
  return (
    <View className="flex-1" style={{ backgroundColor: view.palette.background }}>
      <FlatList
        ref={view.tail.list}
        data={view.lines}
        keyExtractor={(_, at) => view.keys[at] ?? String(at)}
        renderItem={({ item }) => <OutputLine line={item} palette={view.palette} />}
        ListHeaderComponent={
          <View className="gap-3">
            {header}
            <ScrollbackTop
              loading={view.loading}
              more={view.more}
              text={view.lines.map((line) => line.text).join('\n')}
            />
          </View>
        }
        ListEmptyComponent={
          <Text variant="muted" className="font-mono text-[13px]">
            No output yet.
          </Text>
        }
        // Away from the bottom, the first line shown holds still as older ones arrive above it
        // (the header is the list's first child); at the bottom the follower pins the end.
        maintainVisibleContentPosition={view.tail.away ? { minIndexForVisible: 1 } : undefined}
        // The first page rendered whole, so its end exists to pin to; older pages are windowed.
        initialNumToRender={OUTPUT_LINES.first}
        contentContainerClassName="px-3 pt-3 pb-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        {...view.tail.props}
      />
      {view.tail.away ? <JumpButton fresh={0} onPress={view.tail.jump} /> : null}
    </View>
  );
}
