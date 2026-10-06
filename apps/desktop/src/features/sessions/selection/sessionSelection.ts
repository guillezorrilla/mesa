/**
 * The Sessions tab's multi-selection: the selected card ids in the order they were chosen (none
 * chosen means only the shown session), and the anchor a Shift-click ranges from.
 */
export type SessionSelection = { ids?: readonly string[]; anchor?: string };

/**
 * A click on a card (Shift ranges, Cmd toggles; `from`, the card a Shift+Arrow stepped from), a
 * right-click on one, or Escape.
 */
export type SelectionInput =
  | { kind: 'click'; id: string; shift?: boolean; toggle?: boolean; from?: string }
  | { kind: 'context'; id: string }
  | { kind: 'escape' };

/**
 * The selected ids still shown as cards, in selection order; by default the shown session, and
 * again once every chosen card is gone (archived).
 */
export function selectedIds(
  selection: SessionSelection,
  order: readonly string[],
  shown?: string,
): string[] {
  const fallback = shown && order.includes(shown) ? [shown] : [];
  const listed = (selection.ids ?? fallback).filter((id) => order.includes(id));
  return selection.ids?.length && !listed.length ? fallback : listed;
}

/** The selection after `input`, given the cards' rendered `order` and the shown session. */
export function nextSelection(
  selection: SessionSelection,
  input: SelectionInput,
  order: readonly string[],
  shown?: string,
): SessionSelection {
  if (input.kind === 'escape') return {};
  const { id } = input;
  const current = selectedIds(selection, order, shown);
  if (input.kind === 'context') return current.includes(id) ? selection : { ids: [id], anchor: id };
  if (input.toggle) {
    const ids = current.includes(id) ? current.filter((other) => other !== id) : [...current, id];
    return { ids, anchor: id };
  }
  // With no anchor and no shown card listed, a Shift+Arrow ranges from the card it left.
  const anchor = [selection.anchor, shown, input.from].find((card) => card && order.includes(card));
  if (input.shift && anchor) {
    const [from, to] = [order.indexOf(anchor), order.indexOf(id)];
    return { ids: order.slice(Math.min(from, to), Math.max(from, to) + 1), anchor };
  }
  return { ids: [id], anchor: id };
}
