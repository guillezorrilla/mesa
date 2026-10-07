import { existsSync, readFileSync, statSync } from 'node:fs';
import { clip } from '../lib/clip.js';
import { projectLabel, projectScope } from '../sessions/record/general.js';
import type { SessionRecord } from '../sessions/record/record.js';
import type { SessionStore } from '../sessions/record/store.js';
import { itemCategory, itemProject, type VaultCategory } from '../vault/item.js';
import { projectContext } from '../vault/mount/project-context.js';
import { noteOf } from '../vault/reader.js';
import { vaultFile } from '../vault/scope.js';
import { searchVault } from '../vault/search.js';
import { adviceText } from './advice.js';
import type { Evaluation } from './evaluate.js';
import { MAX_SOURCES, type Packet, relevancePacket, type Source } from './packet.js';

// Scoped context (CONTEXT.md, Scoped context): the relevance site over a session's own project.
// The candidates come from the vault's owners (search, then the project's decisions and notes),
// capped; the model may rank them, and never adds to them.

/** Where sources may come from: knowledge, never receipts, Daily notes or the layout notes. */
const SOURCE_CATEGORIES = new Set<VaultCategory>(['wiki', 'projects', 'raw', 'user']);

export type ScopedContext = {
  session: string;
  project: string;
  query: string;
  /** Kept whatever the ranking says: the session's saved goal and its project hub's headings. */
  required: { goal?: string; hub?: { path: string; headings: string[] } };
  /** The sources sent, ranked when the answer was accepted, else in their original order. */
  sources: Source[];
  evaluation: Evaluation;
  advice: string;
};

/** The most characters of the saved goal a result repeats. */
const GOAL_CHARS = 300;

type Candidate = { path: string; title: string };

/**
 * The sources for `session`: vault search for `query`, then its project's decisions and notes,
 * each once, the hub left out (it is required). A project session sees only its project; a General
 * session only items of no project (the conservative General policy). Each is read through the
 * vault's scope; one that does not read is left out. `revision` changes when any of them does.
 */
function sourcesOf(
  deps: { vault: string; store: SessionStore },
  session: SessionRecord,
  query: string,
) {
  const { vault } = deps;
  const project = projectScope(session.project);
  const overview = projectContext(deps, session.project, { exclude: session.id });
  const hits = existsSync(vault)
    ? searchVault(vault, query, { project, limit: MAX_SOURCES }).items
    : [];
  const listed: Candidate[] = [...overview.decisions, ...overview.notes];
  // The overview's titles (frontmatter, heading, then file name) over search's file names.
  const titles = new Map(listed.map((c) => [c.path, c.title]));
  const candidates = [...hits, ...listed];
  const seen = new Set(overview.hub ? [overview.hub.path] : []);
  const sources: Source[] = [];
  const revision: string[] = [];
  for (const { path, title } of candidates) {
    if (sources.length === MAX_SOURCES) break;
    if (seen.has(path) || !path.endsWith('.md') || !SOURCE_CATEGORIES.has(itemCategory(path)))
      continue;
    seen.add(path);
    let text: string;
    let changed: string;
    try {
      const file = vaultFile(vault, path);
      text = readFileSync(file, 'utf8');
      const stat = statSync(file);
      changed = `${stat.mtimeMs}:${stat.size}`;
    } catch {
      continue;
    }
    const note = noteOf(text);
    if (itemProject(path, note.frontmatter) !== project) continue;
    const body = note.body
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join(' ');
    sources.push({ id: `note:${path}`, title: titles.get(path) ?? title, excerpt: body });
    revision.push(`${path}@${changed}`);
  }
  const hub = overview.hub && { path: overview.hub.path, headings: overview.hub.headings };
  return { sources, hub, revision: revision.join('\n') };
}

/** `sources` by the model's probabilities, highest first, ties in their original order. */
function ranked(sources: Source[], evaluation: Evaluation): Source[] {
  const { probabilities: ps, status, answer } = evaluation;
  if (status !== 'accepted' || answer === 'none' || typeof ps !== 'object') return sources;
  return sources
    .map((source, i) => ({ source, i, p: ps[source.id] ?? 0 }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map(({ source }) => source);
}

/**
 * The scoped context of `session` for `query` (its saved goal by default): its sources, which
 * `run` evaluates at the relevance site. With no source there is nothing to ask.
 */
export async function scopedContext(
  deps: { vault: string; store: SessionStore },
  session: SessionRecord,
  query: string,
  run: (packet: Packet, revision: string) => Promise<Evaluation>,
  mode: Evaluation['mode'],
): Promise<ScopedContext> {
  const { sources, hub, revision } = sourcesOf(deps, session, query);
  const { packet, sent } = relevancePacket(query, sources);
  const evaluation: Evaluation = sent.length
    ? await run(packet, revision)
    : {
        site: 'relevance',
        mode,
        status: 'unavailable',
        reason: 'the vault holds no source for this session',
        latencyMs: 0,
      };
  return {
    session: session.id,
    project: projectLabel(session.project),
    query,
    required: {
      ...(session.goal ? { goal: clip(session.goal, GOAL_CHARS) } : {}),
      ...(hub ? { hub } : {}),
    },
    sources: ranked(sent, evaluation),
    evaluation,
    advice: adviceText(evaluation),
  };
}
