// Text a provider (GitHub, Bitbucket) gives Mesa to quote to an agent: cleaned to one plain line
// and quoted in a fence the agent is told to read as data, never as instructions.

/** The language tag of the fence untrusted provider text is quoted in. */
export const UNTRUSTED_FENCE = 'untrusted-github-text';

/**
 * `text` with no control or format character (ESC, ^C, DEL, a bidi override) and no backtick,
 * so it can neither drive the terminal nor close the fence it is quoted in, on one line.
 */
export const clean = (text: string) =>
  text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replaceAll('`', "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Up to `max` characters of `text`, cleaned: an excerpt, a check name, a path, a login. */
export const short = (text: string, max = 160) => {
  const line = clean(text);
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
};
