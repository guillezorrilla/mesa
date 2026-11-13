import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';
import type { ChatItem } from './chatItems';
import { JumpButton } from './JumpButton';
import { MessageRow } from './MessageRow';
import { useTailFollow } from './useTailFollow';

/**
 * A session's conversation as one native list, oldest at the top and the latest at the bottom:
 * it opens there and stays there as messages arrive, unless the person scrolled up, when a button
 * jumps back and counts what arrived; scrolling to the top asks for older ones (`onTop`).
 */
export function ChatList({
  id,
  items,
  now,
  top,
  bottom,
  onTop,
}: {
  id: string;
  items: ChatItem[];
  now: number;
  top: ReactElement;
  bottom: ReactElement;
  onTop: () => void;
}) {
  const tail = useTailFollow<ChatItem>(
    items.map((item) => item.key),
    onTop,
  );
  return (
    <View className="flex-1 bg-background">
      <FlatList
        ref={tail.list}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <MessageRow id={id} item={item} now={now} />}
        ListHeaderComponent={top}
        ListFooterComponent={bottom}
        // Away from the bottom, the first message shown holds still as older ones arrive above
        // it (the header is the list's first child). At the bottom the follower pins the end
        // alone: the two corrections would fight as the oldest reply leaves the top.
        maintainVisibleContentPosition={tail.away ? { minIndexForVisible: 1 } : undefined}
        // ponytail: every message rendered at once (the Mac sends at most 20 replies and their
        // prompts), so the end exists to pin to; window it if pages ever grow past that.
        initialNumToRender={items.length}
        // A short conversation sits on the reply bar, as in a messages app.
        contentContainerClassName="grow justify-end"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        {...tail.props}
      />
      {tail.away ? <JumpButton fresh={tail.fresh} onPress={tail.jump} /> : null}
    </View>
  );
}
