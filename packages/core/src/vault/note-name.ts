import { MesaError } from '../lib/result.js';
import { truncatedSlug, wordSlug } from '../lib/slug.js';

/** The longest note name, so a file system takes it with a date before it and `-2` after. */
const NOTE_NAME_CHARS = 80;

/** The note name a title gives: its slug, cut at a word within NOTE_NAME_CHARS (wordSlug). */
export function nameOf(title: string): string {
  const name = wordSlug(title, NOTE_NAME_CHARS);
  if (!name) {
    throw new MesaError('usage', `the title ${title} has no letter or digit to name its note`);
  }
  return name;
}

/** The name an older Mesa gave a note of `title`: cut mid-word, accents dropped (#877). */
export const legacyNameOf = (title: string) => truncatedSlug(title, NOTE_NAME_CHARS);
