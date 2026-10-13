/**
 * A stable color for a name, so the same person or project always gets the same one: one of the
 * theme's chart series (style.css), which hold up in light, dark and the colour-vision modes.
 */
// ponytail: 8 colors, so two names can share one; the name stays the label, the color a cue.
export function nameColor(name: string) {
  let hash = 2166136261;
  for (const c of name) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  // FNV-1a's low bits mix poorly, so fold the high bits down before taking one of eight.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return `var(--series-${((hash >>> 0) % 8) + 1})`;
}
