const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The fenced code block a Markdown line opens: its marker (three or more ` or ~) and the spaces
 * before it; undefined for any other line.
 */
export function opensFence(line: string): { marker: string; indent: string } | undefined {
  const open = FENCE.exec(line);
  const marker = open?.[1];
  // A backtick fence's info string has no backtick: ```a``` on one line is inline code.
  if (!open || !marker || (marker[0] === '`' && line.slice(open[0].length).includes('`')))
    return undefined;
  return { marker, indent: line.slice(0, open[0].length - marker.length) };
}

/** Whether `line` closes the fenced code block `marker` opened. */
export function closesFence(line: string, marker: string): boolean {
  const close = FENCE.exec(line);
  const found = close?.[1] ?? '';
  return (
    found[0] === marker[0] && found.length >= marker.length && !line.slice(close?.[0].length).trim()
  );
}
