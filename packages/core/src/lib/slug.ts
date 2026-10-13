/** The one stable slug spelling used by project files and repository checkouts. */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** `text`'s slug cut to `max` characters (80, so a file system takes it as a name). */
export const truncatedSlug = (text: string, max = 80) =>
  slugify(text).slice(0, max).replace(/-+$/, '');
