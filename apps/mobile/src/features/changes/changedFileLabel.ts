import type { ChangedFile } from '@mesa/core/phone';

// What VoiceOver says for a changed file's row and its viewed check.

/** How VoiceOver reads a changed file's row: its path, its counts, and whether it was viewed. */
export const changedFileLabel = (file: ChangedFile, viewed: boolean) =>
  `${file.path}, ${file.added} added, ${file.removed} removed${viewed ? ', viewed' : ''}`;

/** The viewed check's action: marking the file viewed, or not viewed again. */
export const viewedToggleLabel = (path: string, viewed: boolean) =>
  viewed ? `Mark ${path} not viewed` : `Mark ${path} viewed`;
