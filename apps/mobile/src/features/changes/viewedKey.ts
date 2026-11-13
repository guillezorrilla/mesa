/** A file at its current patch: one changed again since it was marked viewed is unviewed. */
export const viewedKey = (file: { path: string; rev: string }) => `${file.rev}:${file.path}`;
