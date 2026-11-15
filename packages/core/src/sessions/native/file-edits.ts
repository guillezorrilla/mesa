/** One file an agent edited: its path as the agent wrote it, and the lines it added and removed. */
export type ChatFileEdit = { path: string; added: number; removed: number };

/** `edits` one per file, each file's lines summed, in first-edit order. */
export function sumFileEdits(edits: Iterable<ChatFileEdit>): ChatFileEdit[] {
  const files = new Map<string, ChatFileEdit>();
  for (const edit of edits) {
    const file = files.get(edit.path);
    files.set(
      edit.path,
      file
        ? { ...file, added: file.added + edit.added, removed: file.removed + edit.removed }
        : { path: edit.path, added: edit.added, removed: edit.removed },
    );
  }
  return [...files.values()];
}
