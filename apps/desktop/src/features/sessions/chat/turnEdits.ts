import type { ChatFileEdit, ChatItem } from '@mesa/core';

/**
 * The files each turn of `messages` (oldest first) changed, by the item that closes the turn: the
 * last before the person's next prompt or command, or the last of all while the turn runs. A file
 * edited in two runs of a turn shows once, its lines summed; a turn that edited none is left out.
 */
export function turnEdits(messages: readonly ChatItem[]): Map<ChatItem, ChatFileEdit[]> {
  const turns = new Map<ChatItem, ChatFileEdit[]>();
  let files = new Map<string, ChatFileEdit>();
  const close = (last: ChatItem | undefined) => {
    if (last && files.size) turns.set(last, [...files.values()]);
    files = new Map();
  };
  messages.forEach((item, index) => {
    if (item.from === 'you' || item.from === 'command') close(messages[index - 1]);
    if (item.from !== 'steps') return;
    for (const edit of item.edits ?? []) {
      const file = files.get(edit.path);
      files.set(
        edit.path,
        file
          ? { ...file, added: file.added + edit.added, removed: file.removed + edit.removed }
          : edit,
      );
    }
  });
  close(messages.at(-1));
  return turns;
}
