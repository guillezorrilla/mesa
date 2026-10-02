/** The one stable slug spelling used by project files and repository checkouts. */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** `text`'s slug cut to 80 characters, so a file system takes it as a name. */
export const truncatedSlug = (text: string) => slugify(text).slice(0, 80).replace(/-+$/, '');
