import { useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { newSince } from './chatItems';

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/** How close to the bottom still counts as at the latest message (orca's slop). */
const AT_TAIL_PX = 80;
/** How close to the top a drag asks for older messages. */
const NEAR_TOP_PX = 60;

const atTail = ({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent) =>
  contentSize.height - (contentOffset.y + layoutMeasurement.height) <= AT_TAIL_PX;

/**
 * Keeps a conversation list on its latest message while the person is there, as orca does: one
 * non-animated follower pins the end as content grows; a drag stops following and a drag that
 * ends at the bottom follows again. Away from the bottom it counts the messages that arrived
 * since (`keys` oldest first), and a drag near the top calls `onTop` for older ones.
 */
export function useTailFollow<T>(keys: string[], onTop: () => void) {
  const list = useRef<FlatList<T>>(null);
  const following = useRef(true);
  const dragging = useRef(false);
  // The newest message shown when the person scrolled away; none while following.
  const [seen, setSeen] = useState<string>();
  const follow = (yes: boolean) => {
    following.current = yes;
    setSeen(yes ? undefined : keys.at(-1));
  };
  // To the content's height, not scrollToEnd: the list's own end can miss a footer it has not
  // measured yet, and the scroll view stops at the real end.
  const pin = (height = Number.MAX_SAFE_INTEGER) => {
    if (following.current) list.current?.scrollToOffset({ offset: height, animated: false });
  };
  const settle = (event: ScrollEvent) => {
    dragging.current = false;
    if (atTail(event.nativeEvent)) follow(true);
  };
  return {
    list,
    away: seen !== undefined,
    fresh: newSince(keys, seen),
    jump: () => {
      follow(true);
      list.current?.scrollToEnd({ animated: true });
    },
    props: {
      onLayout: () => pin(),
      onContentSizeChange: (_width: number, height: number) => pin(height),
      onScrollBeginDrag: () => {
        dragging.current = true;
        if (following.current) follow(false);
      },
      onScrollEndDrag: settle,
      onMomentumScrollEnd: settle,
      onScroll: (event: ScrollEvent) => {
        if (dragging.current && event.nativeEvent.contentOffset.y < NEAR_TOP_PX) onTop();
      },
      scrollEventThrottle: 32,
    },
  };
}
