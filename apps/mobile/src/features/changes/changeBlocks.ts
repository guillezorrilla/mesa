/** One block of a file's change meter. */
export type ChangeBlock = 'add' | 'del' | 'none';

/**
 * Five blocks showing a file's share of added and removed lines, as a code review shows them: a
 * side with any lines gets at least one block, and a small change leaves blocks empty.
 */
export function changeBlocks(added: number, removed: number): ChangeBlock[] {
  const total = added + removed;
  const filled = Math.min(5, total);
  const adds = total ? Math.round((filled * added) / total) : 0;
  const add = added && !adds ? 1 : removed && adds === filled ? filled - 1 : adds;
  return Array.from({ length: 5 }, (_, at) => (at < add ? 'add' : at < filled ? 'del' : 'none'));
}
