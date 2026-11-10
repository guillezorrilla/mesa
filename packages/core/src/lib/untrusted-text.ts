// Text that reaches an agent: a provider's (GitHub, Bitbucket), cleaned to one plain line and
// quoted in a fence the agent is told to read as data, never as instructions; and a prompt Mesa
// types, with nothing in it the agent would hold for a person or the terminal would act on.

/** The language tag of the fence untrusted provider text is quoted in. */
export const UNTRUSTED_FENCE = 'untrusted-github-text';

/** The language tag of the fence another agent's own words are quoted in (CONTEXT.md, Child report). */
export const AGENT_FENCE = 'untrusted-agent-text';

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

/**
 * `text` as it can be typed into an agent's prompt. A line or paragraph separator, or a lone CR,
 * VT, FF or NEL, becomes the newline Claude Code reads it as; then out go format characters
 * (zero-width, bidi, tags), fillers that show as nothing, and control characters but newline and
 * tab: Claude Code strips those and then holds the prompt for a person, and a control character
 * would drive the terminal (ESC, a CR's Enter).
 */
export const typeable = (text: string) =>
  text.replace(/\r\n|[\r\v\f\u0085\u2028\u2029]/g, '\n').replace(
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: each code point is dropped on its own, not read as a written character.
    /(?![\n\t])[\p{Cc}\p{Cf}\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180f\u3164\uffa0\ufff0-\ufff8\u{e0100}-\u{e01ef}]/gu,
    '',
  );
