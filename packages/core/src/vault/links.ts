// A note's links (CONTEXT.md, Vault reader): the wikilinks, embeds, and relative Markdown links its
// body writes, and the vault item each one leads to, found the way Obsidian finds it. The one owner
// for links, so the reader, backlinks, and the project context agree. Pure: no file is read here.

/** One link as a note's body writes it. */
export type NoteLink = {
  /** As written: `[[tide#Tables|tides]]`, `![[chart.png]]`, `[chart](../raw/chart.png)`. */
  text: string;
  /** Where `text` starts and ends in the body, as string offsets. */
  start: number;
  end: number;
  syntax: 'wikilink' | 'markdown';
  /** `![[...]]` or `![...](...)`: shown in place instead of linked. */
  embed: boolean;
  /**
   * What it names, decoded, without its subpath: a path, a path's end, or a file name. Empty
   * for the note itself.
   */
  target: string;
  /** A heading (`Tables`, `Tables#Neap`) or block (`^a1b2`) after the first `#`. */
  subpath?: string;
  /** The words it shows: a wikilink's after `|`, a Markdown link's in brackets. */
  alias?: string;
};

/** Where a link leads: one item, none (`broken`), or more than one (`ambiguous`, never guessed). */
export type LinkResolution =
  | { status: 'resolved'; path: string }
  | { status: 'broken' }
  | { status: 'ambiguous'; candidates: string[] };

export type VaultLink = NoteLink & LinkResolution;

/** The vault's paths, keyed the ways a link names one. Built once per inventory, then shared. */
export type LinkIndex = { byPath: Map<string, string>; byName: Map<string, string[]> };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_SPAN = /(`+).*?\1/g;
// A wikilink or embed, `(!)[[inner]]`; or a Markdown link or image, `(!)[text](destination)`.
const LINK = /(!?)\[\[([^[\]\n]+)\]\]|(!?)\[([^[\]\n]*)\]\(([^()\n]*)\)/g;
// A URL (`https:`, `mailto:`, `obsidian:`, ...) or a protocol-relative one: never a vault item.
const URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const blank = (text: string) => ' '.repeat(text.length);

/** The body with fenced code blocks and inline code blanked out, so offsets stay the body's. */
function outsideCode(body: string): string {
  let fence = '';
  return body
    .split('\n')
    .map((line) => {
      const open = FENCE.exec(line);
      const marker = open?.[1] ?? '';
      if (fence) {
        const closes =
          marker[0] === fence[0] &&
          marker.length >= fence.length &&
          !line.slice(open?.[0].length).trim();
        if (closes) fence = '';
        return blank(line);
      }
      if (marker) {
        fence = marker;
        return blank(line);
      }
      return line.replace(CODE_SPAN, blank);
    })
    .join('\n');
}

const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** A target and its subpath from `target#subpath`, each read and trimmed, and the alias shown. */
function named(name: string, alias: string, read = (part: string) => part) {
  const hash = name.indexOf('#');
  const subpath = hash === -1 ? '' : read(name.slice(hash + 1)).trim();
  return {
    target: read(hash === -1 ? name : name.slice(0, hash)).trim(),
    ...(subpath ? { subpath } : {}),
    ...(alias.trim() ? { alias: alias.trim() } : {}),
  };
}

/** Every link the body writes, in order; none inside code, and no URL. */
function parseLinks(body: string): NoteLink[] {
  const links: NoteLink[] = [];
  for (const match of outsideCode(body).matchAll(LINK)) {
    const [whole, wikiBang, inner, markdownBang, words, destination] = match;
    const start = match.index;
    const at = { text: body.slice(start, start + whole.length), start, end: start + whole.length };
    if (inner !== undefined) {
      // A table cell escapes the alias bar as `\|`.
      const [name = '', ...alias] = inner.replaceAll('\\|', '|').split('|');
      links.push({
        ...at,
        syntax: 'wikilink',
        embed: wikiBang === '!',
        ...named(name, alias.join('|')),
      });
      continue;
    }
    const raw = (destination ?? '').trim();
    const path = /^<([^>]*)>/.exec(raw)?.[1] ?? raw.split(/\s+/)[0] ?? '';
    if (URL.test(path)) continue;
    // Obsidian writes a space in a Markdown link as %20.
    const shown = named(path, words ?? '', decode);
    links.push({ ...at, syntax: 'markdown', embed: markdownBang === '!', ...shown });
  }
  return links;
}

/** The index of the vault's paths (the inventory's), for resolveLinks. */
export function linkIndex(paths: readonly string[]): LinkIndex {
  const byPath = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const key = path.toLowerCase();
    if (!byPath.has(key)) byPath.set(key, path);
    const name = key.slice(key.lastIndexOf('/') + 1);
    const same = byName.get(name);
    if (same) same.push(path);
    else byName.set(name, [path]);
  }
  return { byPath, byName };
}

/** The item at exactly this vault path, `.md` left out or not, in any case. */
const exact = (index: LinkIndex, path: string) => {
  const key = path.toLowerCase();
  return index.byPath.get(key) ?? index.byPath.get(`${key}.md`);
};

/** `target` from the folder of the note at `from`; undefined when it climbs out of the vault. */
function beside(from: string, target: string): string | undefined {
  const parts = from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') {
      if (!parts.pop()) return undefined;
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

/**
 * Where one link from the note at `from` leads. No target is the note itself. A Markdown link, or
 * a target starting `./` or `../`, is first a path from the note's folder (and only that when it
 * starts so). Then: the exact vault path; else every item whose file name is the target's (case
 * aside), or, for a path-qualified target, whose path ends with it. `.md` may be left out; any
 * other extension, an attachment's, is named.
 */
function resolve(index: LinkIndex, from: string, link: NoteLink): LinkResolution {
  if (!link.target) return { status: 'resolved', path: from };
  const relative = /^\.\.?\//.test(link.target);
  if (relative || link.syntax === 'markdown') {
    const near = beside(from, link.target);
    const path = near === undefined ? undefined : exact(index, near);
    if (path) return { status: 'resolved', path };
    if (relative) return { status: 'broken' };
  }
  const target = link.target.replace(/^\/+/, '');
  const path = exact(index, target);
  if (path) return { status: 'resolved', path };
  const key = target.toLowerCase();
  const name = key.slice(key.lastIndexOf('/') + 1);
  const same = [...(index.byName.get(name) ?? []), ...(index.byName.get(`${name}.md`) ?? [])];
  const matches = key.includes('/')
    ? same.filter((p) => [`/${key}`, `/${key}.md`].some((end) => p.toLowerCase().endsWith(end)))
    : same;
  const [only, ...more] = matches;
  if (!only) return { status: 'broken' };
  return more.length
    ? { status: 'ambiguous', candidates: [...matches].sort() }
    : { status: 'resolved', path: only };
}

/** Every link the body of the note at `from` writes, in order, each with where it leads. */
export const resolveLinks = (index: LinkIndex, from: string, body: string): VaultLink[] =>
  parseLinks(body).map((link) => ({ ...link, ...resolve(index, from, link) }));

/**
 * The wikilink Mesa writes to the item at `path` (vault-relative): its path with `.md` dropped, as
 * Obsidian writes one, and `|alias` when given: `[[wiki/notes/tides]]`.
 */
export const wikilink = (path: string, alias?: string) =>
  `[[${path.replace(/\.md$/, '')}${alias ? `|${alias}` : ''}]]`;
