import { duration, EXIT_CODES, listPrice } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../guards.js';
import { recordedOutput } from '../output/recorded.js';

export const run = defineCommand({
  name: 'run',
  summary:
    'Run a skill headlessly on a project in a new tmux window, once the guardrail allows its prompt, wait for it, and print its result, agent session id, and cost when available; exits 1 when the run is not ok',
  // The skill's own words go after `--`; the agent owns its invocation syntax.
  args: ['skill', 'args...'],
  flags: {
    project: { type: 'string', description: 'The registered project to run it on' },
    session: {
      type: 'string',
      description:
        'Read this session output log; use its project, and write session-summary to wiki/sessions/<id>.md',
    },
    agent: {
      type: 'string',
      description: 'claude or codex; default: the project mesa.yaml, else the profile default',
    },
    timeout: {
      type: 'string',
      description:
        'Seconds to wait before its window is closed and it fails with timeout (default 1200, 20 minutes)',
    },
    force: { type: 'boolean', description: 'Run past a guardrail block or ask' },
    yes: {
      type: 'boolean',
      description: 'Run past a guardrail ask (a strict project) without asking y/N',
    },
  },
  example: 'mesa run session-summary --session a1b2c3d4',
  run: async ({ mesa, args, flags, confirm }) => {
    const recorded = await mesa.sessions.run(args.skill, {
      project: flags.project,
      session: flags.session,
      agent: flags.agent,
      args: args.args,
      timeoutSeconds:
        flags.timeout === undefined ? undefined : wholeNumber(flags.timeout, '--timeout'),
      force: flags.force,
      yes: flags.yes,
      confirm,
    });
    const r = recorded.result;
    const how = r.ok ? 'done' : `failed (${r.reason})`;
    const took = duration(Math.round(r.durationMs / 1000));
    const about = `${how}: session ${r.session}, agent session ${r.agentSessionId}, ${took}${listPrice(r.costUsd)}`;
    const text = r.output ? `${r.output}\n${about}` : about;
    return { ...recordedOutput(recorded, { data: r, text }), code: r.ok ? 0 : EXIT_CODES.internal };
  },
});
