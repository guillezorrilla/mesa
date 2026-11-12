import type { StatusFile } from '@mesa/core/phone';

const CODES: Record<string, string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type changed',
  U: 'conflicted',
};

/** Whether part of the file's change is not staged yet. */
export const canStage = (file: StatusFile) => file.workingTree !== ' ';
/** Whether part of the file's change is staged. */
export const canUnstage = (file: StatusFile) => file.index !== ' ' && file.index !== '?';

/** A file's status in words: what changed, and what of it is staged. */
export function statusWords(file: StatusFile) {
  if (file.index === '?') return 'new, not staged';
  const what = CODES[canUnstage(file) ? file.index : file.workingTree] ?? 'changed';
  if (!canUnstage(file)) return `${what}, not staged`;
  return canStage(file) ? `${what}, partly staged` : `${what}, staged`;
}
