import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { keepSections } from '../skills/keep-sections.js';
import type { Frontmatter, Note } from './frontmatter.js';
import { addToIndex } from './index-note.js';
import { projectHubPath, VAULT } from './layout.js';
import { wikilink } from './links.js';
import { nameOf } from './note-name.js';
import { type NotesDeps, ownFields, readNote, refuseForeign, writeNote } from './notes.js';
import { vaultFile, vaultWriteFile } from './scope.js';

// The decisions and notes Mesa saves for a session, by a save (session-writes.ts) or a Vault
// capture (capture/land.ts): what each holds, and keeping one at a path. Callers hold the vault
// lock and redact the text first.

/** Faro's probability per option and its confidence, as a decision keeps them. */
export type Odds = { probabilities?: Record<string, number>; confidence?: number };

/** Where a decision of `title` saved on `day` goes, before any `-2`: `wiki/decisions/<day>-<slug>`. */
export const decisionName = (day: string, title: string) =>
  `${VAULT.wiki}/decisions/${day}-${nameOf(title)}`;

/** Where a note of `title` goes, before any `-2`: `wiki/notes/<slug>`. */
export const noteName = (title: string) => `${VAULT.wiki}/notes/${nameOf(title)}`;

/** A decision note (`type: decision`): its title, decision, rationale, odds, and project hub link. */
export function decisionNote(input: {
  project: string;
  session?: string;
  title: string;
  decision: string;
  rationale: string;
  odds: Odds;
}): Note {
  const { project, session, title, decision, rationale, odds } = input;
  const frontmatter: Frontmatter = {
    type: 'decision',
    project,
    ...(session ? { session } : {}),
    ...odds,
  };
  const body = `# ${title}\n\n${decision}\n\n## Rationale\n\n${rationale}\n\nProject: ${wikilink(projectHubPath(project))}\n`;
  return { frontmatter, body };
}

/** A note (`type: note`), headed by its title unless its text starts with a heading. */
export function plainNote(input: {
  project?: string;
  session?: string;
  title: string;
  text: string;
}): Note {
  const { project, session, title, text } = input;
  const heading = text.startsWith('# ') ? '' : `# ${title}\n\n`;
  const frontmatter: Frontmatter = {
    type: 'note',
    ...(project ? { project } : {}),
    ...(session ? { session } : {}),
  };
  return { frontmatter, body: `${heading}${text}\n` };
}

/** The note at `path` in `project`'s scope, if there is one. */
export function existingNote(vault: string, path: string, project?: string): Note | undefined {
  const file = vaultWriteFile(vault, path, project);
  return existsSync(file) ? readNote(vault, path) : undefined;
}

/** A note ready to keep at `path`: the one it replaces, and whether their own content is the same. */
export type Kept = { path: string; previous?: Note; next: Note; same: boolean };

/** Whether two notes say the same: their bodies, and their own frontmatter (not writeNote's). */
const sameContent = (a: Note, b: Note) =>
  a.body === b.body && isDeepStrictEqual(ownFields(a.frontmatter), b.frontmatter);

/**
 * `note` ready to keep at `path`, keeping the blocks between paired `<!-- keep -->` markers of the
 * one it replaces. A note there that is the person's (locked, or not Mesa's) is refused
 * (refuseForeign), before anything is written.
 */
export function prepareKeep(vault: string, path: string, note: Note, project?: string): Kept {
  const previous = existingNote(vault, path, project);
  refuseForeign(vaultFile(vault, path), previous);
  const next = { ...note, body: keepSections(note.body, previous?.body ?? '', path) };
  return { path, previous, next, same: Boolean(previous && sameContent(previous, next)) };
}

/** Writes a prepared note, and a new one's index line, `summary`. */
export function applyKeep(deps: NotesDeps, kept: Kept, summary: string) {
  writeNote(deps, { path: kept.path, ...kept.next });
  if (!kept.previous) addToIndex(deps.vault, kept.path, summary);
}
