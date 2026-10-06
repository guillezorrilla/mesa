import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { clip } from '../../lib/clip.js';
import { GENERAL_PROJECT } from '../../sessions/general.js';
import type { SessionStore } from '../../sessions/store.js';
import type { Note } from '../frontmatter.js';
import { listVault } from '../inventory.js';
import { VAULT_CATEGORIES, type VaultCategory, type VaultItem } from '../item.js';
import { projectHubPath, VAULT } from '../layout.js';
import { linkIndex, outsideCode, resolveLinks, type VaultLink } from '../links.js';
import { noteOf } from '../reader.js';
import { type SessionGoal, sessionGoals } from './session-goals.js';

// A project's overview (CONTEXT.md, Project context): what a session reads first, with fixed
// caps and a byte budget, so its size never grows with the vault. More comes from reading and
// searching on demand. `mesa vault context`.

/** Each list's cap, and the most characters of each text. */
const CAPS = { index: 20, notes: 20, decisions: 10, goals: 10 };
const CHARS = { excerpt: 2000, heading: 80, line: 200, title: 100 };
const HEADINGS = 12;
/** The most bytes the overview's JSON takes: under 8 KB. */
export const CONTEXT_BYTES = 8000;

export type ProjectContext = {
  project: string;
  /** Its hub, `projects/<name>.md`: its headings as written and the start of its body. */
  hub: { path: string; headings: string[]; excerpt: string } | null;
  /** The General project only: how many items the vault holds in each category. */
  counts?: Record<VaultCategory, number>;
  /** The index.md lines with a link to one of its items (General: with any link), in order. */
  index: string[];
  /** Its other Markdown notes, newest first. */
  notes: { path: string; title: string; modified: string }[];
  /** Its notes with `type: decision`, newest first; `when` is the day its file name starts with. */
  decisions: { title: string; path: string; when: string }[];
  /** Its earlier sessions, newest first (sessionGoals). */
  goals: SessionGoal[];
  /** What the overview left out, and the commands that read the rest. */
  more: string;
};

type Lists = 'index' | 'notes' | 'decisions' | 'goals';
type Left = Record<Lists, number> & { hub: boolean };
/** The order lists give up entries to the byte budget, the longest first. */
const TRIM: readonly Lists[] = ['notes', 'index', 'goals', 'decisions'];

/** Layout notes and history: never one of a project's notes. */
const NOT_NOTES = new Set<VaultCategory>(['receipts', 'index', 'log', 'agents']);
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const DAY = /^(\d{4}-\d{2}-\d{2})-/;

/** A note as the reader reads it; undefined when the system does not let Mesa open it. */
function readItem(vault: string, item: VaultItem): Note | undefined {
  try {
    return noteOf(readFileSync(join(vault, item.path), 'utf8'));
  } catch {
    return undefined;
  }
}

/** A body's headings, `## Purpose` as written, with any inside code left out. */
function headingsOf(body: string): { depth: number; text: string; line: string }[] {
  const plain = outsideCode(body).split('\n');
  return body.split('\n').flatMap((line, i) => {
    const match = HEADING.exec(plain[i] ?? '') && HEADING.exec(line);
    return match ? [{ depth: match[1]?.length ?? 0, text: match[2] ?? '', line: line.trim() }] : [];
  });
}

/** A note's title: its frontmatter's `title`, else its first `# ` heading, else its file name. */
function titleOf(item: VaultItem, note: Note): string {
  const { title } = note.frontmatter;
  const heading = headingsOf(note.body).find((h) => h.depth === 1 && h.text)?.text;
  const name = item.path.slice(item.path.lastIndexOf('/') + 1).replace(/\.md$/, '');
  return clip((typeof title === 'string' && title.trim()) || heading || name, CHARS.title);
}

const newest = (a: VaultItem, b: VaultItem) =>
  b.modified.localeCompare(a.modified) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** The lines of `body` holding a link that `leads`, in order. */
function linkedLines(body: string, links: readonly VaultLink[], leads: (l: VaultLink) => boolean) {
  const lines: string[] = [];
  let next = 0;
  let at = 0;
  for (const line of body.split('\n')) {
    const end = at + line.length;
    let named = false;
    for (; next < links.length && (links[next]?.start ?? end) < end; next++) {
      named ||= leads(links[next] as VaultLink);
    }
    if (named) lines.push(clip(line.trim(), CHARS.line));
    at = end + 1;
  }
  return lines;
}

const counted = (n: number, one: string, many: string) =>
  n ? [`${n} ${n === 1 ? one : many}`] : [];

/** `more`: what the overview left out, then the commands that read the rest. */
function hintOf(project: string, left: Left, empty: boolean, vault: boolean): string {
  if (!vault) return 'The vault does not exist yet: mesa vault init lays it out.';
  const general = project === GENERAL_PROJECT;
  if (empty) {
    return general
      ? 'No notes in the vault yet, and no earlier General sessions.'
      : `Nothing in the vault for ${project} yet: no hub at ${projectHubPath(project)}, no notes, and no earlier sessions.`;
  }
  const parts = [
    ...(left.hub ? ['the rest of the hub'] : []),
    ...counted(left.index, 'index line', 'index lines'),
    ...counted(left.notes, 'note', 'notes'),
    ...counted(left.decisions, 'decision', 'decisions'),
    ...counted(left.goals, 'goal', 'goals'),
  ];
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const list = general ? 'mesa vault list' : `mesa vault list --project ${project}`;
  const goals = general ? 'mesa vault goals --general' : `mesa vault goals ${project}`;
  return `${said ? `Left out: ${said}.` : 'Nothing left out.'} mesa vault read <path> reads a note in full, ${list} lists every item, and ${goals} lists earlier goals.`;
}

