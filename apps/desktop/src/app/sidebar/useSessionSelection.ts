import { useState } from 'react';
import {
  nextSelection,
  type SelectionInput,
  type SessionSelection,
  selectedIds,
} from './sessionSelection';

/**
 * The Sessions tab's selected cards, given their rendered `order`. A new shown session starts over
 * from the shown session alone.
 */
export function useSessionSelection(order: readonly string[], shown?: string) {
  const key = shown ?? '';
  const [state, setState] = useState<{ key: string; selection: SessionSelection }>({
    key,
    selection: {},
  });
  const selection = state.key === key ? state.selection : {};
  return {
    ids: selectedIds(selection, order, shown),
    apply: (input: SelectionInput) =>
      setState({ key, selection: nextSelection(selection, input, order, shown) }),
  };
}
