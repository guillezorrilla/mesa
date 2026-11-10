/** What a note is on, as its card and field say it: `File`, `Line 3`, `Lines 3-5`. */
export const noteLabel = (note: { line: number; end: number }) =>
  note.line === 0
    ? 'File'
    : note.end > note.line
      ? `Lines ${note.line}-${note.end}`
      : `Line ${note.line}`;
