import type { z } from 'zod';
import type { ImpactReport } from '../../impact/report.js';
import type { ImpactOptions } from '../../impact/service.js';
import { clip } from '../../lib/clip.js';
import { MesaError } from '../../lib/result.js';
import type { ProjectRow } from '../../projects/projects.js';
import type { Recorded } from '../../receipts/recorder.js';
import type { WeeklyRewind } from '../../usage/rewind.js';
import { dailyNotePath } from '../../vault/layout.js';
import type { ProjectContext } from '../../vault/mount/project-context.js';
import type { DecisionInput, Saved } from '../../vault/mount/session-writes.js';
import type { VaultRead } from '../../vault/reader.js';
import type { VaultSearch, VaultSearchFilter } from '../../vault/search.js';
import type { CallResult } from '../protocol/rpc.js';
import { type PhoneNote, vaultCalls } from '../protocol/vault.js';

/**
 * The vault functions the CLI uses (`mesa projects`, `vault context/search/read`, `impact`,
 * `rewind`, `vault save decision`). Only `saveDecision` writes: the phone reads the Daily note
 * as last built and usage as last synced, never rebuilding or syncing them.
 */
export type VaultDeps = {
  projects: () => ProjectRow[];
  context: (project: string) => ProjectContext;
  read: (path: string) => VaultRead;
  search: (text: string, filter?: VaultSearchFilter) => VaultSearch;
  /** Today's local day, `YYYY-MM-DD`. */
  day: () => string;
  impact: (options: ImpactOptions) => ImpactReport;
  rewind: () => Promise<WeeklyRewind>;
  saveDecision: (input: DecisionInput) => Promise<Recorded<Saved>>;
};

/** The most characters of a note and of a hub the phone gets, and how many of each list. */
const NOTE_CHARS = 30_000;
const HUB_CHARS = 2_000;
const LIST = 10;
const HITS = 25;
const REWIND_NOTES = 20;

type VaultCall = z.infer<(typeof vaultCalls)[number]>;
const VAULT_METHODS = new Set<string>(vaultCalls.map((call) => call.shape.method.value));
export const isVaultCall = (call: { method: string }): call is VaultCall =>
  VAULT_METHODS.has(call.method);

const fileTitle = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');

/** A vault item as the phone's reader shows it: Markdown cut to `chars`, its resolved links. */
export function toPhoneNote(read: VaultRead, chars = NOTE_CHARS): PhoneNote {
  if (read.preview !== 'markdown')
    return {
      path: read.path,
      title: fileTitle(read.path),
      body: '',
      links: [],
      clipped: false,
      unsupported:
        read.preview === 'unsupported' ? read.reason : `Open this ${read.preview} on the Mac.`,
    };
  const { title } = read.frontmatter;
  const body = clip(read.body.trim(), chars);
  const links = new Map(
    read.links.flatMap((link) =>
      link.status === 'resolved' ? [[link.text, link.path] as const] : [],
    ),
  );
  return {
    path: read.path,
    title: (typeof title === 'string' && title.trim()) || fileTitle(read.path),
    body,
    links: [...links].map(([text, path]) => ({ text, path })),
    clipped: body !== read.body.trim(),
  };
}

/** Today's Daily note as last built (reading never rebuilds it), or null before its first build. */
function dailyNote(deps: VaultDeps, day: string) {
  try {
    return toPhoneNote(deps.read(dailyNotePath(day)));
  } catch (error) {
    if (error instanceof MesaError && error.code === 'not_found') return null;
    throw error;
  }
}

/** Answers one vault call (#1068); a project, note or path Mesa does not know is not_found. */
export async function answerVaultCall(deps: VaultDeps, call: VaultCall): Promise<unknown> {
  if (call.method === 'projects')
    return {
      projects: deps
        .projects()
        .filter((p) => !p.hidden)
        .map((p) => ({ name: p.name, label: p.label })),
    } satisfies CallResult<'projects'>;
  if (call.method === 'project') {
    const context = deps.context(call.name);
    return {
      project: context.project,
      hub: context.hub ? toPhoneNote(deps.read(context.hub.path), HUB_CHARS) : null,
      decisions: context.decisions.slice(0, LIST),
      notes: context.notes.slice(0, LIST),
      goals: context.goals.slice(0, LIST).map(({ id, started, goal, summary }) => ({
        id,
        started,
        ...(goal ? { goal } : {}),
        ...(summary ? { summary } : {}),
      })),
    } satisfies CallResult<'project'>;
  }
  if (call.method === 'vaultSearch') {
    const found = deps.search(call.text, { limit: HITS });
    return {
      total: found.total,
      hits: found.items.map((hit) => ({
        path: hit.path,
        title: hit.title,
        ...(hit.project ? { project: hit.project } : {}),
        ...(hit.matches[0] ? { line: hit.matches[0].text } : {}),
      })),
    } satisfies CallResult<'vaultSearch'>;
  }
  if (call.method === 'vaultNote')
    return toPhoneNote(deps.read(call.path)) satisfies CallResult<'vaultNote'>;
  if (call.method === 'today') {
    const date = deps.day();
    const [impact, rewind] = [deps.impact({ days: 1 }), await deps.rewind()];
    return {
      date,
      daily: dailyNote(deps, date),
      impact: {
        sentence: impact.sentence,
        caught: impact.summary.caught,
        kept: impact.summary.kept,
        notesIn: impact.summary.notesIn,
        stopped: impact.summary.stopped,
      },
      rewind: {
        from: rewind.from,
        through: rewind.through,
        notes: rewind.notes
          .slice(0, REWIND_NOTES)
          .map(({ kind, summary, path }) => ({ kind, summary, path })),
        ended: rewind.sessions.length,
        costUsd: rewind.usage.estimatedCostUsd,
        missing: rewind.missing,
      },
    } satisfies CallResult<'today'>;
  }
  const { project, title, decision, rationale } = call;
  const saved = await deps.saveDecision({ project, title, decision, rationale });
  return {
    path: saved.result.path,
    changed: saved.result.changed,
    receipt: saved.receipt?.path ?? null,
  } satisfies CallResult<'decide'>;
}
