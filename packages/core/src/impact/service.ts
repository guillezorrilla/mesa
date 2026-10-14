import { existsSync } from 'node:fs';
import { AGENTS } from '../agents/agents.js';
import type { MesaContext } from '../context.js';
import { DAY_MS } from '../lib/time.js';
import { findProject } from '../projects/projects.js';
import { listReceipts } from '../receipts/store.js';
import { projectLabel } from '../sessions/record/general.js';
import type { SessionRecord } from '../sessions/record/record.js';
import { parentHook, readHookEvents } from '../sessions/signals/hook-events.js';
import { type ImpactRecord, impactReport } from './report.js';

// Impact for one profile (`mesa impact`, the Impact screen): the Decision log, the vault's receipts
// and the session records of the last `days` days, for the profile, one project or one session.

export type ImpactOptions = { days?: number; project?: string; session?: string };

/** Only the receipts that can hold a vault write are read. */
const WRITE_KINDS = new Set(['capture', 'vault-change', 'decision']);

export function impactService(ctx: MesaContext) {
  return {
    report: ({ days = 7, project, session }: ImpactOptions = {}) => {
      // An unknown project or session is not_found, naming it.
      if (project) findProject(ctx.open(), project);
      if (session) ctx.store.get(session);
      const since = new Date(ctx.clock().getTime() - days * DAY_MS).toISOString();
      const filter = { ...(project ? { project } : {}), ...(session ? { session } : {}) };
      const entries = ctx.decisionLog.read({ since: new Date(since), ...filter });
      const vault = ctx.configIfAny()?.vault;
      const receipts =
        vault && existsSync(vault)
          ? listReceipts(vault, Number.POSITIVE_INFINITY, filter).filter(
              ({ receipt }) =>
                receipt.profile === ctx.profile &&
                receipt.started >= since &&
                WRITE_KINDS.has(receipt.kind ?? ''),
            )
          : [];
      const found = new Map<string, SessionRecord>(ctx.store.list().map((r) => [r.id, r]));
      const events = (id: string) => readHookEvents(ctx.paths.events, id);
      const records = new Map<string, ImpactRecord>();
      for (const id of new Set([
        ...entries.flatMap((e) => (e.session ? [e.session] : [])),
        ...receipts.flatMap((r) => (r.receipt.session ? [r.receipt.session] : [])),
      ])) {
        const record = found.get(id);
        if (!record) continue;
        const prompts = [
          ...record.events.flatMap((e) => (e.type === 'send' ? [e.at] : [])),
          ...events(id).flatMap((e) => (e.event === 'UserPromptSubmit' ? [e.at] : [])),
        ].sort();
        records.set(id, {
          id,
          name: record.name ?? record.agentName ?? id,
          project: projectLabel(record.project),
          prompts,
        });
      }
      return impactReport({
        days,
        since,
        ...filter,
        entries,
        receipts,
        records,
        hookStates: (id) => {
          const agent = found.get(id)?.agent;
          const state = agent && agent !== 'terminal' ? AGENTS[agent].hookState : undefined;
          return state
            ? events(id).flatMap((e) => {
                const s = parentHook(e) && state(e.event, e.payload);
                return s ? [{ at: e.at, state: s }] : [];
              })
            : [];
        },
      });
    },
  };
}
