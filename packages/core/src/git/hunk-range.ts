// The one name of a hunk's lines on each side, so the app can say which hunk it showed and core can
// refuse one that changed since (git/hunk.ts). Pure, for the app bundle (`@mesa/core/browser`).

/**
 * `-<first old>,<old count> +<first new>,<new count>` of a hunk's numbered lines, as a `@@` header
 * names them, except that a side with no lines starts at 0 (Git names the line before it).
 */
export function hunkRange(oldLines: readonly number[], newLines: readonly number[]): string {
  const side = (lines: readonly number[]) => `${lines.length ? lines[0] : 0},${lines.length}`;
  return `-${side(oldLines)} +${side(newLines)}`;
}
