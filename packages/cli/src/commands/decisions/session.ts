import type { DecisionStatus } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { SESSION_FLAG } from '../../input/flags.js';
import { columns } from '../../output/columns.js';

// A session's decision assistance: how each site runs for it, turning it off or back on, and its
// goal's ready answer.

const seconds = (ms: number) => `${ms / 1000} s`;

function statusText(status: DecisionStatus) {
  const sites = status.sites.map((s) => [
    s.site,
    s.mode === 'on-demand' ? 'on demand (experimental)' : s.mode,
    s.acceptAt === undefined ? '' : `accepts at margin ${s.acceptAt}`,
  ]);
  const use = status.use.map((u) => [
    u.at,
    u.site,
    u.status,
    u.cached ? 'ready answer' : `${u.latencyMs} ms`,
    u.reason ?? '',
  ]);
  return [
    `session ${status.session} (${status.project}), model ${status.model}${status.off ? ', off for this session' : ''}`,
    ...columns(sites),
    `deadlines ${seconds(status.deadlines.automatic)} per turn, ${seconds(status.deadlines['on-demand'])} on demand; ${status.ready} ready answers`,
    ...(use.length ? columns(use) : ['no decision use yet']),
  ].join('\n');
}

export const decisionsStatus = defineCommand({
  name: 'decisions status',
  summary:
    "A Mesa session's decision assistance: each site off, on demand or automatic, the deadlines, and its recent use",
  flags: { session: SESSION_FLAG },
  example: 'mesa decisions status --session 4e1b9c02',
  run: ({ mesa, flags }) => {
    const status = mesa.decisions.status(flags.session);
    return { data: status, text: statusText(status) };
  },
});

export const decisionsOff = defineCommand({
  name: 'decisions off',
  summary: 'Turn decision assistance off for a Mesa session: no advice, no tool, no model call',
  flags: { session: SESSION_FLAG },
  example: 'mesa decisions off --session 4e1b9c02',
  run: ({ mesa, flags }) => {
    const data = mesa.decisions.setOff(true, flags.session);
    return { data, text: `decision assistance off for session ${data.session}` };
  },
});

export const decisionsOn = defineCommand({
  name: 'decisions on',
  summary: 'Turn decision assistance back on for a Mesa session',
  flags: { session: SESSION_FLAG },
  example: 'mesa decisions on --session 4e1b9c02',
  run: ({ mesa, flags }) => {
    const data = mesa.decisions.setOff(false, flags.session);
    return { data, text: `decision assistance on for session ${data.session}` };
  },
});

export const decisionsPrepare = defineCommand({
  name: 'decisions prepare',
  summary:
    "Ask for a Mesa session's goal advice ahead of its first turn, kept as a ready answer (run by its window as the agent starts)",
  flags: { session: SESSION_FLAG },
  example: 'mesa decisions prepare --session 4e1b9c02',
  run: async ({ mesa, flags }) => {
    const data = await mesa.decisions.prepare(flags.session);
    return {
      data,
      text: data.prepared
        ? `ready answer for session ${data.session}: ${data.evaluation?.status}`
        : `no ready answer for session ${data.session}: ${data.reason ?? data.evaluation?.reason ?? 'unavailable'}`,
    };
  },
});
