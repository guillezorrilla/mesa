import {
  additionalLabel,
  agentCrewRow,
  agentRow,
  attentionScore,
  contextPercent,
  duration,
  isRun,
  MesaError,
  percent,
  projectLabel,
  type SessionControls,
  sessionBranch,
  sessionLabel,
  VIEWS,
  type View,
  waitingOn,
} from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const sessions = defineCommand({
  name: 'sessions',
  summary:
    'List the sessions, foreign ones too, by attention: agent (a headless one says run), state (and whether it is unread), confidence, attention, context use (ctx), running time, last output (or what a queued one waits on, or, with --archived, when it was archived)',
  args: ['id?'],
  flags: {
    children: {
      type: 'boolean',
      description:
        "With an id, that session's crew: each child with its state, branch, newest report (kind, at, first lines) and +added -removed",
    },
    all: { type: 'boolean', description: 'Include sessions stopped more than a day ago' },
    archived: {
      type: 'boolean',
      description: 'Only archived sessions, newest archive first, each with archivedAt',
    },
    tree: {
      type: 'boolean',
      description: 'Children under their parent, indented; --json adds each row its depth',
    },
    full: {
      type: 'boolean',
      description:
        "With --json inside a session's window, every field of each row, not the agent view",
    },
  },
  example: 'mesa sessions --tree',
  run: async ({ mesa, flags, args }) => {
    // An agent in a session's window reads a few fields a row (agent-view.ts); everyone else all.
    const agentView = !flags.full && mesa.sessions.agentReads();
    if (args.id !== undefined || flags.children) {
      if (!args.id || !flags.children || flags.all || flags.archived || flags.tree)
        throw new MesaError('usage', 'list a crew with mesa sessions <id> --children');
      const crew = await mesa.sessions.crew(args.id);
      const text = crew.length
        ? columns(
            crew.map((s) => [
              sessionLabel(s),
              s.lastState.state,
              s.branch ?? '-',
              s.diff ? `+${s.diff.added} -${s.diff.removed}` : '-',
              s.report
                ? `${s.report.kind} ${s.report.at}: ${s.report.message.split('\n').slice(0, 2).join(' ')}`
                : 'no report yet',
            ]),
          ).join('\n')
        : `session ${args.id} has no children; start one with mesa worker`;
      return { data: agentView ? crew.map(agentCrewRow) : crew, text };
    }
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
    return { data: agentView ? rows.map(agentRow) : rows, text };
  },
});

export const sessionsView = defineCommand({
  name: 'sessions view',
  summary:
    'Switch a Claude Code or Codex session between Structured and Terminal view: its agent stops and the conversation resumes in the same window; mid-turn it is refused unless --interrupt',
  args: ['session', 'view'],
  flags: {
    interrupt: { type: 'boolean', description: 'Mid-turn, interrupt the agent and switch' },
  },
  example: 'mesa sessions view a1b2c3d4 structured',
  run: async ({ mesa, args, flags }) => {
    const to = args.view as View;
    if (!VIEWS.includes(to)) throw new MesaError('usage', `view must be ${VIEWS.join(' or ')}`);
    const recorded = await mesa.sessions.switchView(args.session, to, {
      interrupt: flags.interrupt,
    });
    const { record, switched } = recorded.result;
    return recordedOutput(recorded, {
      data: { ...record, switched },
      text: switched ? `switched ${record.id} to ${to} view` : `${record.id} is in ${to} view`,
    });
  },
});

/** A session's controls on one line: model, effort, mode, as its agent confirmed them. */
const controlsText = (c: SessionControls) =>
  `${c.session}: ${[
    c.model ?? 'model unknown',
    c.effortQueued ? `effort ${c.effortQueued} after this turn` : c.effort && `effort ${c.effort}`,
    c.mode && `mode ${c.mode}`,
  ]
    .filter(Boolean)
    .join(', ')}`;

export const sessionsControls = defineCommand({
  name: 'sessions controls',
  summary:
    "Show a Structured session's model, effort and permission mode as its agent confirmed them, what each takes, and its last /usage reply",
  args: ['session'],
  example: 'mesa sessions controls a1b2c3d4',
  run: async ({ mesa, args }) => {
    const data = mesa.sessions.controls(args.session);
    return { data, text: [controlsText(data), data.usage].filter(Boolean).join('\n') };
  },
});

export const sessionsModel = defineCommand({
  name: 'sessions model',
  summary:
    "Change a Structured session's model and effort while it runs: Claude Code confirms at once, Codex takes them from its next turn",
  args: ['session', 'model?'],
  flags: { effort: { type: 'string', description: "The effort level, one of the agent's" } },
  example: 'mesa sessions model a1b2c3d4 opus --effort high',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.setControls(args.session, {
      ...(args.model === undefined ? {} : { model: args.model }),
      ...(flags.effort === undefined ? {} : { effort: flags.effort }),
    });
    return recordedOutput(recorded, { data: recorded.result, text: controlsText(recorded.result) });
  },
});

export const sessionsMode = defineCommand({
  name: 'sessions mode',
  summary: "Change a Structured Claude Code session's permission mode while it runs",
  args: ['session', 'mode'],
  example: 'mesa sessions mode a1b2c3d4 plan',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.setControls(args.session, { mode: args.mode });
    return recordedOutput(recorded, { data: recorded.result, text: controlsText(recorded.result) });
  },
});
