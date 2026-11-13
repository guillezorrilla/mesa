/** What a note on a diff is on: a line, a run of lines, or the whole file. */
export function noteLabel(path: string, lines: { line: number; end: number }) {
  if (!lines.line) return `${path}, the whole file`;
  return lines.end > lines.line
    ? `${path}, lines ${lines.line} to ${lines.end}`
    : `${path}, line ${lines.line}`;
}
