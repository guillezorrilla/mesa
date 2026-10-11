import { MesaError } from '../lib/result.js';

/** One version's section of CHANGELOG.md: its notes as plain text, without `(#123)` references. */
export type ReleaseNotes = {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  fixed: string[];
};

/** The groups of a version's notes, in the order every reader lists them, with their names. */
export const RELEASE_GROUPS = [
  { key: 'added', label: 'New' },
  { key: 'changed', label: 'Changed' },
  { key: 'fixed', label: 'Fixed' },
] as const;
type ReleaseGroup = (typeof RELEASE_GROUPS)[number]['key'];

/**
 * Where each group heading's notes go: the Keep a Changelog headings `scripts/release/notes.mjs`
 * writes (the writer of this format, which `notes.test.ts` holds to this reader), and those of the
 * sections before change files (#639). Other is left out.
 */
const GROUPS: Record<string, ReleaseGroup> = {
  Added: 'added',
  Features: 'added',
  Changed: 'changed',
  Performance: 'changed',
  'Breaking changes': 'changed',
  Fixed: 'fixed',
  Fixes: 'fixed',
};
const HEADING = /^## (\S+) - (\d{4}-\d{2}-\d{2})/;

const REFERENCE = /^\(#\d+(?:, #\d+)*\)$/;

/** `text` without its trailing `(#123)` or `(#1, #2)` references, one at a time, in linear time. */
function withoutReferences(text: string) {
  let rest = text.trimEnd();
  for (let open = rest.lastIndexOf('(#'); open !== -1; open = rest.lastIndexOf('(#')) {
    if (!REFERENCE.test(rest.slice(open))) break;
    rest = rest.slice(0, open).trimEnd();
  }
  return rest;
}

/** A bullet as plain text: no `(#123)` references, no older `**area**: ` labels, a capital first. */
function plain(line: string) {
  const text = withoutReferences(line.slice(2)).replace(/^(?:\*\*[^*]+\*\*(?:, )?)+: /, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Every version section of `changelog`, in its order (newest first). */
export function parseChangelog(changelog: string): ReleaseNotes[] {
  return changelog.split(/^(?=## )/m).flatMap((part) => {
    const [, version, date] = part.match(HEADING) ?? [];
    if (!version || !date) return [];
    const notes: ReleaseNotes = { version, date, added: [], changed: [], fixed: [] };
    for (const group of part.split(/^(?=### )/m).slice(1)) {
      const list = GROUPS[group.slice(4, group.indexOf('\n')).trim()];
      if (!list) continue;
      for (const line of group.split('\n')) if (line.startsWith('- ')) notes[list].push(plain(line));
    }
    return [notes];
  });
}

/** The sections of the changelog `read` returns; none when there is none or it does not read. */
export function changelogNotes(read: (() => string) | undefined): ReleaseNotes[] {
  try {
    return read ? parseChangelog(read()) : [];
  } catch {
    return [];
  }
}

/** `version`'s notes in the changelog `read` returns; not_found, naming it, when it has none. */
export function whatsNew(read: (() => string) | undefined, version: string): ReleaseNotes {
  const notes = changelogNotes(read).find((section) => section.version === version);
  if (!notes) throw new MesaError('not_found', `no release notes for ${version}`);
  return notes;
}
