import { existsSync } from 'node:fs';
import { AGENTS } from '../agents/agents.js';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { daysBefore } from '../lib/time.js';
import { findProject } from '../projects/projects.js';
import { listReceipts, showReceipt } from '../receipts/store.js';
import { promptTimes } from '../sessions/native/conversation.js';
import { projectLabel } from '../sessions/record/general.js';
import { sessionLabel } from '../sessions/record/labels.js';
import type { SessionRecord } from '../sessions/record/record.js';
import { type HookEvent, parentHook, readHookEvents } from '../sessions/signals/hook-events.js';
import { type ImpactRecord, impactReport } from './report.js';

// Impact for one profile (`mesa impact`, the Impact screen): the Decision log, the vault's receipts
// and the session records of the last `days` days, for the profile, one project or one session.

export type ImpactOptions = { days?: number; project?: string; session?: string };

/** Only the receipts that can hold a vault write are read. */
const WRITE_KINDS = ['capture', 'vault-change', 'decision'] as const;

export function impactService(ctx: MesaContext) {
  /** The Moment `id` names: a Decision log line that changed something, else a receipt. */
  const momentOf = (id: string) => {
    const line = ctx.decisionLog.read().find((e) => e.id === id && e.changed);
    if (line) return line;
    try {
      const { receipt } = showReceipt(ctx.vaultOf(), id);
      return {
        site: 'vault' as const,
        session: receipt.session ?? null,
        project: receipt.project ?? null,
        by: 'rules' as const,
      };
    } catch {
      throw new MesaError('not_found', `no Moment with id ${id}; see mesa impact --json`);
    }
  };
  return {
    /**
     * Marks Moment `moment` not right, or clears the mark (`undo`): one Decision log line; the
     * newest one stands. Nothing learns from it yet.
     */
    mark: (moment: string, { undo = false }: { undo?: boolean } = {}) => {
      const about = momentOf(moment);
      const mark = undo ? null : ('not-right' as const);
      ctx.decisionLog.append({
        site: about.site,
        session: about.session,
        project: about.project,
        question: 'Was this right?',
        rules: null,
        answer: mark,
        by: about.by,
        status: 'marked',
        changed: false,
        moment,
        mark,
      });
      return { moment, mark };
    },
    report: ({ days = 7, project, session }: ImpactOptions = {}) => {
      // An unknown project or session is not_found, naming it.
      if (project) findProject(ctx.open(), project);
      if (session) ctx.store.get(session);
      const since = daysBefore(ctx.clock(), days).toISOString();
      const filter = { ...(project ? { project } : {}), ...(session ? { session } : {}) };
      const entries = ctx.decisionLog.read({ since: new Date(since), ...filter });
      const vault = ctx.configIfAny()?.vault;
      const receipts =
        vault && existsSync(vault)
          ? listReceipts(vault, Number.POSITIVE_INFINITY, {
              ...filter,
              kind: WRITE_KINDS,
              profile: ctx.profile,
              since,
            })
          : [];
      const found = new Map<string, SessionRecord>(ctx.store.list().map((r) => [r.id, r]));
      // Each session's hook log, read once.
      const logs = new Map<string, HookEvent[]>();
      const events = (id: string) => {
        const read = logs.get(id) ?? readHookEvents(ctx.paths.events, id);
        logs.set(id, read);
        return read;
      };
      const records = new Map<string, ImpactRecord>();
      for (const id of new Set([
        ...entries.flatMap((e) => (e.session ? [e.session] : [])),
        ...receipts.flatMap((r) => (r.receipt.session ? [r.receipt.session] : [])),
      ])) {
        const record = found.get(id);
        if (!record) continue;
        const state = record.agent === 'terminal' ? undefined : AGENTS[record.agent].hookState;
        records.set(id, {
          id,
          name: sessionLabel(record),
          project: projectLabel(record.project),
          prompts: promptTimes(record, events(id)),
          ended: Boolean(record.endedAt),
          hookStates: state
            ? events(id).flatMap((e) => {
                const s = parentHook(e) && state(e.event, e.payload);
                return s ? [{ at: e.at, state: s }] : [];
              })
            : [],
        });
      }
      return impactReport({
        days,
        since,
        ...filter,
        entries,
        receipts,
        records,
      });
    },
  };
}
