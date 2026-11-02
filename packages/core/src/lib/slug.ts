/** The one stable slug spelling used by project files and repository checkouts. */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // One dash each end at most, as runs are one dash now: a `-+$` would backtrack on many dashes.
    .replace(/^-|-$/g, '');

/** `text`'s slug cut to `max` characters (80, so a file system takes it as a name). */
export const truncatedSlug = (text: string, max = 80) =>
  slugify(text).slice(0, max).replace(/-$/, '');

/**
 * `text` as words for a name (a session's, a branch's): accents folded to their letters, then its
 * slug cut at a word within `max`, or within its one word when that alone is longer.
 */
export const wordSlug = (text: string, max: number) => {
  const slug = slugify(text.normalize('NFKD').replace(/\p{M}/gu, ''));
  if (slug.length <= max) return slug;
  const at = slug.slice(0, max + 1).lastIndexOf('-');
  return slug.slice(0, at > 0 ? at : max);
};
