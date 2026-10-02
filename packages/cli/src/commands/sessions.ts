import {
  attentionScore,
  contextPercent,
  duration,
  isRun,
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
    'List the sessions, foreign ones too, by attention: agent (a headless one says run), state, confidence, attention, context use (ctx), running time, last output (or what a queued one waits on)',
  flags: {
    all: { type: 'boolean', description: 'Include sessions stopped more than a day ago' },
    tree: {
      type: 'boolean',
      description: 'Children under their parent, indented; --json adds each row its depth',
    },
    'no-adapter': {
      type: 'boolean',
      description: "Never wait on Faro's adapter: unsure states keep their last answer",
    },
  },
  example: 'mesa sessions --tree',
  run: async ({ mesa, flags }) => {
    const all = flags.all ?? false;
    const opts = { adapter: !flags['no-adapter'] };
    const rows = flags.tree
      ? await mesa.sessions.tree(all, opts)
      : await mesa.sessions.list(all, opts);
    // Only --tree rows carry a depth.
    const indent = (s: object) =>
      '  '.repeat('depth' in s && typeof s.depth === 'number' ? s.depth : 0);
    const text = rows.length
      ? columns(
          rows.map((s) => [
            // A name a person gave it stands in for the id; --json keeps both.
            `${indent(s)}${sessionLabel(s)}`,
            sessionBranch(s)
              ? `${projectLabel(s.project)} (${sessionBranch(s)})`
              : s.project
                ? projectLabel(s.project)
                : '-',
            // A headless run says so, as the Board's badge does.
            isRun(s) ? `${s.agent} (run)` : s.agent,
            s.lastState.state,
            percent(s.lastState.confidence),
            attentionScore(s.attention),
            // Its context use, labelled, as the columns have no header.
            `ctx ${s.managed && s.context ? `${contextPercent(s.context.used)}%` : '-'}`,
            duration(s.runningSeconds),
            !s.managed
              ? 'not managed by mesa'
              : s.lastState.state === 'queued'
                ? waitingOn(s.after)
                : (s.lastOutput ?? ''),
          ]),
        ).join('\n')
      : 'no sessions; run mesa open <project>';
    return { data: rows, text };
  },
});
