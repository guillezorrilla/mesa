import { MesaError } from '../lib/result.js';
import { truncatedSlug } from '../projects/slug.js';

/** The note name a title gives: its slug, cut to 80 characters (truncatedSlug). */
export function nameOf(title: string): string {
  const name = truncatedSlug(title);
  if (!name) {
    throw new MesaError('usage', `the title ${title} has no letter or digit to name its note`);
  }
  return name;
}
