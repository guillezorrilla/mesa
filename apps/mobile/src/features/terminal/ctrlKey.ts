/**
 * The Ctrl key a letter typed while Ctrl is held makes (`C-c`), when `after` is `before` with one
 * letter added at its end; none for anything else typed, which goes into the line as it is.
 */
export function ctrlKeyOf(before: string, after: string): string | undefined {
  if (after.length !== before.length + 1 || !after.startsWith(before)) return undefined;
  const letter = after.slice(-1).toLowerCase();
  return /^[a-z]$/.test(letter) ? `C-${letter}` : undefined;
}
