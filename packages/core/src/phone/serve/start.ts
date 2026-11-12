import type { z } from 'zod';
import type { GuardrailCheck } from '../../decisions/guardrail.js';
import { clip } from '../../lib/clip.js';
import { MesaError } from '../../lib/result.js';
import type { ProjectRow } from '../../projects/projects.js';
import type { Recorded } from '../../receipts/recorder.js';
import type { NativeHistory } from '../../sessions/native/history.js';
import type { ConversationSearch } from '../../sessions/native/search.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import type { ItemOpenOptions } from '../../sources/item-session.js';
import type { FollowedView, Ticket } from '../../tickets/service.js';
import type { WorktreeRow } from '../../worktrees/inventory.js';
import type { CallResult } from '../protocol/rpc.js';
import { type PhoneConversation, startCalls } from '../protocol/start.js';

/** A ticket whole, as `mesa tickets show` reads it from any provider. */
type TicketShown = {
  id: string;
  key: string;
  summary: string;
  status?: string;
  url: string;
  mine: boolean;
  description?: string;
  assignee?: { name: string } | null;
  assignees?: { name: string }[];
  comments: { author: string; created: string; markdown: string }[];
  sessions: { id: string }[];
};

/**
 * The functions the CLI uses to start work (`mesa projects`, `worktrees`, `open`, `tickets`,
 * `tickets show/assign`, `history`, `history search`, `adopt`), each as a person calls it.
 */
export type StartDeps = {
  projects: () => ProjectRow[];
  worktrees: (project: string) => Promise<WorktreeRow[]>;
  /** `mesa open`, with `--from`; `guardrail` puts its goal through the guardrail first. */
  open: (project: string, opts: ItemOpenOptions) => Promise<Recorded<SessionRecord>>;
  tickets: (project: string) => Promise<{ views: FollowedView[]; tickets: Ticket[] }>;
  ticket: (id: string, site?: string) => Promise<TicketShown>;
  assign: (id: string, site?: string) => Promise<Recorded<{ assignee: string }>>;
  history: (project: string) => NativeHistory;
  search: (project: string, query: string) => ConversationSearch;
  adopt: (
    agentSessionId: string,
    opts: { project: string },
  ) => Promise<Recorded<{ record: SessionRecord }>>;
};

/** How much of a ticket the phone gets, and how many conversations it lists. */
const DESCRIPTION_CHARS = 8_000;
const COMMENTS = 5;
const COMMENT_CHARS = 1_500;
const CONVERSATIONS = 30;

type StartCallOf = z.infer<(typeof startCalls)[number]>;
const START_METHODS = new Set<string>(startCalls.map((call) => call.shape.method.value));
export const isStartCall = (call: { method: string }): call is StartCallOf =>
  START_METHODS.has(call.method);

const shown = (deps: StartDeps) => deps.projects().filter((p) => !p.hidden);

/** `mesa open` from the phone: past the guardrail, or its ask or block, which starts nothing. */
async function start(deps: StartDeps, call: Extract<StartCallOf, { method: 'start' }>) {
  const { project, goal, agent, place, branch, checkout, after, from, yes } = call;
  try {
    const { result } = await deps.open(project, {
      ...(goal.trim() ? { goal } : {}),
      ...(agent ? { agent: agent as ItemOpenOptions['agent'] } : {}),
      ...(place === 'worktree'
        ? branch?.trim()
          ? { branch: branch.trim() }
          : { worktree: true }
        : {}),
      ...(place === 'existing' && checkout ? { checkout } : {}),
      ...(after ? { after } : {}),
      // Its goal is the person's own words after the ticket's, as `open --from` builds it.
      ...(from ? { from } : {}),
      noParent: true,
      guardrail: { yes: yes ?? false },
    });
    return { status: 'started', session: result.id } satisfies CallResult<'start'>;
  } catch (error) {
    if (!(error instanceof MesaError) || error.code !== 'guardrail_blocked') throw error;
    const { verdict, reason } = error.details as GuardrailCheck;
    return {
      status: verdict === 'block' ? 'blocked' : 'ask',
      reason,
    } satisfies CallResult<'start'>;
  }
}

