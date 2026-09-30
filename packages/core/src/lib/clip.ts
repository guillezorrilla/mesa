/**
 * `text` in at most `max` characters (code points): whole when it fits, else cut and ended with
 * `...`, so a bounded read says where it stopped.
 */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 3)
    .join('')
    .trimEnd()}...`;
}
