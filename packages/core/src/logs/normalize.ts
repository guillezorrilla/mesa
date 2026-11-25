// What varies between lines of one kind (CONTEXT.md, Logs panel): ids, uuids, hex, numbers,
// dates and quoted values, so two errors of one failure group together. Pure, so the app bundles it.

const DATE = /\d{4}-\d\d-\d\d(?:[T ]\d\d:\d\d(?::\d\d(?:[.,]\d+)?)?(?:Z|[+-]\d\d:?\d\d)?)?/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** A quoted value: double quotes, or single quotes that open after a space or a separator. */
const QUOTED = /"[^"\n]{0,200}"|(^|[\s=:([{,])'[^'\n]{0,200}'/g;
const TOKEN = /[\w.+-]+/g;

/** One word: an id (long, or hex, with a digit) as `#`; else its numbers as `#`. */
function word(token: string) {
  if (!/\d/.test(token)) return token;
  if (token.length >= 8 || /^[0-9a-f]{4,}$/i.test(token)) return '#';
  return token.replace(/\d+/g, '#');
}

/** `message` with what varies between lines of one kind (dates, uuids, quoted values, ids, numbers) as `#`. */
export const normalizedMessage = (message: string) =>
  message
    .replace(DATE, '#')
    .replace(UUID, '#')
    .replace(QUOTED, (_, lead: string | undefined) => `${lead ?? ''}#`)
    .replace(TOKEN, word);

/** Stricter than normalizedMessage: every word that holds a digit (an id, a count, a station code like LC-04) as one `#`. */
export const strictNormalized = (message: string) =>
  normalizedMessage(
    message
      .split(/\s+/)
      .map((w) => (/\d/.test(w) ? '#' : w))
      .join(' '),
  );