/**
 * The newest native conversations across the projects, or the ones whose text holds `query`,
 * each with the Mesa session it already is. ponytail: reads every project in turn on the Mac,
 * stopping at CONVERSATIONS found; an index if many projects make it slow.
 */
function history(deps: StartDeps, query?: string) {
  const found: PhoneConversation[] = [];
  let partial = false;
  for (const { name } of shown(deps)) {
    let listed: NativeHistory;
    let searched: ConversationSearch | undefined;
    try {
      listed = deps.history(name);
      searched = query ? deps.search(name, query) : undefined;
    } catch {
      // A project whose folder is gone lists nothing; the rest still do.
      continue;
    }
    const row = (id: string) => listed.rows.find((r) => r.id === id);
    const of = (agent: string, id: string, title: string, at?: string): PhoneConversation => {
      const r = row(id);
      return {
        project: name,
        agent,
        id,
        title: r?.name ?? title,
        ...(at ? { at } : {}),
        ...(r?.importedAs ? { importedAs: r.importedAs } : {}),
        elsewhere: Boolean(r?.heldElsewhere),
      };
    };
    if (!searched) {
      found.push(...listed.rows.map((r) => of(r.agent, r.id, r.id.slice(0, 8), r.updatedAt)));
      partial ||= listed.total > listed.rows.length;
      continue;
    }
    partial ||= searched.truncated;
    for (const hit of searched.hits)
      if (!found.some((f) => f.id === hit.id))
        found.push(of(hit.agent, hit.id, hit.excerpt, hit.at));
    if (found.length >= CONVERSATIONS) {
      partial = true;
      break;
    }
  }
  const newest = query ? found : [...found].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return {
    conversations: newest.slice(0, CONVERSATIONS),
    partial: partial || newest.length > CONVERSATIONS,
  } satisfies CallResult<'history'>;
}

/** Answers one start call (#1065); throws a MesaError for an unknown project or ticket. */
export async function answerStartCall(deps: StartDeps, call: StartCallOf): Promise<unknown> {
  switch (call.method) {
    case 'projects':
      return {
        projects: shown(deps).map((p) => ({ name: p.name, label: p.label })),
      } satisfies CallResult<'projects'>;
    case 'worktrees':
      return {
        worktrees: (await deps.worktrees(call.project)).flatMap((w) =>
          !w.main && w.branch ? [{ path: w.path, branch: w.branch }] : [],
        ),
      } satisfies CallResult<'worktrees'>;
    case 'start':
      return start(deps, call);
    case 'tickets': {
      const { views, tickets } = await deps.tickets(call.project);
      return {
        views: views.map((v) => ({
          name: v.name,
          ...(v.note ? { note: v.note } : {}),
          ...(v.error ? { error: v.error } : {}),
        })),
        tickets: tickets.map((t) => ({
          id: t.id,
          key: t.key,
          summary: t.summary,
          status: t.status,
          category: t.category,
          ...(t.assignee ? { assignee: t.assignee } : {}),
          mine: t.mine,
          url: t.url,
          ...(t.site ? { site: t.site } : {}),
          sessions: t.sessions.map((s) => s.id),
        })),
      } satisfies CallResult<'tickets'>;
    }
    case 'ticket': {
      const t = await deps.ticket(call.id, call.site);
      const assignees = t.assignees ?? (t.assignee ? [t.assignee] : []);
      return {
        id: t.id,
        key: t.key,
        summary: t.summary,
        status: t.status ?? '',
        url: t.url,
        mine: t.mine,
        assignees: assignees.map((a) => a.name),
        description: clip(t.description ?? '', DESCRIPTION_CHARS),
        comments: t.comments.slice(-COMMENTS).map((c) => ({
          author: c.author,
          at: c.created,
          text: clip(c.markdown, COMMENT_CHARS),
        })),
        sessions: t.sessions.map((s) => s.id),
      } satisfies CallResult<'ticket'>;
    }
    case 'assign':
      return {
        assignee: (await deps.assign(call.id, call.site)).result.assignee,
      } satisfies CallResult<'assign'>;
    case 'history':
      return history(deps, call.query?.trim() || undefined);
    case 'adopt':
      return {
        session: (await deps.adopt(call.id, { project: call.project })).result.record.id,
      } satisfies CallResult<'adopt'>;
  }
}
