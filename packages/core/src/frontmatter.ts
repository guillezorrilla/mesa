import { parse, stringify } from 'yaml';

export type Frontmatter = Record<string, unknown>;
export type Note = { frontmatter: Frontmatter; body: string };

const FENCE = '---';

/** A note as markdown: YAML frontmatter between `---` fences, then the body. */
export const serializeNote = ({ frontmatter, body }: Note): string =>
  `${FENCE}\n${stringify(frontmatter)}${FENCE}\n${body}`;

/** The inverse of serializeNote. A file without frontmatter is all body. */
export function parseNote(text: string): Note {
  if (!text.startsWith(`${FENCE}\n`)) return { frontmatter: {}, body: text };
  const end = text.indexOf(`\n${FENCE}\n`, FENCE.length);
  if (end === -1) return { frontmatter: {}, body: text };
  const yaml = text.slice(FENCE.length + 1, end + 1);
  return {
    frontmatter: (parse(yaml) as Frontmatter | null) ?? {},
    body: text.slice(end + FENCE.length + 2),
  };
}
