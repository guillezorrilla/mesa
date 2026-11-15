import type { ChatFileEdit, ChatItem } from '@mesa/core';
import { sumFileEdits } from '@mesa/core/browser';

/**
 * The files each turn of `messages` (oldest first) changed, by the item that closes the turn: the
 * last before the person's next prompt or command, or the last of all while the turn runs. A file
 * edited in two runs of a turn shows once, its lines summed; a turn that edited none is left out.
 */
export function turnEdits(messages: readonly ChatItem[]): Map<ChatItem, ChatFileEdit[]> {
  const turns = new Map<ChatItem, ChatFileEdit[]>();
  let edits: ChatFileEdit[] = [];
  const close = (last: ChatItem | undefined) => {
    if (last && edits.length) turns.set(last, sumFileEdits(edits));
    edits = [];
  };
  messages.forEach((item, index) => {
    if (item.from === 'you' || item.from === 'command') close(messages[index - 1]);
    if (item.from === 'steps') edits.push(...(item.edits ?? []));
  });
  close(messages.at(-1));
  return turns;
}