const bytes = (context: ProjectContext) => Buffer.byteLength(JSON.stringify(context));

/**
 * The overview cut to CONTEXT_BYTES: the longest list gives up its last entry first, then the
 * hub's excerpt shortens; `more` says what went.
 */
function fit(draft: Omit<ProjectContext, 'more'>, left: Left, hint: (left: Left) => string) {
  const context: ProjectContext = { ...draft, more: hint(left) };
  for (;;) {
    const over = bytes(context) - CONTEXT_BYTES;
    if (over <= 0) return context;
    const longest = TRIM.reduce((a, b) => (context[b].length > context[a].length ? b : a));
    const { hub } = context;
    if (context[longest].length) {
      context[longest].pop();
      left[longest]++;
    } else if (hub && hub.excerpt.length > 3) {
      hub.excerpt = clip(hub.excerpt, Math.max(3, Array.from(hub.excerpt).length - over - 3));
      left.hub = true;
    } else return context;
    context.more = hint(left);
  }
}

/**
 * The overview of `project` (a registered project, or GENERAL_PROJECT for the whole vault with
 * its counts per category instead of a hub), deterministic for the same vault and sessions. A
 * missing vault is an empty one. `exclude` is left out of its goals: the session asking.
 */
export function projectContext(
  deps: { vault: string; store: SessionStore },
  project: string,
  { exclude }: { exclude?: string } = {},
): ProjectContext {
  const { vault } = deps;
  const general = project === GENERAL_PROJECT;
  const exists = statSync(vault, { throwIfNoEntry: false }) !== undefined;
  const items = exists ? listVault(vault) : [];
  const readable = items.filter((item) => !item.unavailable);
  const byPath = new Map(readable.map((item) => [item.path, item]));

  const hubPath = projectHubPath(project);
  const hubItem = general ? undefined : byPath.get(hubPath);
  const hubNote = hubItem && readItem(vault, hubItem);
  const hub = hubNote
    ? {
        path: hubPath,
        headings: headingsOf(hubNote.body)
          .slice(0, HEADINGS)
          .map((h) => clip(h.line, CHARS.heading)),
        excerpt: clip(hubNote.body.trim(), CHARS.excerpt),
      }
    : null;

  const indexItem = byPath.get(VAULT.index);
  const indexNote = indexItem && readItem(vault, indexItem);
  const leads = (link: VaultLink) =>
    general || (link.status === 'resolved' && byPath.get(link.path)?.project === project);
  const index = indexNote
    ? linkedLines(
        indexNote.body,
        resolveLinks(linkIndex(items.map((item) => item.path)), VAULT.index, indexNote.body),
        leads,
      )
    : [];

  const own = readable
    .filter((item) => item.kind === 'markdown' && !NOT_NOTES.has(item.category))
    .filter((item) => general || (item.project === project && item.path !== hubPath))
    .sort(newest)
    .flatMap((item) => {
      const note = readItem(vault, item);
      return note ? [{ item, note }] : [];
    });
  const notes = own.filter(({ note }) => note.frontmatter.type !== 'decision');
  const decisions = own
    .filter(({ note }) => note.frontmatter.type === 'decision')
    .map((decision) => {
      const { path, modified } = decision.item;
      const day = DAY.exec(path.slice(path.lastIndexOf('/') + 1))?.[1];
      return { ...decision, when: day ?? modified.slice(0, 10) };
    })
    // Stable, so a tie keeps the newest-modified first.
    .sort((a, b) => b.when.localeCompare(a.when));

  const goals = sessionGoals(deps, project, { limit: Number.MAX_SAFE_INTEGER, exclude });
  const left: Left = {
    index: Math.max(0, index.length - CAPS.index),
    notes: Math.max(0, notes.length - CAPS.notes),
    decisions: Math.max(0, decisions.length - CAPS.decisions),
    goals: Math.max(0, goals.length - CAPS.goals),
    hub: hubNote !== undefined && hub?.excerpt !== hubNote.body.trim(),
  };
  const empty = !hub && !index.length && !own.length && !goals.length;
  return fit(
    {
      project,
      hub,
      ...(general
        ? {
            counts: Object.fromEntries(
              VAULT_CATEGORIES.map((c) => [c, items.filter((item) => item.category === c).length]),
            ) as Record<VaultCategory, number>,
          }
        : {}),
      index: index.slice(0, CAPS.index),
      notes: notes.slice(0, CAPS.notes).map(({ item, note }) => ({
        path: item.path,
        title: titleOf(item, note),
        modified: item.modified,
      })),
      decisions: decisions.slice(0, CAPS.decisions).map(({ item, note, when }) => ({
        title: titleOf(item, note),
        path: item.path,
        when,
      })),
      goals: goals.slice(0, CAPS.goals),
    },
    left,
    (now) => hintOf(project, now, empty, exists),
  );
}
