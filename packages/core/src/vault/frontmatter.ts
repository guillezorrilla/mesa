import { parse, stringify } from 'yaml';

export type Frontmatter = Record<string, unknown>;
export type Note = { frontmatter: Frontmatter; body: string };

const FENCE = '---';

/** A note as markdown: YAML frontmatter between `---` fences, then the body. */
export const serializeNote = ({ frontmatter, body }: Note): string =>
  `${FENCE}\n${stringify(frontmatter)}${FENCE}\n${body}`;

/** Reads LF or CRLF fences without changing body newlines. No complete fences means all body. */
export function parseNote(text: string): Note {
  const opening = /^---\r?\n/.exec(text);
  if (!opening) return { frontmatter: {}, body: text };
  const closing = /\r?\n---\r?\n/.exec(text.slice(FENCE.length));
  if (!closing) return { frontmatter: {}, body: text };
  const end = FENCE.length + closing.index;
  const yaml = text.slice(opening[0].length, end + closing[0].indexOf(FENCE));
  return {
    frontmatter: (parse(yaml) as Frontmatter | null) ?? {},
    body: text.slice(end + closing[0].length),
  };
}
