import {
  additionalLabel,
  attentionScore,
  contextPercent,
  duration,
  isRun,
  MesaError,
  percent,
  projectLabel,
  sessionBranch,
  sessionLabel,
  waitingOn,
} from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const sessions = defineCommand({
  name: 'sessions',
  summary:
    'List the sessions, foreign ones too, by attention: agent (a headless one says run), state (and whether it is unread), confidence, attention, context use (ctx), running time, last output (or what a queued one waits on, or, with --archived, when it was archived)',
  flags: {
    all: { type: 'boolean', description: 'Include sessions stopped more than a day ago' },
    archived: {
      type: 'boolean',
      description: 'Only archived sessions, newest archive first, each with archivedAt',
    },
    tree: {
      type: 'boolean',
      description: 'Children under their parent, indented; --json adds each row its depth',
    },
  },
  example: 'mesa sessions --tree',
  run: async ({ mesa, flags }) => {
    if (flags.all && flags.archived)
      throw new MesaError('usage', 'pass --all or --archived, not both');
    const scope = flags.archived ? 'archived' : flags.all ? 'all' : 'board';
    const rows = flags.tree ? await mesa.sessions.tree(scope) : await mesa.sessions.list(scope);
    // Only --tree rows carry a depth.
    const indent = (s: object) =>
      '  '.repeat('depth' in s && typeof s.depth === 'number' ? s.depth : 0);
    const text = rows.length
      ? columns(
          rows.map((s) => [
            // A name a person gave it stands in for the id; --json keeps both.
            `${indent(s)}${sessionLabel(s)}`,
            sessionBranch(s)
              ? `${[projectLabel(s.project), additionalLabel(s)].filter(Boolean).join(' ')} (${sessionBranch(s)})`
              : s.project
                ? projectLabel(s.project)
                : '-',
            // A headless run says so, as the Board's badge does.
            isRun(s) ? `${s.agent} (run)` : s.agent,
            s.managed && s.unread ? `${s.lastState.state} (unread)` : s.lastState.state,
            percent(s.lastState.confidence),
            attentionScore(s.attention),
            // Its context use, labelled, as the columns have no header.
            `ctx ${s.managed && s.context ? `${contextPercent(s.context.used)}%` : '-'}`,
            duration(s.runningSeconds),
            !s.managed
              ? 'not managed by mesa'
              : flags.archived && s.archivedAt
                ? `archived ${s.archivedAt}`
                : s.lastState.state === 'queued'
                  ? waitingOn(s.after)
                  : (s.lastOutput ?? ''),
          ]),
        ).join('\n')
      : flags.archived
        ? 'no archived sessions'
        : 'no sessions; run mesa open <project>';
    return { data: rows, text };
  },
});
